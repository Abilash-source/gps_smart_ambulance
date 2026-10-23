// =====================================================
// SMART TRAFFIC AMBULANCE - CORE ENGINE (REFINED)
// =====================================================
// Accurate OSRM Road Routing • Route-Aware Junction Detection
// Single Junction Priority (100m) • Passed Junction Memory (30m)
// Real-time Firebase Sync & Hardware ESP32 Compatibility
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// =====================================================
// FIREBASE CONFIGURATION
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyCDtZaALGEdyZpwgHlgGVd1AYfmOhi6dZ0",
    authDomain: "smart-traffic-ambalance.firebaseapp.com",
    databaseURL: "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smart-traffic-ambalance",
    storageBucket: "smart-traffic-ambalance.firebasestorage.app",
    messagingSenderId: "220308583511",
    appId: "1:220308583511:web:4433f941507bcda83f9f12",
    measurementId: "G-D64VYM5TGJ"
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
console.log("Firebase initialized successfully");

// =====================================================
// HTML UI ELEMENTS
// =====================================================
const gpsStatus = document.getElementById("gpsStatus");
const firebaseStatus = document.getElementById("firebaseStatus");
const latitudeElement = document.getElementById("latitude");
const longitudeElement = document.getElementById("longitude");
const accuracyElement = document.getElementById("accuracy");
const gpsReliabilityElement = document.getElementById("gpsReliability");
const lastUpdateElement = document.getElementById("lastUpdate");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const messageElement = document.getElementById("message");
const hospitalSelect = document.getElementById("hospitalSelect");
const routeButton = document.getElementById("routeButton");
const destinationNameElement = document.getElementById("destinationName");
const routeDistanceElement = document.getElementById("routeDistance");
const routeTimeElement = document.getElementById("routeTime");
const nextJunctionElement = document.getElementById("nextJunction");
const junctionDistanceElement = document.getElementById("junctionDistance");
const routeStatusElement = document.getElementById("routeStatus");
const junctionSequenceElement = document.getElementById("junctionSequence");

// =====================================================
// FIXED HOSPITALS (Coordinates never change)
// =====================================================
const hospitals = [
    { id: "H1", name: "Demo Hospital A", latitude: 11.0206146, longitude: 76.9334139 },
    { id: "H2", name: "Demo Hospital B", latitude: 11.019335,  longitude: 76.938563 },
    { id: "H3", name: "Demo Hospital C", latitude: 11.017290,  longitude: 76.9352481 }
];

// =====================================================
// FIXED TRAFFIC JUNCTIONS (Coordinates never change)
// =====================================================
const junctions = [
    { id: "J1", name: "Junction 1", latitude: 11.018563, longitude: 76.934374 },
    { id: "J2", name: "Junction 2", latitude: 11.019186, longitude: 76.934437 },
    { id: "J3", name: "Junction 3", latitude: 11.017374, longitude: 76.934561 },
    { id: "J4", name: "Junction 4", latitude: 11.017930, longitude: 76.935116 }
];

// Threshold Constants (Sections 7, 9, 10, 11)
const JUNCTION_ROUTE_RADIUS = 50;           // 50m perpendicular corridor limit
const JUNCTION_PASSED_ROUTE_BUFFER = 8;     // 8m passed buffer along route (per user requirement)
const PRIORITY_DISTANCE = 8;                // 8m priority trigger distance (Emergency signal opens 8m away)
const MAX_RAW_GPS_ACCURACY = 40;            // Max acceptable raw GPS accuracy
const REQUIRED_STABILIZED_ACCURACY = 25;    // Required stabilized accuracy
const GPS_FIX_WINDOW_SIZE = 5;
const ROAD_SNAP_MAX_DISTANCE = 30;          // Max distance from road for OSRM
const ROUTE_RECALCULATE_DISTANCE = 25;      // Moved >= 25m
const ROUTE_RECALCULATE_INTERVAL = 10000;   // >= 10s passed
const GPS_STALE_AFTER = 15000;              // 15 seconds stale timeout
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

