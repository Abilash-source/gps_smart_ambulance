/**
 * Smart Traffic Ambulance — Master Application Orchestrator
 * 
 * Coordinates:
 * - GPS acquisition & filtering (Browser / NEO-6M ESP32)
 * - OSRM road route calculation & validation
 * - Fixed junction corridor detection (50m) & sequential ordering
 * - Next-junction tracking & passing confirmation (8m buffer)
 * - Single-junction priority management (100m)
 * - Real-time Firebase database synchronization
 * - Virtual Serial Monitor output matching hardware UART
 */

import { HOSPITALS, JUNCTIONS, THRESHOLDS, DEFAULT_INITIAL_LOCATION } from "./config.js";
import { GpsStabilizer, BrowserGpsTracker } from "./gps-service.js";
import { fetchDrivingRoute, shouldRecalculateRoute } from "./routing-service.js";
import { JunctionManager } from "./junction-manager.js";
import { PriorityManager } from "./priority-manager.js";
import { FirebaseService } from "./firebase-service.js";
import { DashboardUI } from "./dashboard-ui.js";
import { calculateHeading } from "./route-projection.js";

// =====================================================
// MODULE INSTANCES
// =====================================================
const ui = new DashboardUI();
const gpsStabilizer = new GpsStabilizer();
const junctionManager = new JunctionManager();
const priorityManager = new PriorityManager();
const firebaseService = new FirebaseService();

let browserTracker = null;

// Application State
let currentAmbulanceLocation = { ...DEFAULT_INITIAL_LOCATION };
let selectedHospital = HOSPITALS[0];
let currentRouteData = null;
let lastRouteOrigin = null;
let lastRouteCalculatedAt = 0;
let isRouteCalculating = false;
let currentHeading = 0;

// Simulation State
let isSimulating = false;
let simInterval = null;
let simIndex = 0;

// =====================================================
// APPLICATION INITIALIZATION
// =====================================================
function init() {
  console.log("==================================================");
  console.log("Smart Traffic Ambulance Priority System Initializing");
  console.log("==================================================");

  // 1. Initialize UI & Leaflet Map
  ui.initializeMap(handleManualMapClick);
  ui.populateHospitalDropdown(handleHospitalSelection);

  // 2. Initialize Firebase Realtime Database
  const fbOk = firebaseService.initialize();
  if (fbOk) {
    firebaseService.monitorConnection((connected) => {
      const fbStatusEl = document.getElementById("firebaseStatus");
      if (fbStatusEl) {
        fbStatusEl.textContent = connected ? "CONNECTED" : "DISCONNECTED";
        fbStatusEl.className = `status ${connected ? "live" : "stopped"}`;
      }
      ui.logToSerialMonitor(`[FIREBASE] Connection status: ${connected ? "ONLINE" : "OFFLINE"}`);
    });

    // Listen for remote hardware GPS (NEO-6M ESP32) or remote phone telemetry
    firebaseService.subscribeToAmbulance(handleRemoteAmbulanceUpdate);

    // Listen for junction device heartbeats
    firebaseService.subscribeToJunctionDevices((devices) => {
      Object.entries(devices).forEach(([id, dev]) => {
        ui.logToSerialMonitor(`[DEVICE] ${id} (${dev.mode || "ESP32"}) Heartbeat: ${dev.online ? "ONLINE" : "OFFLINE"}`);
      });
    });
  }

  // 3. Initialize Browser GPS Tracker
  browserTracker = new BrowserGpsTracker(handleIncomingGpsFix, handleGpsError);

  // 4. Attach Event Listeners
  attachEventListeners();

  // 5. Seed initial mock fixes so system starts in GPS READY at demo location
  seedInitialGpsFixes();

  // 6. Set default hospital and calculate initial route
  if (selectedHospital) {
    handleHospitalSelection(selectedHospital);
  }

  // 7. Freshness check watchdog (every 2 seconds)
  setInterval(checkGpsFreshness, 2000);

  ui.logToSerialMonitor("[SYSTEM] Dashboard & Core Priority Engine Ready @ 115200 baud");
}

