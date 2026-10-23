/**
 * Smart Traffic Ambulance — Central Configuration Module
 * 
 * Defines fixed hospitals, fixed junctions, system thresholds,
 * Firebase credentials, and routing endpoints.
 */

// =====================================================
// FIXED HOSPITALS
// Coordinates remain fixed during standard operation.
// =====================================================
export const HOSPITALS = [
  {
    id: "H1",
    name: "Demo Hospital A",
    latitude: 11.0206146,
    longitude: 76.9334139
  },
  {
    id: "H2",
    name: "Demo Hospital B",
    latitude: 11.019335,
    longitude: 76.938563
  },
  {
    id: "H3",
    name: "Demo Hospital C",
    latitude: 11.017290,
    longitude: 76.9352481
  }
];

// =====================================================
// FIXED TRAFFIC JUNCTIONS
// Coordinates remain fixed and do not alter as vehicle moves.
// =====================================================
export const JUNCTIONS = [
  {
    id: "J1",
    name: "Junction 1",
    latitude: 11.017328,
    longitude: 76.934561
  },
  {
    id: "J2",
    name: "Junction 2",
    latitude: 11.018562,
    longitude: 76.934487
  },
  {
    id: "J3",
    name: "Junction 3",
    latitude: 11.019188,
    longitude: 76.934478
  },
  {
    id: "J4",
    name: "Junction 4",
    latitude: 11.017930,
    longitude: 76.935116
  }
];

// =====================================================
// OPERATIONAL THRESHOLDS & VERIFICATION RULES
// =====================================================
export const THRESHOLDS = {
  // Junction corridor detection: max perpendicular distance from road polyline
  JUNCTION_ROUTE_RADIUS: 50,          // 50 metres

  // Passed junction buffer: distance vehicle must move beyond junction to mark PASSED
  JUNCTION_PASSED_ROUTE_BUFFER: 8,    // 8 metres (strict immediate passing)

  // Priority zone: distance along road route at which green priority activates
  PRIORITY_DISTANCE: 100,             // 100 metres

  // Maximum acceptable raw GPS accuracy before discarding reading
  MAX_RAW_GPS_ACCURACY: 40,           // 40 metres

  // Required accuracy of multi-fix stabilized position before GPS READY
  REQUIRED_STABILIZED_ACCURACY: 25,   // 25 metres

  // Number of recent good fixes collected for stabilization filter
  GPS_FIX_WINDOW_SIZE: 5,             // 5 fixes (minimum 3 required)

  // Maximum allowable distance between ambulance coordinate and OSRM snapped road
  ROAD_SNAP_MAX_DISTANCE: 30,         // 30 metres

  // Controlled route recalculation distance threshold
  ROUTE_RECALCULATE_DISTANCE: 25,     // 25 metres moved

  // Minimum time interval between automatic route recalculations
  ROUTE_RECALCULATE_INTERVAL: 10000,  // 10,000 ms (10 seconds)

  // Inactivity timeout before marking GPS data as stale and halting priority
  GPS_STALE_AFTER: 15000              // 15,000 ms (15 seconds)
};

// =====================================================
// FIREBASE REALTIME DATABASE CONFIGURATION
// Active project credentials for smart-traffic-ambalance
// =====================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDtZaALGEdyZpwgHlgGVd1AYfmOhi6dZ0",
  authDomain: "smart-traffic-ambalance.firebaseapp.com",
  databaseURL: "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-traffic-ambalance",
  storageBucket: "smart-traffic-ambalance.firebasestorage.app",
  messagingSenderId: "220308583511",
  appId: "1:220308583511:web:4433f941507bcda83f9f12",
  measurementId: "G-D64VYM5TGJ"
};

// =====================================================
// ROUTING & API ENDPOINTS
// =====================================================
export const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

// Initial demo coordinates for default dashboard map view
export const DEFAULT_INITIAL_LOCATION = {
  latitude: 11.016850,
  longitude: 76.934650,
  accuracy: 14,
  rawAccuracy: 14,
  timestamp: Date.now(),
  active: false,
  source: "browser-live",
  reliable: true
};
