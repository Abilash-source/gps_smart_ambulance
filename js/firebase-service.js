/**
 * Smart Traffic Ambulance — Firebase Realtime Database Service
 * 
 * Manages real-time data synchronization with Firebase RTDB:
 * - /ambulance: vehicle telemetry and GPS source
 * - /junctionPriority: active command state and per-junction statuses
 * - /junctionDevices: hardware ESP32 heartbeats and online indicators
 * - .info/connected: connection state detection
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { FIREBASE_CONFIG } from "./config.js";

export class FirebaseService {
  constructor() {
    this.app = null;
    this.database = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  /**
   * Initializes Firebase Realtime Database connection.
   */
  initialize() {
    try {
      this.app = initializeApp(FIREBASE_CONFIG);
      this.database = getDatabase(this.app);
      console.log("[FirebaseService] Initialized with database:", FIREBASE_CONFIG.databaseURL);
      return true;
    } catch (err) {
      console.error("[FirebaseService] Initialization failed:", err);
      return false;
    }
  }

  /**
   * Monitors Firebase network connection status.
   * @param {(connected: boolean) => void} onStatusChange
   */
  monitorConnection(onStatusChange) {
    if (!this.database) return;
    const connectedRef = ref(this.database, ".info/connected");
    onValue(connectedRef, (snapshot) => {
      this.isConnected = snapshot.val() === true;
      if (onStatusChange) {
        onStatusChange(this.isConnected);
      }
    });
  }

  /**
   * Publishes ambulance location telemetry to /ambulance.
   * 
   * @param {{
   *   latitude: number,
   *   longitude: number,
   *   accuracy: number,
   *   rawAccuracy: number,
   *   stabilized: boolean,
   *   timestamp: number,
   *   active: boolean,
   *   mode: string,
   *   sessionId?: string
   * }} telemetry
   */
  async publishAmbulanceLocation(telemetry) {
    if (!this.database) return false;
    try {
      const ambulanceRef = ref(this.database, "ambulance");
      await set(ambulanceRef, {
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy: telemetry.accuracy,
        rawAccuracy: telemetry.rawAccuracy || telemetry.accuracy,
        stabilized: Boolean(telemetry.stabilized),
        timestamp: telemetry.timestamp || Date.now(),
        active: Boolean(telemetry.active),
        mode: telemetry.mode || "browser-live",
        sessionId: telemetry.sessionId || "web-session-1"
      });
      return true;
    } catch (err) {
      console.warn("[FirebaseService] Failed to publish ambulance location:", err);
      return false;
    }
  }

  /**
   * Listens for remote ambulance telemetry (from physical NEO-6M ESP32 or another phone).
   * @param {(data: object) => void} callback
   */
  subscribeToAmbulance(callback) {
    if (!this.database) return;
    const ambulanceRef = ref(this.database, "ambulance");
    onValue(ambulanceRef, (snapshot) => {
      const data = snapshot.val();
      if (data && callback) {
        callback(data);
      }
    });
  }

  /**
   * Publishes junction priority state to /junctionPriority.
   * 
   * @param {{
   *   activeJunctionId: string | null,
   *   nextJunctionId: string | null,
   *   status: string,
   *   states: Record<string, { status: string, timestamp: number }>,
   *   version: number,
   *   timestamp: number
   * }} payload
   */
  async publishJunctionPriority(payload) {
    if (!this.database) return false;
    try {
      const priorityRef = ref(this.database, "junctionPriority");
      await set(priorityRef, {
        activeJunctionId: payload.activeJunctionId,
        nextJunctionId: payload.nextJunctionId,
        status: payload.status,
        states: payload.states,
        version: payload.version || 1,
        timestamp: payload.timestamp || Date.now()
      });
      return true;
    } catch (err) {
      console.warn("[FirebaseService] Failed to publish junction priority:", err);
      return false;
    }
  }

  /**
   * Listens for junction priority changes.
   * @param {(data: object) => void} callback
   */
  subscribeToJunctionPriority(callback) {
    if (!this.database) return;
    const priorityRef = ref(this.database, "junctionPriority");
    onValue(priorityRef, (snapshot) => {
      const data = snapshot.val();
      if (data && callback) {
        callback(data);
      }
    });
  }

  /**
   * Monitors physical ESP32 junction hardware heartbeats from /junctionDevices.
   * Used to display online/offline status for physical boards on the dashboard.
   * 
   * @param {(devices: Record<string, { online: boolean, lastSeen: number, mode: string }>) => void} callback
   */
  subscribeToJunctionDevices(callback) {
    if (!this.database) return;
    const devicesRef = ref(this.database, "junctionDevices");
    onValue(devicesRef, (snapshot) => {
      const devices = snapshot.val() || {};
      if (callback) {
        callback(devices);
      }
    });
  }
}