// =====================================================
// GPS FIX PROCESSING & STABILIZATION (Section 7)
// =====================================================
function handleIncomingGpsFix(fix) {
  // Pass fix through strict reliability rules (40m raw limit, 25m stabilized target)
  const result = gpsStabilizer.processFix(fix);

  ui.updateGpsTelemetry(
    result.latitude,
    result.longitude,
    result.accuracy,
    result.rawAccuracy,
    result.state === "READY" ? "GPS READY" : result.state === "WAITING_BETTER_GPS" ? "WAITING FOR BETTER GPS" : "STABILIZING GPS",
    result.message,
    new Date(result.timestamp).toLocaleTimeString()
  );

  // If rejected by raw threshold, do not update ambulance position
  if (result.state === "WAITING_BETTER_GPS") {
    ui.setMessage(result.message);
    return;
  }

  // Calculate vehicle heading from previous position
  if (currentAmbulanceLocation && (result.latitude !== currentAmbulanceLocation.latitude || result.longitude !== currentAmbulanceLocation.longitude)) {
    currentHeading = calculateHeading(
      currentAmbulanceLocation.latitude,
      currentAmbulanceLocation.longitude,
      result.latitude,
      result.longitude
    );
  }

  // Update normalized ambulance location
  currentAmbulanceLocation = {
    latitude: result.latitude,
    longitude: result.longitude,
    accuracy: result.accuracy,
    rawAccuracy: result.rawAccuracy,
    stabilized: result.isReadyForRouting,
    timestamp: result.timestamp,
    active: true,
    source: fix.source || "browser-live",
    reliable: result.isReadyForRouting
  };

  // Update map marker
  ui.updateAmbulancePosition(
    result.latitude,
    result.longitude,
    result.accuracy,
    currentHeading,
    result.isReadyForRouting
  );

  // Publish to Firebase /ambulance
  firebaseService.publishAmbulanceLocation(currentAmbulanceLocation);

  // Evaluate route progress & junction priority
  if (currentRouteData && currentRouteData.geometry) {
    evaluateRouteAndPriority();

    // Check if controlled route recalculation is warranted (moved >= 25m AND >= 10s passed)
    if (shouldRecalculateRoute(lastRouteOrigin, currentAmbulanceLocation, lastRouteCalculatedAt)) {
      calculateRoadRoute(true);
    }
  }
}

function handleGpsError(err) {
  console.warn("[GpsTracker] Sensor error:", err.message);
  ui.updateGpsTelemetry(null, null, null, null, "GPS ERROR", err.message);
  ui.setMessage(`GPS sensor error: ${err.message}`);
  ui.logToSerialMonitor(`[GPS ERROR] ${err.message}`);
}

function handleRemoteAmbulanceUpdate(remoteData) {
  // Only ingest remote telemetry if local browser GPS tracker is inactive
  if (browserTracker.isActive() || isSimulating) return;

  if (remoteData && remoteData.active && remoteData.latitude && remoteData.longitude) {
    handleIncomingGpsFix({
      latitude: Number(remoteData.latitude),
      longitude: Number(remoteData.longitude),
      accuracy: Number(remoteData.accuracy) || 15,
      timestamp: remoteData.timestamp || Date.now(),
      source: remoteData.mode || "esp32-neo6m"
    });
  }
}

function checkGpsFreshness() {
  const { isStale, timeSinceLastFix } = gpsStabilizer.checkFreshness();
  if (isStale && browserTracker.isActive()) {
    ui.updateGpsTelemetry(
      currentAmbulanceLocation?.latitude,
      currentAmbulanceLocation?.longitude,
      currentAmbulanceLocation?.accuracy,
      currentAmbulanceLocation?.rawAccuracy,
      "GPS STALE",
      `STALE (>15s since last fix)`
    );
    ui.setMessage("GPS data is stale (>15 seconds without fix). Routing and priority paused.");
    ui.logToSerialMonitor("[GPS] Warning: Telemetry is stale (>15s)");
  }
}

