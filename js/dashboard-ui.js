/**
 * Smart Traffic Ambulance — Dashboard UI & Leaflet Map Renderer
 * 
 * Renders the interactive Leaflet map, custom SVG ambulance markers,
 * visual traffic signal heads for junctions, route geometry,
 * sequential corridor badges, and virtual Serial Monitor outputs.
 */

import { HOSPITALS, JUNCTIONS, THRESHOLDS } from "./config.js";
import { formatDistance, formatDuration } from "./routing-service.js";

export class DashboardUI {
  constructor() {
    this.map = null;
    this.ambulanceMarker = null;
    this.accuracyCircle = null;
    this.routePolyline = null;
    this.hospitalMarkers = new Map();
    this.junctionMarkers = new Map();
    this.priorityZoneCircle = null;

    // UI Element references
    this.elements = {
      gpsStatus: document.getElementById("gpsStatus"),
      firebaseStatus: document.getElementById("firebaseStatus"),
      latitude: document.getElementById("latitude"),
      longitude: document.getElementById("longitude"),
      accuracy: document.getElementById("accuracy"),
      gpsReliability: document.getElementById("gpsReliability"),
      lastUpdate: document.getElementById("lastUpdate"),
      hospitalSelect: document.getElementById("hospitalSelect"),
      routeButton: document.getElementById("routeButton"),
      startButton: document.getElementById("startButton"),
      stopButton: document.getElementById("stopButton"),
      simButton: document.getElementById("simButton"),
      destinationName: document.getElementById("destinationName"),
      routeDistance: document.getElementById("routeDistance"),
      routeTime: document.getElementById("routeTime"),
      nextJunction: document.getElementById("nextJunction"),
      junctionDistance: document.getElementById("junctionDistance"),
      routeStatus: document.getElementById("routeStatus"),
      junctionSequence: document.getElementById("junctionSequence"),
      message: document.getElementById("message"),
      serialOutput: document.getElementById("serialOutput")
    };
  }

  /**
   * Initializes the Leaflet map and base layers.
   * @param {(lat: number, lon: number) => void} onMapClickCallback
   */
  initializeMap(onMapClickCallback) {
    if (typeof L === "undefined") {
      console.error("[DashboardUI] Leaflet library is not loaded.");
      return;
    }

    this.map = L.map("map").setView([11.018000, 76.934700], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(this.map);

    this.renderFixedHospitals();
    this.renderFixedJunctions();

    if (onMapClickCallback) {
      this.map.on("click", (e) => {
        onMapClickCallback(e.latlng.lat, e.latlng.lng);
      });
    }

    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 400);
  }

