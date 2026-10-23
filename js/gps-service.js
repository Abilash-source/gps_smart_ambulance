/**
 * Smart Traffic Ambulance — GPS Acquisition & Stabilization Service
 * 
 * Manages raw coordinate intake, accuracy threshold checks (40m limit),
 * rolling window stabilization (25m target), staleness watchdogs,
 * and unified data normalization for browser and hardware sources.
 */

import { THRESHOLDS } from "./config.js";
import { calculateHaversineDistance } from "./route-projection.js";

/**
 * Validates whether numeric latitude and longitude represent valid coordinates on Earth.
 */
export function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * GPS Stabilizer Class
 * 
 * Enforces Section 7 verification rules:
 * - Rejects raw readings with accuracy > 40m.
 * - Collects rolling window of up to 5 good fixes.
 * - Requires at least 3 valid fixes before authorizing GPS READY.
 * - Calculates weighted coordinates and spatial dispersion.
 * - Detects stale data after 15 seconds of inactivity.
 */
export class GpsStabilizer {
  constructor() {
    this.recentGoodFixes = [];
    this.lastFixTimestamp = 0;
    this.lastRawAccuracy = 0;
  }

  reset() {
    this.recentGoodFixes = [];
    this.lastFixTimestamp = 0;
    this.lastRawAccuracy = 0;
  }

  /**
   * Evaluates an incoming raw GPS coordinate against reliability criteria.
   * 
   * @param {{ latitude: number, longitude: number, accuracy: number, timestamp?: number, source?: string }} raw
   * @returns {{
   *   state: 'READY' | 'STABILIZING' | 'WAITING_BETTER_GPS' | 'STALE',
   *   message: string,
   *   latitude: number,
   *   longitude: number,
   *   accuracy: number,
   *   rawAccuracy: number,
   *   fixCount: number,
   *   isReadyForRouting: boolean,
   *   timestamp: number
   * }}
   */
  processFix(raw) {
    const timestamp = raw.timestamp || Date.now();
    this.lastFixTimestamp = timestamp;
    this.lastRawAccuracy = Math.round(Number(raw.accuracy) * 10) / 10;

    // Validate numerical coordinates
    if (!isValidCoordinate(raw.latitude, raw.longitude)) {
      return {
        state: "WAITING_BETTER_GPS",
        message: "Invalid GPS coordinates received",
        latitude: raw.latitude || 0,
        longitude: raw.longitude || 0,
        accuracy: 999,
        rawAccuracy: this.lastRawAccuracy,
        fixCount: this.recentGoodFixes.length,
        isReadyForRouting: false,
        timestamp
      };
    }

    // Rule 1: Reject raw readings worse than MAX_RAW_GPS_ACCURACY (40 metres)
    if (!Number.isFinite(raw.accuracy) || raw.accuracy > THRESHOLDS.MAX_RAW_GPS_ACCURACY) {
      const currentAvg = this.computeWeightedAverage();
      return {
        state: "WAITING_BETTER_GPS",
        message: `WAITING FOR BETTER GPS (Raw: ${this.lastRawAccuracy}m > 40m limit)`,
        latitude: currentAvg.latitude || raw.latitude,
        longitude: currentAvg.longitude || raw.longitude,
        accuracy: currentAvg.accuracy,
        rawAccuracy: this.lastRawAccuracy,
        fixCount: this.recentGoodFixes.length,
        isReadyForRouting: false,
        timestamp
      };
    }

    // Add accepted fix
    this.recentGoodFixes.push({
      latitude: Number(raw.latitude),
      longitude: Number(raw.longitude),
      accuracy: Number(raw.accuracy),
      timestamp
    });

    // Keep bounded rolling window of last N fixes (default: 5)
    if (this.recentGoodFixes.length > THRESHOLDS.GPS_FIX_WINDOW_SIZE) {
      this.recentGoodFixes.shift();
    }

    const { latitude, longitude, accuracy: stabilizedAccuracy } = this.computeWeightedAverage();

    // Rule 2: Minimum good fixes requirement (minimum 3)
    if (this.recentGoodFixes.length < 3) {
      return {
        state: "STABILIZING",
        message: `STABILIZING GPS (${this.recentGoodFixes.length}/3 good fixes collected)`,
        latitude,
        longitude,
        accuracy: stabilizedAccuracy,
        rawAccuracy: this.lastRawAccuracy,
        fixCount: this.recentGoodFixes.length,
        isReadyForRouting: false,
        timestamp
      };
    }

    // Rule 3: Required stabilized accuracy threshold (<= 25 metres)
    if (stabilizedAccuracy > THRESHOLDS.REQUIRED_STABILIZED_ACCURACY) {
      return {
        state: "STABILIZING",
        message: `KEEP STABILIZING (Stabilized: ${stabilizedAccuracy}m > 25m target)`,
        latitude,
        longitude,
        accuracy: stabilizedAccuracy,
        rawAccuracy: this.lastRawAccuracy,
        fixCount: this.recentGoodFixes.length,
        isReadyForRouting: false,
        timestamp
      };
    }

    // All validation criteria satisfied
    return {
      state: "READY",
      message: `GPS READY (±${stabilizedAccuracy}m stabilized)`,
      latitude,
      longitude,
      accuracy: stabilizedAccuracy,
      rawAccuracy: this.lastRawAccuracy,
      fixCount: this.recentGoodFixes.length,
      isReadyForRouting: true,
      timestamp
    };
  }