// =====================================================
// OSRM ROUTE CALCULATION (Section 8)
// =====================================================
async function calculateRoadRoute(isAutomatic = false) {
  if (isRouteCalculating) return;
  if (!currentAmbulanceLocation || !currentAmbulanceLocation.reliable) {
    ui.setMessage("Wait for reliable GPS before calculating a road route.");
    return;
  }
  if (!selectedHospital) {
    ui.setMessage("Please select a destination hospital first.");
    return;
  }

  isRouteCalculating = true;
  ui.setMessage(isAutomatic ? "Recalculating route from new position..." : "Calculating OSRM road route...");

  const result = await fetchDrivingRoute(
    currentAmbulanceLocation.latitude,
    currentAmbulanceLocation.longitude,
    selectedHospital.latitude,
    selectedHospital.longitude
  );

  isRouteCalculating = false;

  if (result.success && result.route) {
    currentRouteData = result.route;
    lastRouteOrigin = { ...currentAmbulanceLocation };
    lastRouteCalculatedAt = Date.now();

    // Draw route geometry on map
    ui.drawRoadRoute(result.route.geometry);

    // Identify and order fixed junctions along the route (<= 50m)
    const matchedJunctions = junctionManager.analyzeRouteJunctions(result.route.geometry.coordinates);

    ui.logToSerialMonitor(`[ROUTING] Route calculated: ${result.route.distance}m • ETA: ${Math.round(result.route.duration / 60)} min`);
    ui.logToSerialMonitor(`[JUNCTIONS] Found ${matchedJunctions.length} fixed junctions within 50m corridor: ${matchedJunctions.map((j) => j.id).join(" -> ") || "None"}`);

    evaluateRouteAndPriority();

    ui.setMessage(`Route calculated to ${selectedHospital.name} (${(result.route.distance / 1000).toFixed(2)} km • Snap: ${result.route.roadSnappedDistance}m).`);
  } else {
    ui.setMessage(`Routing failed: ${result.errorMessage || "Unknown error"}`);
    ui.logToSerialMonitor(`[ROUTING ERROR] ${result.errorMessage}`);
  }
}

// =====================================================
// ROUTE PROGRESS & PRIORITY EVALUATION (Sections 9 & 10)
// =====================================================
function evaluateRouteAndPriority() {
  if (!currentRouteData || !currentRouteData.geometry) return;

  const routeCoords = currentRouteData.geometry.coordinates;

  // 1. Evaluate ambulance route position and check passed junctions (8m buffer)
  const evalResult = junctionManager.evaluateAmbulanceProgress(
    currentAmbulanceLocation.latitude,
    currentAmbulanceLocation.longitude,
    routeCoords
  );

  // Log newly passed junctions to Serial Monitor
  evalResult.justPassedJunctions.forEach((jid) => {
    ui.logToSerialMonitor(`[UART] ${jid} status: PASSED (Ambulance +8m beyond intersection)`);
    ui.logToSerialMonitor(`[UART] ${jid} [GPIO 25] RED: HIGH (Green Priority Released)`);
  });

  // 2. Evaluate single active junction priority
  const priorityPayload = priorityManager.evaluatePriority(
    evalResult.nextJunction,
    evalResult.distanceAlongRoute,
    junctionManager.getOrderedRouteJunctions(),
    junctionManager.getPassedJunctionIds(),
    currentAmbulanceLocation.reliable
  );

  // 3. Publish priority payload to Firebase /junctionPriority
  firebaseService.publishJunctionPriority(priorityPayload);

  // 4. Update UI markers and sequence display
  ui.updateJunctionMarkerStyles(
    priorityPayload.nextJunctionId,
    priorityPayload.activeJunctionId,
    junctionManager.getOrderedRouteJunctions(),
    junctionManager.getPassedJunctionIds()
  );

  ui.renderJunctionSequence(
    junctionManager.getOrderedRouteJunctions(),
    priorityPayload.nextJunctionId,
    priorityPayload.activePriorityJunctionId,
    junctionManager.getPassedJunctionIds(),
    selectedHospital?.name
  );

  ui.updateRouteMetrics(
    selectedHospital?.name,
    currentRouteData.distance,
    currentRouteData.duration,
    evalResult.nextJunction ? `${evalResult.nextJunction.id} — ${evalResult.nextJunction.name}` : "All Junctions Passed",
    evalResult.distanceAlongRoute,
    priorityPayload.status
  );

  // 5. Log status changes to Virtual Serial Monitor
  if (priorityPayload.activeJunctionId) {
    ui.logToSerialMonitor(`[UART] ${priorityPayload.activeJunctionId} status: PRIORITY_ACTIVE (Within 100m)`);
    ui.logToSerialMonitor(`[UART] ${priorityPayload.activeJunctionId} [GPIO 27] GREEN: HIGH (Emergency Corridor Cleared)`);
  } else if (priorityPayload.nextJunctionId) {
    ui.logToSerialMonitor(`[UART] ${priorityPayload.nextJunctionId} status: NEXT (${Math.round(evalResult.distanceAlongRoute)}m away)`);
  }
}

// =====================================================
// EVENT HANDLERS
// =====================================================
function handleHospitalSelection(hospital) {
  if (!hospital) return;
  selectedHospital = hospital;
  junctionManager.reset();
  priorityManager.reset();
  ui.clearRoadRoute();

  ui.setMessage(`Selected destination: ${hospital.name}. Click Calculate Route.`);
  ui.logToSerialMonitor(`[SYSTEM] Destination changed to: ${hospital.name} (${hospital.id})`);

  // Calculate route immediately if GPS is ready
  if (currentAmbulanceLocation && currentAmbulanceLocation.reliable) {
    calculateRoadRoute(false);
  }
}