  /**
   * Populates hospital dropdown with fixed hospital options.
   * @param {(hospital: object) => void} onHospitalSelectCallback
   */
  populateHospitalDropdown(onHospitalSelectCallback) {
    const select = this.elements.hospitalSelect;
    if (!select) return;

    select.innerHTML = '<option value="">Select Destination Hospital</option>';
    HOSPITALS.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = `${h.name} (${h.id})`;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const selected = HOSPITALS.find((h) => h.id === select.value) || null;
      if (onHospitalSelectCallback) {
        onHospitalSelectCallback(selected);
      }
    });
  }

  /**
   * Renders fixed hospital markers on map.
   */
  renderFixedHospitals() {
    if (!this.map) return;

    HOSPITALS.forEach((h) => {
      const html = `
        <div style="background:#7b1fa2; color:white; padding:4px 8px; border-radius:6px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.4); font-size:11px; font-weight:bold; white-space:nowrap; display:flex; align-items:center; gap:4px;">
          <span>🏥</span> ${h.name}
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: "hospital-div-icon",
        iconSize: [120, 26],
        iconAnchor: [60, 13]
      });

      const marker = L.marker([h.latitude, h.longitude], { icon }).addTo(this.map);
      marker.bindPopup(`<b>🏥 ${h.name}</b><br>ID: ${h.id}<br>${h.latitude}, ${h.longitude}`);
      this.hospitalMarkers.set(h.id, marker);
    });
  }

  /**
   * Renders fixed junction markers on map with miniature traffic heads.
   */
  renderFixedJunctions() {
    if (!this.map) return;

    JUNCTIONS.forEach((j) => {
      const marker = L.circleMarker([j.latitude, j.longitude], {
        radius: 9,
        color: "#475569",
        fillColor: "#64748b",
        fillOpacity: 0.9,
        weight: 2
      })
      .addTo(this.map)
      .bindTooltip(`<b>${j.id}</b>`, { permanent: true, direction: "top", offset: [0, -10] })
      .bindPopup(`<b>${j.id} — ${j.name}</b><br>Coordinates: ${j.latitude.toFixed(6)}, ${j.longitude.toFixed(6)}`);

      this.junctionMarkers.set(j.id, marker);
    });
  }

  /**
   * Updates ambulance position, heading icon, and accuracy boundary.
   * 
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} accuracy
   * @param {number} [heading=0]
   * @param {boolean} [stabilized=true]
   */
  updateAmbulancePosition(latitude, longitude, accuracy, heading = 0, stabilized = true) {
    if (!this.map) return;
    const pos = [latitude, longitude];

    const html = `
      <div style="position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; inset:-4px; border-radius:50%; background:rgba(220,38,38,0.25); animation:pulse 1.5s infinite;"></div>
        <div style="
          transform: rotate(${Math.round(heading)}deg);
          transition: transform 0.2s ease-out;
          background:#dc2626; color:white; width:34px; height:34px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          border:2.5px solid white; box-shadow:0 3px 10px rgba(0,0,0,0.45); font-size:18px;
        ">
          🚑
        </div>
      </div>
    `;

    const icon = L.divIcon({
      html,
      className: "custom-ambulance-icon",
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (!this.ambulanceMarker) {
      this.ambulanceMarker = L.marker(pos, { icon, zIndexOffset: 1000 }).addTo(this.map);
      this.accuracyCircle = L.circle(pos, {
        radius: Math.max(accuracy, 5),
        color: stabilized ? "#16a34a" : "#d97706",
        fillColor: stabilized ? "#16a34a" : "#d97706",
        fillOpacity: 0.12,
        weight: 1.5
      }).addTo(this.map);
    } else {
      this.ambulanceMarker.setLatLng(pos);
      this.ambulanceMarker.setIcon(icon);
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(pos);
        this.accuracyCircle.setRadius(Math.max(accuracy, 5));
        this.accuracyCircle.setStyle({
          color: stabilized ? "#16a34a" : "#d97706",
          fillColor: stabilized ? "#16a34a" : "#d97706"
        });
      }
    }
  }

  /**
   * Draws the actual road route returned by OSRM on the Leaflet map.
   * @param {object} geojsonGeometry
   */
  drawRoadRoute(geojsonGeometry) {
    if (!this.map || !geojsonGeometry) return;

    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }

    this.routePolyline = L.geoJSON(geojsonGeometry, {
      style: {
        color: "#2563eb",
        weight: 6,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(this.map);

    const bounds = this.routePolyline.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  /**
   * Clears the route polyline from map.
   */
  clearRoadRoute() {
    if (this.routePolyline && this.map) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    if (this.priorityZoneCircle && this.map) {
      this.map.removeLayer(this.priorityZoneCircle);
      this.priorityZoneCircle = null;
    }
  }

  /**
   * Updates visual styling of fixed junction markers according to route & priority status.
   * 
   * - Grey: Not on route
   * - Blue: On route (WAITING)
   * - Orange: Next approaching junction (NEXT)
   * - Green Pulsating: Active green corridor (PRIORITY_ACTIVE)
   * - Muted Check: Passed junction (PASSED)
   * 
   * @param {string | null} nextJunctionId
   * @param {string | null} activePriorityId
   * @param {Array<object>} routeJunctions
   * @param {Set<string>} passedJunctionIds
   */
  updateJunctionMarkerStyles(nextJunctionId, activePriorityId, routeJunctions, passedJunctionIds) {
    JUNCTIONS.forEach((j) => {
      const marker = this.junctionMarkers.get(j.id);
      if (!marker) return;

      const isOnRoute = routeJunctions.some((rj) => rj.id === j.id);
      const isPassed = passedJunctionIds && passedJunctionIds.has(j.id);
      const isActive = j.id === activePriorityId;
      const isNext = j.id === nextJunctionId;

      if (isActive) {
        // Priority Active: Glowing Green Signal
        marker.setStyle({
          color: "#15803d",
          fillColor: "#22c55e",
          fillOpacity: 1,
          weight: 3
        });
        marker.setRadius(13);
      } else if (isNext) {
        // Next Approaching: Orange
        marker.setStyle({
          color: "#c2410c",
          fillColor: "#f97316",
          fillOpacity: 1,
          weight: 2.5
        });
        marker.setRadius(11);
      } else if (isPassed) {
        // Passed: Muted slate
        marker.setStyle({
          color: "#64748b",
          fillColor: "#94a3b8",
          fillOpacity: 0.6,
          weight: 1.5
        });
        marker.setRadius(7);
      } else if (isOnRoute) {
        // On route: Blue
        marker.setStyle({
          color: "#1d4ed8",
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          weight: 2
        });
        marker.setRadius(9);
      } else {
        // Not on route: Standard Grey
        marker.setStyle({
          color: "#475569",
          fillColor: "#64748b",
          fillOpacity: 0.8,
          weight: 2
        });
        marker.setRadius(8);
      }
    });

    // Update 100m priority threshold zone circle around NEXT junction
    const nextJunctionObj = routeJunctions.find((rj) => rj.id === nextJunctionId);
    if (nextJunctionObj && this.map) {
      const center = [nextJunctionObj.latitude, nextJunctionObj.longitude];
      if (!this.priorityZoneCircle) {
        this.priorityZoneCircle = L.circle(center, {
          radius: THRESHOLDS.PRIORITY_DISTANCE,
          color: "#16a34a",
          weight: 1.5,
          dashArray: "4, 4",
          fillColor: "#16a34a",
          fillOpacity: 0.08
        }).addTo(this.map);
      } else {
        this.priorityZoneCircle.setLatLng(center);
        this.priorityZoneCircle.setRadius(THRESHOLDS.PRIORITY_DISTANCE);
      }
    } else {
      if (this.priorityZoneCircle && this.map) {
        this.map.removeLayer(this.priorityZoneCircle);
        this.priorityZoneCircle = null;
      }
    }
  }

  /**
   * Renders sequential junction pills along the route (e.g., Ambulance → J3 → J1 → Hospital).
   * 
   * @param {Array<object>} routeJunctions Ordered junctions on route
   * @param {string | null} nextJunctionId
   * @param {string | null} activePriorityId
   * @param {Set<string>} passedJunctionIds
   * @param {string} destinationName
   */
  renderJunctionSequence(routeJunctions, nextJunctionId, activePriorityId, passedJunctionIds, destinationName) {
    const container = this.elements.junctionSequence;
    if (!container) return;

    if (!routeJunctions || routeJunctions.length === 0) {
      container.innerHTML = `<span style="color:#64748b; font-style:italic;">No fixed junctions detected within 50m of this road route.</span>`;
      return;
    }

    let html = `<span class="sequence-item" style="background:#dc2626;">🚑 Ambulance</span>`;

    routeJunctions.forEach((j) => {
      const isPassed = passedJunctionIds && passedJunctionIds.has(j.id);
      const isNext = j.id === nextJunctionId;
      const isActive = j.id === activePriorityId;

      let bg = "#2563eb";
      let label = j.id;

      if (isActive) {
        bg = "#16a34a; box-shadow: 0 0 10px rgba(22,163,74,0.6);";
        label += " ⚡ GREEN ACTIVE";
      } else if (isNext) {
        bg = "#ea580c;";
        label += " (NEXT)";
      } else if (isPassed) {
        bg = "#64748b; text-decoration:line-through; opacity:0.8;";
        label += " ✓ PASSED";
      }

      html += ` <span class="sequence-arrow">→</span> `;
      html += `<span class="sequence-item" style="background:${bg};">${label}</span>`;
    });

    html += ` <span class="sequence-arrow">→</span> `;
    html += `<span class="sequence-hospital">🏥 ${destinationName || "Destination"}</span>`;

    container.innerHTML = html;
  }

  /**
   * Updates GPS status badge and telemetry cards.
   */
  updateGpsTelemetry(lat, lon, accuracy, rawAccuracy, state, statusMsg, timeStr) {
    if (this.elements.latitude) this.elements.latitude.textContent = lat ? lat.toFixed(6) : "--";
    if (this.elements.longitude) this.elements.longitude.textContent = lon ? lon.toFixed(6) : "--";
    if (this.elements.accuracy) {
      this.elements.accuracy.textContent = accuracy ? `${Math.round(accuracy)} m (raw: ${Math.round(rawAccuracy || accuracy)}m)` : "--";
    }
    if (this.elements.lastUpdate) this.elements.lastUpdate.textContent = timeStr || new Date().toLocaleTimeString();

    if (this.elements.gpsStatus) {
      this.elements.gpsStatus.textContent = state;
      this.elements.gpsStatus.className = `status ${
        state === "GPS READY" || state.includes("READY") ? "live" : state.includes("STABILIZING") ? "connecting" : "stopped"
      }`;
    }

    if (this.elements.gpsReliability) {
      this.elements.gpsReliability.textContent = statusMsg;
      this.elements.gpsReliability.style.color =
        state === "GPS READY" ? "#16a34a" : state.includes("STABILIZING") ? "#d97706" : "#dc2626";
    }
  }

  /**
   * Updates route distance, ETA, and priority metrics in UI.
   */
  updateRouteMetrics(destName, distanceMeters, durationSeconds, nextJunctionName, distToJunction, priorityText) {
    if (this.elements.destinationName) this.elements.destinationName.textContent = destName || "--";
    if (this.elements.routeDistance) this.elements.routeDistance.textContent = formatDistance(distanceMeters);
    if (this.elements.routeTime) this.elements.routeTime.textContent = formatDuration(durationSeconds);
    if (this.elements.nextJunction) this.elements.nextJunction.textContent = nextJunctionName || "None";
    if (this.elements.junctionDistance) this.elements.junctionDistance.textContent = formatDistance(distToJunction);

    if (this.elements.routeStatus) {
      this.elements.routeStatus.textContent = priorityText || "NORMAL";
      this.elements.routeStatus.style.color = priorityText?.includes("PRIORITY ACTIVE")
        ? "#16a34a"
        : priorityText?.includes("NEXT")
        ? "#ea580c"
        : "#0f172a";
    }
  }

  /**
   * Displays readable system message in banner.
   */
  setMessage(msg) {
    if (this.elements.message) {
      this.elements.message.textContent = msg;
    }
  }

  /**
   * Logs an entry to the virtual Serial Monitor output in the dashboard.
   * @param {string} text
   */
  logToSerialMonitor(text) {
    const consoleBox = this.elements.serialOutput;
    if (!consoleBox) return;

    const time = new Date().toTimeString().split(" ")[0];
    const line = document.createElement("div");
    line.style.fontFamily = "ui-monospace, monospace";
    line.style.fontSize = "11px";
    line.style.lineHeight = "1.5";
    line.textContent = `${time} -> ${text}`;

    if (text.includes("PRIORITY_ACTIVE") || text.includes("GREEN")) {
      line.style.color = "#4ade80";
      line.style.fontWeight = "bold";
    } else if (text.includes("NEXT") || text.includes("YELLOW")) {
      line.style.color = "#fbbf24";
    } else if (text.includes("PASSED")) {
      line.style.color = "#94a3b8";
    } else {
      line.style.color = "#cbd5e1";
    }

    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }
}