  /**
   * Computes inverse-variance weighted position and combined uncertainty.
   */
  computeWeightedAverage() {
    if (this.recentGoodFixes.length === 0) {
      return { latitude: 0, longitude: 0, accuracy: 999 };
    }

    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let weightedAcc = 0;

    for (const fix of this.recentGoodFixes) {
      // Weight proportional to inverse of variance (1 / accuracy^2)
      const w = 1 / Math.max(1, fix.accuracy * fix.accuracy);
      totalWeight += w;
      weightedLat += fix.latitude * w;
      weightedLon += fix.longitude * w;
      weightedAcc += fix.accuracy * w;
    }

    const meanLat = weightedLat / totalWeight;
    const meanLon = weightedLon / totalWeight;
    const baseAcc = weightedAcc / totalWeight;

    // Spatial dispersion (sample standard deviation in metres)
    let dispersionSq = 0;
    for (const fix of this.recentGoodFixes) {
      const d = calculateHaversineDistance(meanLat, meanLon, fix.latitude, fix.longitude);
      dispersionSq += d * d;
    }
    const dispersion = Math.sqrt(dispersionSq / this.recentGoodFixes.length);

    // Multi-fix stabilization reduces sensor uncertainty
    const stabilizedAccuracy = Math.round((baseAcc * 0.7 + dispersion * 0.3) * 10) / 10;

    return {
      latitude: meanLat,
      longitude: meanLon,
      accuracy: Math.max(5, stabilizedAccuracy)
    };
  }

  /**
   * Checks whether telemetry has exceeded the freshness timeout (15s).
   */
  checkFreshness(currentTime = Date.now()) {
    if (this.lastFixTimestamp === 0) {
      return { isStale: true, timeSinceLastFix: Infinity };
    }
    const elapsed = currentTime - this.lastFixTimestamp;
    const isStale = elapsed > THRESHOLDS.GPS_STALE_AFTER;
    return { isStale, timeSinceLastFix: elapsed };
  }
}

/**
 * Browser Geolocation API Manager
 */
export class BrowserGpsTracker {
  constructor(onFixCallback, onErrorCallback) {
    this.watchId = null;
    this.onFix = onFixCallback;
    this.onError = onErrorCallback;
  }

  start() {
    if (this.watchId !== null) return false;
    if (!("geolocation" in navigator)) {
      if (this.onError) this.onError(new Error("Geolocation is not supported by this browser."));
      return false;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (this.onFix) {
          this.onFix({
            latitude: Number(pos.coords.latitude),
            longitude: Number(pos.coords.longitude),
            accuracy: Number(pos.coords.accuracy),
            timestamp: pos.timestamp || Date.now(),
            source: "browser-live"
          });
        }
      },
      (err) => {
        if (this.onError) this.onError(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );

    return true;
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      return true;
    }
    return false;
  }

  isActive() {
    return this.watchId !== null;
  }
}