// =====================================================
// APPLICATION STATE
// =====================================================
let lastAmbulanceRoutePosition = null;
let gpsWatchId = null;
let gpsSessionStarted = false;
let lastGpsTimestamp = null;
let map = null;
let ambulanceMarker = null;
let ambulanceAccuracyCircle = null;
let currentAmbulanceLocation = null;
let selectedHospital = null;
let routeLine = null;
let routeData = null;
let hospitalMarker = null;
let junctionMarkers = new Map();
let routeJunctions = [];
let passedJunctionIds = new Set();
let activePriorityJunctionId = null;
let acceptedGpsFixes = [];
let lastRouteOrigin = null;
let lastRouteCalculatedAt = 0;
let routeRequestInProgress = false;
let ambulanceLocationSource = null;

// Simulator state
let isSimulating = false;
let simInterval = null;
let simIndex = 0;

// =====================================================
// FIREBASE CONNECTION MONITORING
// =====================================================
const connectionRef = ref(database, ".info/connected");
onValue(connectionRef, (snapshot) => {
    if (snapshot.val() === true) {
        if (firebaseStatus) {
            firebaseStatus.textContent = "CONNECTED";
            firebaseStatus.className = "status live";
        }
    } else {
        if (firebaseStatus) {
            firebaseStatus.textContent = "DISCONNECTED";
            firebaseStatus.className = "status stopped";
        }
    }
});

// =====================================================
// GEODESIC DISTANCE (Haversine formula in meters)
// =====================================================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// =====================================================
// PROJECTION: Project point onto route polyline
// Returns perpendicular distance and cumulative route distance (meters)
// =====================================================
function projectPointOntoRoute(lat, lon, routeCoordinates) {
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) return null;

    let closestDistance = Number.POSITIVE_INFINITY;
    let bestRoutePosition = 0;
    let cumulativeDistance = 0;

    const latRad = (lat * Math.PI) / 180;
    const metersPerLat = 111320;
    const metersPerLon = 111320 * Math.cos(latRad);

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
        // OSRM GeoJSON coordinates are [lon, lat]
        const p1Lon = routeCoordinates[i][0];
        const p1Lat = routeCoordinates[i][1];
        const p2Lon = routeCoordinates[i + 1][0];
        const p2Lat = routeCoordinates[i + 1][1];

        const segLen = calculateHaversineDistance(p1Lat, p1Lon, p2Lat, p2Lon);

        const bx = (p2Lon - p1Lon) * metersPerLon;
        const by = (p2Lat - p1Lat) * metersPerLat;
        const px = (lon - p1Lon) * metersPerLon;
        const py = (lat - p1Lat) * metersPerLat;

        const segLenSq = bx * bx + by * by;
        let t = 0;
        if (segLenSq > 0) {
            t = (px * bx + py * by) / segLenSq;
            t = Math.max(0, Math.min(1, t));
        }

        const projX = t * bx;
        const projY = t * by;
        const perpDist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

        if (perpDist < closestDistance) {
            closestDistance = perpDist;
            bestRoutePosition = cumulativeDistance + t * segLen;
        }

        cumulativeDistance += segLen;
    }

    return {
        distanceToRoute: closestDistance,
        routePosition: bestRoutePosition
    };
}

// =====================================================
// GPS ACCURACY STABILIZATION (Section 7)
// Calculates weighted location and combined uncertainty
// =====================================================
function getStabilizedLocation() {
    if (acceptedGpsFixes.length < 3) return null;

    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let weightedAcc = 0;

    for (const fix of acceptedGpsFixes) {
        const w = 1 / Math.max(1, fix.accuracy * fix.accuracy);
        totalWeight += w;
        weightedLat += fix.latitude * w;
        weightedLon += fix.longitude * w;
        weightedAcc += fix.accuracy * w;
    }

    const meanLat = weightedLat / totalWeight;
    const meanLon = weightedLon / totalWeight;
    const baseAcc = weightedAcc / totalWeight;

    // Positional sample standard deviation in meters
    let dispersionSq = 0;
    for (const fix of acceptedGpsFixes) {
        const d = calculateHaversineDistance(meanLat, meanLon, fix.latitude, fix.longitude);
        dispersionSq += d * d;
    }
    const dispersion = Math.sqrt(dispersionSq / acceptedGpsFixes.length);

    // Stabilized accuracy reduces variance with consecutive readings
    const stabilizedAccuracy = Math.round((baseAcc * 0.7 + dispersion * 0.3) * 10) / 10;

    return {
        latitude: meanLat,
        longitude: meanLon,
        accuracy: Math.max(5, stabilizedAccuracy),
        rawAccuracy: acceptedGpsFixes[acceptedGpsFixes.length - 1].accuracy,
        timestamp: Date.now(),
        reliable: true
    };
}