function handleManualMapClick(lat, lon) {
  ui.logToSerialMonitor(`[MANUAL] Placed ambulance coordinate: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  handleIncomingGpsFix({
    latitude: lat,
    longitude: lon,
    accuracy: 12,
    timestamp: Date.now(),
    source: "manual-click"
  });
}

function attachEventListeners() {
  const startBtn = document.getElementById("startButton");
  const stopBtn = document.getElementById("stopButton");
  const routeBtn = document.getElementById("routeButton");
  const simBtn = document.getElementById("simButton");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      stopSimulation();
      const started = browserTracker.start();
      if (started) {
        startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        ui.setMessage("Requesting browser GPS with high precision...");
        ui.logToSerialMonitor("[GPS] navigator.geolocation.watchPosition() started");
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      browserTracker.stop();
      if (startBtn) startBtn.disabled = false;
      stopBtn.disabled = true;
      ui.updateGpsTelemetry(null, null, null, null, "STOPPED", "GPS stopped", "--");
      ui.setMessage("Live GPS tracking stopped.");
      ui.logToSerialMonitor("[GPS] Geolocation watch terminated");
      firebaseService.publishAmbulanceLocation({ ...currentAmbulanceLocation, active: false });
    });
  }

  if (routeBtn) {
    routeBtn.addEventListener("click", () => calculateRoadRoute(false));
  }

  if (simBtn) {
    simBtn.addEventListener("click", toggleSimulation);
  }
}

// =====================================================
// SIMULATION TRANSIT DRIVE (Section 13)
// =====================================================
function toggleSimulation() {
  if (isSimulating) {
    stopSimulation();
    ui.setMessage("Transit simulation paused.");
    return;
  }

  if (!currentRouteData || !currentRouteData.geometry || currentRouteData.geometry.coordinates.length < 2) {
    alert("Please calculate a road route first before running the drive simulator!");
    return;
  }

  // Stop phone GPS if active
  if (browserTracker.isActive()) {
    browserTracker.stop();
    const startBtn = document.getElementById("startButton");
    const stopBtn = document.getElementById("stopButton");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  isSimulating = true;
  simIndex = 0;
  junctionManager.reset();
  priorityManager.reset();

  const coords = currentRouteData.geometry.coordinates;
  const simBtn = document.getElementById("simButton");
  if (simBtn) simBtn.textContent = "⏸ Pause Simulation Drive";

  ui.logToSerialMonitor("[SIMULATOR] Starting transit drive along road route...");

  simInterval = setInterval(() => {
    if (simIndex >= coords.length) {
      stopSimulation();
      ui.setMessage("Ambulance arrived at destination hospital!");
      ui.logToSerialMonitor("[SIMULATOR] Trip completed: Arrived at hospital destination.");
      return;
    }

    const lon = coords[simIndex][0];
    const lat = coords[simIndex][1];

    handleIncomingGpsFix({
      latitude: lat,
      longitude: lon,
      accuracy: 10,
      timestamp: Date.now(),
      source: "simulated"
    });

    simIndex += 1;
  }, 350);
}

function stopSimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  isSimulating = false;
  const simBtn = document.getElementById("simButton");
  if (simBtn) simBtn.textContent = "🚗 Test Drive Route (Simulator)";
}

function seedInitialGpsFixes() {
  gpsStabilizer.processFix({ ...DEFAULT_INITIAL_LOCATION, accuracy: 14 });
  gpsStabilizer.processFix({ ...DEFAULT_INITIAL_LOCATION, latitude: DEFAULT_INITIAL_LOCATION.latitude + 0.00001, accuracy: 14 });
  const finalSeed = gpsStabilizer.processFix({ ...DEFAULT_INITIAL_LOCATION, accuracy: 14 });

  ui.updateGpsTelemetry(
    finalSeed.latitude,
    finalSeed.longitude,
    finalSeed.accuracy,
    finalSeed.rawAccuracy,
    "GPS READY",
    finalSeed.message,
    new Date().toLocaleTimeString()
  );

  ui.updateAmbulancePosition(finalSeed.latitude, finalSeed.longitude, finalSeed.accuracy, 0, true);
}

// Run on page load
window.addEventListener("DOMContentLoaded", init);
