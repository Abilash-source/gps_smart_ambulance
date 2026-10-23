/**
 * Smart Traffic Ambulance — OSRM Driving Routing Service
 * 
 * Fetches actual drivable road geometry from OSRM, enforces
 * longitude,latitude coordinate ordering, checks road-snap
 * distances (30m limit), and controls route recalculation intervals.
 */

import { OSRM_BASE_URL, THRESHOLDS } from "./config.js";
import { calculateHaversineDistance } from "./route-projection.js";

/**
 * Requests an actual road-based driving route between start and destination coordinates.
 * 
 * @param {number} startLat Ambulance latitude
 * @param {number} startLon Ambulance longitude
 * @param {number} destLat Hospital latitude
 * @param {number} destLon Hospital longitude
 * @returns {Promise<{
 *   success: boolean,
 *   route?: {
 *     distance: number,
 *     duration: number,
 *     geometry: { coordinates: Array<[number, number]> },
 *     roadSnappedDistance: number
 *   },
 *   errorMessage?: string
 * }>}
 */
export async function fetchDrivingRoute(startLat, startLon, destLat, destLon) {
  try {
    // IMPORTANT: OSRM coordinate order is: longitude,latitude
    const url = `${OSRM_BASE_URL}/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM service responded with HTTP status ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
      return {
        success: false,
        errorMessage: data.message || "OSRM returned no valid driving route for these points."
      };
    }

    const primaryRoute = data.routes[0];
    const roadSnapDist = data.waypoints?.[0]?.distance ?? 0;

    // Rule: Road snap distance threshold verification (<= 30 metres)
    if (roadSnapDist > THRESHOLDS.ROAD_SNAP_MAX_DISTANCE) {
      return {
        success: false,
        errorMessage: `Ambulance position is ${Math.round(roadSnapDist)}m from the nearest road (> 30m maximum allowed). Route rejected.`
      };
    }

    return {
      success: true,
      route: {
        distance: Math.round(primaryRoute.distance),
        duration: Math.round(primaryRoute.duration),
        geometry: primaryRoute.geometry, // GeoJSON coordinates: [[lon, lat], ...]
        roadSnappedDistance: Math.round(roadSnapDist * 10) / 10
      }
    };
  } catch (err) {
    const errorMsg = err.name === "AbortError" ? "OSRM routing request timed out." : err.message;
    return {
      success: false,
      errorMessage: errorMsg
    };
  }
}

/**
 * Checks whether controlled route recalculation criteria are satisfied (Section 11).
 * Recalculates ONLY if:
 * 1. Vehicle has moved at least 25 metres from previous origin.
 * 2. At least 10 seconds have elapsed since previous calculation.
 * 
 * @param {{ latitude: number, longitude: number } | null} lastOrigin
 * @param {{ latitude: number, longitude: number }} currentCoord
 * @param {number} lastCalculatedTimestamp
 * @returns {boolean}
 */
export function shouldRecalculateRoute(lastOrigin, currentCoord, lastCalculatedTimestamp) {
  if (!lastOrigin || !currentCoord) return false;

  const now = Date.now();
  const timeElapsed = now - lastCalculatedTimestamp;
  if (timeElapsed < THRESHOLDS.ROUTE_RECALCULATE_INTERVAL) {
    return false;
  }

  const distanceMoved = calculateHaversineDistance(
    lastOrigin.latitude,
    lastOrigin.longitude,
    currentCoord.latitude,
    currentCoord.longitude
  );

  return distanceMoved >= THRESHOLDS.ROUTE_RECALCULATE_DISTANCE;
}

/**
 * Formats route distance in metres to human-readable format.
 */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "--";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats duration in seconds into hours and minutes.
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return "< 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${minutes} min`;
}