// =====================================================
// ROUTE-AWARE JUNCTION ANALYSIS (Section 9)
// =====================================================
function analyzeRouteJunctions(routeCoordinates) {
    routeJunctions = junctions
        .map((junction) => {
            const projection = projectPointOntoRoute(junction.latitude, junction.longitude, routeCoordinates);
            if (!projection || projection.distanceToRoute > JUNCTION_ROUTE_RADIUS) {
                return null; // Reject junction if > 50m from road
            }
            return {
                ...junction,
                distanceToRoute: Math.round(projection.distanceToRoute * 10) / 10,
                routePosition: Math.round(projection.routePosition * 10) / 10
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.routePosition - b.routePosition);

    updateNextJunction();
}

// =====================================================
// NEXT JUNCTION & PRIORITY LOGIC (Section 10)
// =====================================================
function updateNextJunction() {
    if (!routeData || !currentAmbulanceLocation) return;

    const routeCoordinates = routeData.geometry.coordinates;

    // Project ambulance location onto the road route
    const ambulanceProjection = projectPointOntoRoute(
        currentAmbulanceLocation.latitude,
        currentAmbulanceLocation.longitude,
        routeCoordinates
    );

    if (!ambulanceProjection) return;

    // Advance ambulance route progress monotonically
    lastAmbulanceRoutePosition = Math.max(
        lastAmbulanceRoutePosition ?? 0,
        ambulanceProjection.routePosition
    );
    const currentRoutePosition = lastAmbulanceRoutePosition;

    // Check passed junctions: ambulance passed at least 30m beyond it along route
    routeJunctions.forEach((junction) => {
        if (
            !passedJunctionIds.has(junction.id) &&
            currentRoutePosition >= junction.routePosition + JUNCTION_PASSED_ROUTE_BUFFER
        ) {
            passedJunctionIds.add(junction.id);
            if (activePriorityJunctionId === junction.id) {
                activePriorityJunctionId = null;
            }
            console.log(`[JUNCTION PASSED] ${junction.id} - ${junction.name} (+8m cleared)`);
        }
    });

    // Find the first remaining unpassed junction along the route
    const remainingJunctions = routeJunctions.filter((j) => !passedJunctionIds.has(j.id));
    const nextJunction = remainingJunctions[0] || null;

    // Update sequence badges in UI
    renderJunctionSequence(remainingJunctions, nextJunction?.id);
    updateJunctionMarkerStyles(nextJunction?.id, activePriorityJunctionId);

    if (!nextJunction) {
        updateJunctionPriority(null, Number.POSITIVE_INFINITY, currentRoutePosition);
        if (nextJunctionElement) nextJunctionElement.textContent = "All Junctions Passed";
        if (junctionDistanceElement) junctionDistanceElement.textContent = "--";
        return;
    }

    // ACCURATE DISTANCE: distance along the road route to this junction
    const distanceAlongRoute = Math.max(0, nextJunction.routePosition - currentRoutePosition);

    if (nextJunctionElement) {
        nextJunctionElement.textContent = `${nextJunction.id} — ${nextJunction.name}`;
    }
    if (junctionDistanceElement) {
        junctionDistanceElement.textContent = formatRouteDistance(distanceAlongRoute);
    }

    updateJunctionPriority(nextJunction, distanceAlongRoute, currentRoutePosition);
}

// =====================================================
// WRITE JUNCTION PRIORITY TO FIREBASE (Section 4)
// =====================================================
function updateJunctionPriority(nextJunction, distanceAlongRoute, ambulanceRoutePosition) {
    if (activePriorityJunctionId && passedJunctionIds.has(activePriorityJunctionId)) {
        activePriorityJunctionId = null;
    }

    // Proximity trigger: within 8m of next junction along route
    if (nextJunction && distanceAlongRoute <= PRIORITY_DISTANCE) {
        activePriorityJunctionId = nextJunction.id;
    } else {
        activePriorityJunctionId = null;
    }

    const priorityText = activePriorityJunctionId
        ? `PRIORITY ACTIVE — ${activePriorityJunctionId}`
        : nextJunction
        ? `NEXT — ${nextJunction.id}`
        : "NORMAL";

    if (routeStatusElement) {
        routeStatusElement.textContent = priorityText;
        routeStatusElement.style.color = activePriorityJunctionId ? "#2e7d32" : nextJunction ? "#e65100" : "#555";
    }

    // Construct full state dictionary for all 4 fixed junctions
    const junctionStates = {};
    junctions.forEach((junction) => {
        const onRoute = routeJunctions.some((rj) => rj.id === junction.id);
        let status = "NOT_ON_ROUTE";

        // Passed junctions take precedence to immediately release green priority
        if (passedJunctionIds.has(junction.id)) {
            status = "PASSED";
        } else if (junction.id === activePriorityJunctionId) {
            status = "PRIORITY_ACTIVE";
        } else if (junction.id === nextJunction?.id) {
            status = "NEXT";
        } else if (onRoute) {
            status = "WAITING";
        }

        junctionStates[junction.id] = {
            status: status,
            timestamp: Date.now()
        };
    });

    const priorityPayload = {
        activeJunctionId: activePriorityJunctionId,
        nextJunctionId: nextJunction?.id || null,
        states: junctionStates,
        timestamp: Date.now()
    };

    set(ref(database, "junctionPriority"), priorityPayload).catch((err) =>
        console.warn("Firebase junctionPriority upload error:", err)
    );
}

// =====================================================
// RENDER STYLED JUNCTION SEQUENCE PILLS
// =====================================================
function renderJunctionSequence(remainingJunctions, nextId) {
    if (!junctionSequenceElement) return;

    if (!routeData) {
        junctionSequenceElement.innerHTML = `<span style="color:#777;">Select a hospital to calculate the route.</span>`;
        return;
    }

    if (routeJunctions.length === 0) {
        junctionSequenceElement.innerHTML = `<span style="color:#777;">No fixed junctions within 50m of this road route.</span>`;
        return;
    }

    let html = `<span class="sequence-item" style="background:#d32f2f;">🚑 Ambulance</span>`;

    routeJunctions.forEach((j) => {
        const isPassed = passedJunctionIds.has(j.id);
        const isNext = j.id === nextId;
        const isActive = j.id === activePriorityJunctionId;

        let bg = "#1976d2";
        let extra = "";

        if (isActive) {
            bg = "#2e7d32; box-shadow: 0 0 10px #2e7d32;";
            extra = " ⚡ GREEN";
        } else if (isNext) {
            bg = "#e65100";
            extra = " (NEXT)";
        } else if (isPassed) {
            bg = "#78909c; text-decoration: line-through;";
            extra = " ✓";
        }

        html += ` <span class="sequence-arrow">→</span> `;
        html += `<span class="sequence-item" style="background:${bg};">${j.id}${extra}</span>`;
    });

    html += ` <span class="sequence-arrow">→</span> `;
    html += `<span class="sequence-hospital">🏥 ${selectedHospital?.name || "Hospital"}</span>`;

    junctionSequenceElement.innerHTML = html;
}

// =====================================================
// CALCULATE ACTUAL ROAD ROUTE VIA OSRM (Section 8)
// =====================================================
async function calculateRoute(options = {}) {
    if (!map) return;
    if (!currentAmbulanceLocation || !currentAmbulanceLocation.reliable) {
        if (messageElement) messageElement.textContent = "Wait for reliable GPS before calculating route.";
        return;
    }
    if (!selectedHospital) {
        if (messageElement) messageElement.textContent = "Please select a destination hospital first.";
        return;
    }

    if (routeButton) routeButton.disabled = true;
    routeRequestInProgress = true;
    if (routeStatusElement) routeStatusElement.textContent = "CALCULATING...";
    if (messageElement) messageElement.textContent = "Requesting OSRM road route...";

    try {
        const ambLat = currentAmbulanceLocation.latitude;
        const ambLon = currentAmbulanceLocation.longitude;
        const hospLat = Number(selectedHospital.latitude);
        const hospLon = Number(selectedHospital.longitude);

        // Required OSRM coordinate order: longitude,latitude
        const osrmUrl = `${OSRM_BASE_URL}/${ambLon},${ambLat};${hospLon},${hospLat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(osrmUrl);
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

        const data = await res.json();
        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
            throw new Error(data.message || "No valid road route found.");
        }

        const route = data.routes[0];
        const snapDist = data.waypoints?.[0]?.distance ?? 0;

        // Road-snap validation (Section 8: maximum 30m)
        if (snapDist > ROAD_SNAP_MAX_DISTANCE) {
            throw new Error(`Nearest road is ${Math.round(snapDist)}m away (> 30m limit). Move closer to road.`);
        }

        routeData = {
            distance: route.distance,
            duration: route.duration,
            geometry: route.geometry,
            roadSnappedDistance: Math.round(snapDist * 10) / 10
        };

        lastRouteOrigin = { latitude: ambLat, longitude: ambLon };
        lastRouteCalculatedAt = Date.now();

        // Draw Route Line
        if (routeLine) {
            map.removeLayer(routeLine);
        }
        routeLine = L.geoJSON(route.geometry, {
            style: { color: "#1976d2", weight: 6, opacity: 0.85 }
        }).addTo(map);

        updateHospitalMarker(selectedHospital);

        if (!options.automatic) {
            map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        }

        // Update UI
        if (destinationNameElement) destinationNameElement.textContent = selectedHospital.name;
        if (routeDistanceElement) routeDistanceElement.textContent = formatRouteDistance(route.distance);
        if (routeTimeElement) routeTimeElement.textContent = formatRouteTime(route.duration);
        if (routeStatusElement) routeStatusElement.textContent = "ROUTE READY";

        // Analyze and sequence fixed junctions
        analyzeRouteJunctions(route.geometry.coordinates);

        if (messageElement) {
            messageElement.textContent = `Road route ready to ${selectedHospital.name} (${formatRouteDistance(route.distance)} • Snap: ${routeData.roadSnappedDistance}m).`;
        }
    } catch (err) {
        console.error("OSRM Route Error:", err);
        clearRoute();
        if (messageElement) messageElement.textContent = `Route error: ${err.message}`;
        if (routeStatusElement) routeStatusElement.textContent = "ROUTE ERROR";
    } finally {
        if (routeButton) routeButton.disabled = false;
        routeRequestInProgress = false;
    }
}

// Controlled Recalculation Check (Section 11)
function shouldRecalculateRoute() {
    if (!routeData || !lastRouteOrigin || !currentAmbulanceLocation || routeRequestInProgress) return false;
    if (Date.now() - lastRouteCalculatedAt < ROUTE_RECALCULATE_INTERVAL) return false;

    const d = calculateHaversineDistance(
        lastRouteOrigin.latitude,
        lastRouteOrigin.longitude,
        currentAmbulanceLocation.latitude,
        currentAmbulanceLocation.longitude
    );
    return d >= ROUTE_RECALCULATE_DISTANCE;
}

function requestControlledRouteRecalculation() {
    if (shouldRecalculateRoute()) {
        calculateRoute({ automatic: true });
    }
}

// =====================================================
// LIVE PHONE GPS (navigator.geolocation.watchPosition)
// =====================================================
function startGPS() {
    if (gpsWatchId !== null) return;
    if (!navigator.geolocation) {
        if (messageElement) messageElement.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    gpsSessionStarted = true;
    ambulanceLocationSource = "browser";
    lastGpsTimestamp = null;
    currentAmbulanceLocation = null;
    acceptedGpsFixes = [];
    setGpsReliability("ACQUIRING...", "#b26a00");

    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    if (gpsStatus) {
        gpsStatus.textContent = "ACQUIRING...";
        gpsStatus.className = "status connecting";
    }

    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const rawLat = Number(pos.coords.latitude);
            const rawLon = Number(pos.coords.longitude);
            const rawAcc = Number(pos.coords.accuracy);

            lastGpsTimestamp = Date.now();

            // Section 7 Rule: Reject raw fix if accuracy > 40m
            if (!Number.isFinite(rawAcc) || rawAcc > MAX_RAW_GPS_ACCURACY) {
                if (accuracyElement) accuracyElement.textContent = `${Math.round(rawAcc)} m`;
                if (gpsStatus) {
                    gpsStatus.textContent = "WAITING FOR BETTER GPS";
                    gpsStatus.className = "status stopped";
                }
                setGpsReliability(`REJECTED (${Math.round(rawAcc)}m > 40m max)`, "#c62828");
                if (messageElement) {
                    messageElement.textContent = `Raw GPS ${Math.round(rawAcc)}m is unreliable. Move outdoors (≤ 40m needed).`;
                }
                return;
            }

            acceptedGpsFixes.push({ latitude: rawLat, longitude: rawLon, accuracy: rawAcc, timestamp: Date.now() });
            acceptedGpsFixes = acceptedGpsFixes.slice(-GPS_FIX_WINDOW_SIZE);

            const stab = getStabilizedLocation();
            if (!stab || stab.accuracy > REQUIRED_STABILIZED_ACCURACY) {
                if (gpsStatus) {
                    gpsStatus.textContent = "STABILIZING GPS";
                    gpsStatus.className = "status connecting";
                }
                setGpsReliability(`STABILIZING (${acceptedGpsFixes.length}/3 good fixes)`, "#b26a00");
                return;
            }

            // GPS IS READY!
            currentAmbulanceLocation = stab;

            if (latitudeElement) latitudeElement.textContent = stab.latitude.toFixed(6);
            if (longitudeElement) longitudeElement.textContent = stab.longitude.toFixed(6);
            if (accuracyElement) accuracyElement.textContent = `${Math.round(stab.accuracy)} m (raw: ${Math.round(rawAcc)}m)`;
            if (lastUpdateElement) lastUpdateElement.textContent = new Date().toLocaleTimeString();
            if (gpsStatus) {
                gpsStatus.textContent = "GPS READY";
                gpsStatus.className = "status live";
            }
            setGpsReliability(`READY (±${Math.round(stab.accuracy)}m)`, "#2e7d32");

            updateAmbulanceMarker(stab.latitude, stab.longitude, stab.accuracy);

            if (routeData && routeJunctions.length > 0) {
                updateNextJunction();
            }
            requestControlledRouteRecalculation();

            // Upload telemetry to Firebase /ambulance path
            set(ref(database, "ambulance"), {
                latitude: stab.latitude,
                longitude: stab.longitude,
                accuracy: stab.accuracy,
                rawAccuracy: rawAcc,
                stabilized: true,
                timestamp: Date.now(),
                active: true,
                mode: "browser-live"
            }).catch((err) => console.warn("Firebase /ambulance upload error:", err));
        },
        (err) => {
            console.error("Geolocation watch error:", err);
            if (gpsStatus) {
                gpsStatus.textContent = "GPS ERROR";
                gpsStatus.className = "status stopped";
            }
            if (messageElement) messageElement.textContent = `GPS error: ${err.message}`;
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

function stopGPS() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    gpsSessionStarted = false;
    acceptedGpsFixes = [];
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    if (gpsStatus) {
        gpsStatus.textContent = "STOPPED";
        gpsStatus.className = "status stopped";
    }
    setGpsReliability("STOPPED", "#777");
    set(ref(database, "ambulance/active"), false).catch(() => {});
}

// Remote Telemetry Listener: sync from other mobile phone or ESP32 NEO-6M
onValue(ref(database, "ambulance"), (snapshot) => {
    const data = snapshot.val();
    if (data && data.active && !gpsSessionStarted && !isSimulating) {
        currentAmbulanceLocation = {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            accuracy: Number(data.accuracy),
            reliable: true
        };
        if (latitudeElement) latitudeElement.textContent = Number(data.latitude).toFixed(6);
        if (longitudeElement) longitudeElement.textContent = Number(data.longitude).toFixed(6);
        if (accuracyElement) accuracyElement.textContent = `${Math.round(data.accuracy)} m`;
        if (gpsStatus) {
            gpsStatus.textContent = `REMOTE (${data.mode})`;
            gpsStatus.className = "status live";
        }
        updateAmbulanceMarker(data.latitude, data.longitude, data.accuracy);
        if (routeData) updateNextJunction();
    }
});

// Freshness watchdog (15s timeout)
setInterval(() => {
    if (gpsSessionStarted && lastGpsTimestamp && Date.now() - lastGpsTimestamp > GPS_STALE_AFTER) {
        if (gpsStatus) {
            gpsStatus.textContent = "GPS STALE";
            gpsStatus.className = "status stopped";
        }
        setGpsReliability("STALE (>15s timeout)", "#c62828");
        if (messageElement) messageElement.textContent = "GPS data is stale (>15s). Routing halted.";
    }
}, 2000);

// =====================================================
// SIMULATED TRANSIT DRIVE (For Testing on Localhost)
// =====================================================
function toggleSimulation() {
    if (isSimulating) {
        clearInterval(simInterval);
        isSimulating = false;
        if (messageElement) messageElement.textContent = "Simulation paused.";
        return;
    }

    if (!routeData || !routeData.geometry || routeData.geometry.coordinates.length < 2) {
        alert("Please select a hospital and click Calculate Route first!");
        return;
    }

    isSimulating = true;
    simIndex = 0;
    passedJunctionIds.clear();
    lastAmbulanceRoutePosition = 0;
    activePriorityJunctionId = null;

    const coords = routeData.geometry.coordinates; // [lon, lat]

    simInterval = setInterval(() => {
        if (simIndex >= coords.length) {
            clearInterval(simInterval);
            isSimulating = false;
            if (messageElement) messageElement.textContent = "Ambulance arrived at destination hospital!";
            return;
        }

        const lon = coords[simIndex][0];
        const lat = coords[simIndex][1];

        currentAmbulanceLocation = {
            latitude: lat,
            longitude: lon,
            accuracy: 12,
            rawAccuracy: 12,
            timestamp: Date.now(),
            reliable: true
        };

        if (latitudeElement) latitudeElement.textContent = lat.toFixed(6);
        if (longitudeElement) longitudeElement.textContent = lon.toFixed(6);
        if (accuracyElement) accuracyElement.textContent = "12 m (Simulated)";
        if (gpsStatus) {
            gpsStatus.textContent = "SIMULATOR ACTIVE";
            gpsStatus.className = "status live";
        }
        setGpsReliability("SIMULATED DRIVE", "#2e7d32");

        updateAmbulanceMarker(lat, lon, 12);
        updateNextJunction();

        // Advance ~2 points per second
        simIndex += 1;
    }, 350);
}

// =====================================================
// LEAFLET MAP & CUSTOM VISUAL MARKERS
// =====================================================
function initializeMap() {
    if (typeof L === "undefined") return;

    map = L.map("map").setView([11.018000, 76.934700], 17);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    initializeJunctionMarkers();

    // Default ambulance location marker
    updateAmbulanceMarker(11.016850, 76.934650, 14);
}

function updateAmbulanceMarker(latitude, longitude, accuracy) {
    if (!map) return;
    const pos = [latitude, longitude];

    const ambulanceIcon = L.divIcon({
        html: `
            <div style="background:#d32f2f; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2.5px solid white; box-shadow:0 3px 10px rgba(0,0,0,0.5); font-size:18px;">
                🚑
            </div>
        `,
        className: "ambulance-div-icon",
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });

    if (!ambulanceMarker) {
        ambulanceMarker = L.marker(pos, { icon: ambulanceIcon, zIndexOffset: 1000 }).addTo(map);
        ambulanceAccuracyCircle = L.circle(pos, {
            radius: Math.max(accuracy, 5),
            color: "#d32f2f",
            fillColor: "#d32f2f",
            fillOpacity: 0.12,
            weight: 1.5
        }).addTo(map);
    } else {
        ambulanceMarker.setLatLng(pos);
        if (ambulanceAccuracyCircle) {
            ambulanceAccuracyCircle.setLatLng(pos);
            ambulanceAccuracyCircle.setRadius(Math.max(accuracy, 5));
        }
    }
}

function updateHospitalMarker(hospital) {
    if (!map || !hospital) return;
    const pos = [hospital.latitude, hospital.longitude];

    const hospIcon = L.divIcon({
        html: `
            <div style="background:#7b1fa2; color:white; padding:4px 8px; border-radius:6px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.4); font-size:12px; font-weight:bold; white-space:nowrap;">
                🏥 ${hospital.name}
            </div>
        `,
        className: "hospital-div-icon",
        iconSize: [120, 28],
        iconAnchor: [60, 14]
    });

    if (!hospitalMarker) {
        hospitalMarker = L.marker(pos, { icon: hospIcon }).addTo(map);
    } else {
        hospitalMarker.setLatLng(pos);
    }
}

function initializeJunctionMarkers() {
    if (!map) return;
    junctions.forEach((junction) => {
        const marker = L.circleMarker([junction.latitude, junction.longitude], {
            radius: 9,
            color: "#374151",
            fillColor: "#4b5563",
            fillOpacity: 0.9,
            weight: 2
        })
        .addTo(map)
        .bindTooltip(`<b>${junction.id}</b>`, { permanent: true, direction: "top", offset: [0, -10] });

        junctionMarkers.set(junction.id, marker);
    });
}

function updateJunctionMarkerStyles(nextJunctionId, activePriorityId) {
    junctions.forEach((junction) => {
        const marker = junctionMarkers.get(junction.id);
        if (!marker) return;

        const isPassed = passedJunctionIds.has(junction.id);
        const isActive = junction.id === activePriorityId;
        const isNext = junction.id === nextJunctionId;

        if (isActive) {
            marker.setStyle({ color: "#15803d", fillColor: "#22c55e", fillOpacity: 1, weight: 3 });
            marker.setRadius(13);
        } else if (isNext) {
            marker.setStyle({ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 1, weight: 2 });
            marker.setRadius(11);
        } else if (isPassed) {
            marker.setStyle({ color: "#64748b", fillColor: "#94a3b8", fillOpacity: 0.6, weight: 1.5 });
            marker.setRadius(7);
        } else {
            marker.setStyle({ color: "#374151", fillColor: "#4b5563", fillOpacity: 0.8, weight: 2 });
            marker.setRadius(8);
        }
    });
}

function clearRoute() {
    if (routeLine && map) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    routeData = null;
    lastRouteOrigin = null;
    lastRouteCalculatedAt = 0;
    routeJunctions = [];
    passedJunctionIds.clear();
    activePriorityJunctionId = null;
    lastAmbulanceRoutePosition = null;

    if (routeStatusElement) routeStatusElement.textContent = "NO ROUTE";
    if (routeDistanceElement) routeDistanceElement.textContent = "--";
    if (routeTimeElement) routeTimeElement.textContent = "--";
    if (nextJunctionElement) nextJunctionElement.textContent = "--";
    if (junctionDistanceElement) junctionDistanceElement.textContent = "--";
    renderJunctionSequence([]);
    updateJunctionMarkerStyles();

    // Reset Firebase priority states
    const resetStates = {};
    junctions.forEach((j) => (resetStates[j.id] = { status: "NORMAL", timestamp: Date.now() }));
    set(ref(database, "junctionPriority"), {
        activeJunctionId: null,
        nextJunctionId: null,
        states: resetStates,
        timestamp: Date.now()
    }).catch(() => {});
}

// Helpers
function formatRouteDistance(meters) {
    if (!Number.isFinite(meters)) return "--";
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
}

function formatRouteTime(seconds) {
    if (!Number.isFinite(seconds)) return "--";
    const mins = Math.round(seconds / 60);
    if (mins < 1) return "< 1 min";
    return `${mins} min`;
}

function setGpsReliability(text, color) {
    if (gpsReliabilityElement) {
        gpsReliabilityElement.textContent = text;
        gpsReliabilityElement.style.color = color;
    }
}

// =====================================================
// INITIALIZATION
// =====================================================
function init() {
    // Populate hospital select
    if (hospitalSelect) {
        hospitalSelect.innerHTML = '<option value="">Select Destination Hospital</option>';
        hospitals.forEach((h) => {
            const opt = document.createElement("option");
            opt.value = h.id;
            opt.textContent = `${h.name} (${h.id})`;
            hospitalSelect.appendChild(opt);
        });

        hospitalSelect.addEventListener("change", () => {
            const selected = hospitals.find((h) => h.id === hospitalSelect.value);
            if (selected) {
                selectedHospital = selected;
                if (destinationNameElement) destinationNameElement.textContent = selected.name;
                updateHospitalMarker(selected);
                clearRoute();
                // Set default initial location if none exists
                if (!currentAmbulanceLocation) {
                    currentAmbulanceLocation = {
                        latitude: 11.016850,
                        longitude: 76.934650,
                        accuracy: 14,
                        rawAccuracy: 14,
                        timestamp: Date.now(),
                        reliable: true
                    };
                    updateAmbulanceMarker(11.016850, 76.934650, 14);
                }
                if (messageElement) messageElement.textContent = `${selected.name} selected. Click Calculate Route.`;
            }
        });
    }

    if (startButton) startButton.addEventListener("click", startGPS);
    if (stopButton) stopButton.addEventListener("click", stopGPS);
    if (routeButton) routeButton.addEventListener("click", () => calculateRoute({ automatic: false }));

    // Add Simulation button into button-section if not present
    const btnSection = document.querySelector(".button-section");
    if (btnSection && !document.getElementById("simButton")) {
        const simBtn = document.createElement("button");
        simBtn.id = "simButton";
        simBtn.textContent = "🚗 Test Drive Route (Simulator)";
        simBtn.style.background = "#0284c7";
        simBtn.style.color = "white";
        simBtn.addEventListener("click", toggleSimulation);
        btnSection.appendChild(simBtn);
    }

    initializeMap();
}

window.addEventListener("DOMContentLoaded", init);
