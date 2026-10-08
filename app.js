// =====================================================
// SMART TRAFFIC AMBULANCE
// =====================================================
// CURRENT STAGE:
// Firebase + Live Browser GPS + Leaflet + OSRM Routing
//
// FLOW:
// Live Browser GPS
//       ↓
// Firebase
//       ↓
// Select Fixed Hospital
//       ↓
// OSRM
//       ↓
// Actual Road Route
//       ↓
// Route Line on Leaflet
//       ↓
// Distance + Estimated Time
// =====================================================


// =====================================================
// FIREBASE IMPORTS
// =====================================================

import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    onValue
} from
    "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


// =====================================================
// FIREBASE CONFIGURATION
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyCDtZaALGEdyZpwgHlgGVd1AYfmOhi6dZ0",
    authDomain: "smart-traffic-ambalance.firebaseapp.com",
    databaseURL:
        "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smart-traffic-ambalance",
    storageBucket: "smart-traffic-ambalance.firebasestorage.app",
    messagingSenderId: "220308583511",
    appId: "1:220308583511:web:4433f941507bcda83f9f12",
    measurementId: "G-D64VYM5TGJ"
};


// =====================================================
// INITIALIZE FIREBASE
// =====================================================

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

console.log("Firebase initialized successfully");


// =====================================================
// HTML ELEMENTS
// =====================================================

const gpsStatus =
    document.getElementById("gpsStatus");

const firebaseStatus =
    document.getElementById("firebaseStatus");

const latitudeElement =
    document.getElementById("latitude");

const longitudeElement =
    document.getElementById("longitude");

const accuracyElement =
    document.getElementById("accuracy");

const gpsReliabilityElement =
    document.getElementById("gpsReliability");

const lastUpdateElement =
    document.getElementById("lastUpdate");

const startButton =
    document.getElementById("startButton");

const stopButton =
    document.getElementById("stopButton");

const messageElement =
    document.getElementById("message");

const hospitalSelect =
    document.getElementById("hospitalSelect");

const routeButton =
    document.getElementById("routeButton");

const destinationNameElement =
    document.getElementById("destinationName");

const routeDistanceElement =
    document.getElementById("routeDistance");

const routeTimeElement =
    document.getElementById("routeTime");

const nextJunctionElement =
    document.getElementById("nextJunction");

const junctionDistanceElement =
    document.getElementById("junctionDistance");

const routeStatusElement =
    document.getElementById("routeStatus");

const junctionSequenceElement =
    document.getElementById("junctionSequence");


// =====================================================
// APPLICATION VARIABLES
// =====================================================

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
let activePriorityJunctionId = null;
let acceptedGpsFixes = [];
let lastRouteOrigin = null;
let lastRouteCalculatedAt = 0;
let routeRequestInProgress = false;


// =====================================================
// FIXED HOSPITALS
// These coordinates never change.
// =====================================================

const hospitals = [
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
// These coordinates never change.
// =====================================================

const junctions = [
    {
        id: "J1",
        name: "Junction 1",
        latitude: 11.018563,
        longitude: 76.934374
    },
    {
        id: "J2",
        name: "Junction 2",
        latitude: 11.019186,
        longitude: 76.934437
    },
    {
        id: "J3",
        name: "Junction 3",
        latitude: 11.017374,
        longitude: 76.934561
    },
    {
        id: "J4",
        name: "Junction 4",
        latitude: 11.017930,
        longitude: 76.935116
    }
];

const JUNCTION_ROUTE_RADIUS = 50;
const JUNCTION_PASSED_ROUTE_BUFFER = 30;
const PRIORITY_DISTANCE = 100;
const MAX_RAW_GPS_ACCURACY = 40;
const REQUIRED_STABILIZED_ACCURACY = 25;
const GPS_FIX_WINDOW_SIZE = 5;
const ROAD_SNAP_MAX_DISTANCE = 30;
const ROUTE_RECALCULATE_DISTANCE = 25;
const ROUTE_RECALCULATE_INTERVAL = 10000;
const GPS_STALE_AFTER = 15000;


// =====================================================
// OSRM CONFIGURATION
// =====================================================

const OSRM_BASE_URL =
    "https://router.project-osrm.org/route/v1/driving";


// =====================================================
// INITIAL UI STATE
// =====================================================

function resetGPSDisplay() {

    if (gpsStatus) {
        gpsStatus.textContent = "WAITING FOR GPS";
        gpsStatus.className = "status stopped";
    }

    if (latitudeElement) {
        latitudeElement.textContent = "--";
    }

    if (longitudeElement) {
        longitudeElement.textContent = "--";
    }

    if (accuracyElement) {
        accuracyElement.textContent = "--";
    }

    if (lastUpdateElement) {
        lastUpdateElement.textContent = "--";
    }
}


// =====================================================
// RESET ROUTE INFORMATION
// =====================================================

function resetRouteDisplay() {

    if (destinationNameElement) {
        destinationNameElement.textContent = "--";
    }

    if (routeDistanceElement) {
        routeDistanceElement.textContent = "--";
    }

    if (routeTimeElement) {
        routeTimeElement.textContent = "--";
    }

    if (nextJunctionElement) {
        nextJunctionElement.textContent = "--";
    }

    if (junctionDistanceElement) {
        junctionDistanceElement.textContent = "--";
    }

    if (routeStatusElement) {
        routeStatusElement.textContent = "NO ROUTE";
    }

    if (junctionSequenceElement) {
        junctionSequenceElement.textContent = "--";
    }
}


// =====================================================
// FIREBASE CONNECTION STATUS
// =====================================================

const connectionRef =
    ref(database, ".info/connected");

onValue(
    connectionRef,
    (snapshot) => {

        if (snapshot.val() === true) {

            console.log(
                "Firebase database connected successfully"
            );

            if (firebaseStatus) {
                firebaseStatus.textContent = "CONNECTED";
                firebaseStatus.style.color = "green";
            }

        } else {

            console.log(
                "Firebase database disconnected"
            );

            if (firebaseStatus) {
                firebaseStatus.textContent = "DISCONNECTED";
                firebaseStatus.style.color = "red";
            }
        }
    }
);


// =====================================================
// INITIALIZE MAP
// =====================================================

function initializeMap() {

    if (typeof L === "undefined") {

        console.error("Leaflet is not loaded.");

        if (messageElement) {
            messageElement.textContent =
                "Leaflet failed to load.";
        }

        return;
    }

    map = L.map("map").setView(
        [11.018000, 76.934700],
        17
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 20,
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    initializeJunctionMarkers();

    console.log("Map initialized successfully");

    setTimeout(
        () => {
            if (map) {
                map.invalidateSize();
            }
        },
        500
    );
}


// =====================================================
// UPDATE AMBULANCE MARKER
// =====================================================

function updateAmbulanceMarker(
    latitude,
    longitude,
    accuracy
) {

    if (!map) {

        console.error("Map is not initialized.");
        return;
    }

    const position = [
        latitude,
        longitude
    ];

    if (!ambulanceMarker) {

        ambulanceMarker =
            L.marker(position)
                .addTo(map)
                .bindPopup("<b>🚑 Ambulance</b>");

        ambulanceAccuracyCircle =
            L.circle(
                position,
                {
                    radius: Math.max(accuracy, 1),
                    color: "#d32f2f",
                    fillColor: "#d32f2f",
                    fillOpacity: 0.15
                }
            ).addTo(map);

        map.setView(
            position,
            17
        );

        console.log(
            "Ambulance marker created."
        );

    } else {

        ambulanceMarker.setLatLng(
            position
        );

        if (ambulanceAccuracyCircle) {

            ambulanceAccuracyCircle.setLatLng(
                position
            );

            ambulanceAccuracyCircle.setRadius(
                Math.max(accuracy, 1)
            );
        }
    }
}


// =====================================================
// REMOVE AMBULANCE MARKER
// =====================================================

function removeAmbulanceMarker() {

    if (!map) {
        return;
    }

    if (ambulanceMarker) {

        map.removeLayer(
            ambulanceMarker
        );

        ambulanceMarker = null;
    }

    if (ambulanceAccuracyCircle) {

        map.removeLayer(
            ambulanceAccuracyCircle
        );

        ambulanceAccuracyCircle = null;
    }

    console.log(
        "Ambulance marker removed."
    );
}


// =====================================================
// DRAW / UPDATE HOSPITAL MARKER
// =====================================================

function updateHospitalMarker(hospital) {

    if (!map || !hospital) {
        return;
    }

    const position = [
        hospital.latitude,
        hospital.longitude
    ];

    if (!hospitalMarker) {

        hospitalMarker =
            L.marker(position)
                .addTo(map)
                .bindPopup(
                    `<b>🏥 ${hospital.name}</b>`
                );

    } else {

        hospitalMarker.setLatLng(position);

        hospitalMarker.bindPopup(
            `<b>🏥 ${hospital.name}</b>`
        );
    }
}


// =====================================================
// FIXED JUNCTION MARKERS
// =====================================================

function initializeJunctionMarkers() {

    if (!map) {
        return;
    }

    junctions.forEach(
        (junction) => {

            const marker =
                L.circleMarker(
                    [junction.latitude, junction.longitude],
                    {
                        radius: 8,
                        color: "#5f6368",
                        fillColor: "#5f6368",
                        fillOpacity: 0.9,
                        weight: 2
                    }
                )
                .addTo(map)
                .bindTooltip(
                    junction.id,
                    {
                        permanent: true,
                        direction: "top",
                        offset: [0, -8]
                    }
                )
                .bindPopup(
                    `<b>${junction.id}</b><br>${junction.name}`
                );

            junctionMarkers.set(junction.id, marker);
        }
    );
}


function updateJunctionMarkerStyles(nextJunctionId = null) {

    junctions.forEach(
        (junction) => {

            const marker = junctionMarkers.get(junction.id);

            if (!marker) {
                return;
            }

            const routeJunction =
                routeJunctions.find(
                    (item) => item.id === junction.id
                );

            if (junction.id === nextJunctionId) {

                marker.setStyle(
                    {
                        color: "#e65100",
                        fillColor: "#fb8c00"
                    }
                );

                marker.setRadius(10);

            } else if (routeJunction) {

                marker.setStyle(
                    {
                        color: "#0d47a1",
                        fillColor: "#1e88e5"
                    }
                );

                marker.setRadius(8);

            } else {

                marker.setStyle(
                    {
                        color: "#5f6368",
                        fillColor: "#5f6368"
                    }
                );

                marker.setRadius(8);
            }
        }
    );
}


// =====================================================
// ROUTE / JUNCTION GEOMETRY
// =====================================================

function calculateHaversineDistance(
    latitudeA,
    longitudeA,
    latitudeB,
    longitudeB
) {

    const earthRadius = 6371000;
    const toRadians = (degrees) => degrees * Math.PI / 180;

    const latitudeDifference =
        toRadians(latitudeB - latitudeA);

    const longitudeDifference =
        toRadians(longitudeB - longitudeA);

    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(toRadians(latitudeA)) *
        Math.cos(toRadians(latitudeB)) *
        Math.sin(longitudeDifference / 2) ** 2;

    return 2 * earthRadius * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}


function projectPointOntoRoute(
    latitude,
    longitude,
    routeCoordinates
) {

    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
        return null;
    }

    const metersPerDegreeLatitude = 111320;
    const metersPerDegreeLongitude =
        111320 * Math.cos(latitude * Math.PI / 180);

    let closestDistance = Number.POSITIVE_INFINITY;
    let routePosition = 0;
    let distanceBeforeSegment = 0;

    for (let index = 0; index < routeCoordinates.length - 1; index += 1) {

        const start = routeCoordinates[index];
        const end = routeCoordinates[index + 1];

        const startX =
            (start[0] - longitude) * metersPerDegreeLongitude;
        const startY =
            (start[1] - latitude) * metersPerDegreeLatitude;
        const endX =
            (end[0] - longitude) * metersPerDegreeLongitude;
        const endY =
            (end[1] - latitude) * metersPerDegreeLatitude;

        const segmentX = endX - startX;
        const segmentY = endY - startY;
        const segmentLengthSquared =
            segmentX ** 2 + segmentY ** 2;

        const segmentLength = calculateHaversineDistance(
            start[1],
            start[0],
            end[1],
            end[0]
        );

        if (segmentLengthSquared === 0) {
            distanceBeforeSegment += segmentLength;
            continue;
        }

        const projectionRatio = Math.max(
            0,
            Math.min(
                1,
                -((startX * segmentX) + (startY * segmentY)) /
                    segmentLengthSquared
            )
        );

        const nearestX = startX + projectionRatio * segmentX;
        const nearestY = startY + projectionRatio * segmentY;
        const distanceToSegment = Math.sqrt(
            nearestX ** 2 + nearestY ** 2
        );

        if (distanceToSegment < closestDistance) {
            closestDistance = distanceToSegment;
            routePosition =
                distanceBeforeSegment + projectionRatio * segmentLength;
        }

        distanceBeforeSegment += segmentLength;
    }

    return {
        distanceToRoute: closestDistance,
        routePosition: routePosition
    };
}


// =====================================================
// ROUTE-AWARE JUNCTION ANALYSIS
// =====================================================

function analyzeRouteJunctions(routeCoordinates) {

    routeJunctions = junctions
        .map(
            (junction) => {

                const projection = projectPointOntoRoute(
                    junction.latitude,
                    junction.longitude,
                    routeCoordinates
                );

                if (
                    !projection ||
                    projection.distanceToRoute > JUNCTION_ROUTE_RADIUS
                ) {
                    return null;
                }

                return {
                    ...junction,
                    distanceToRoute: projection.distanceToRoute,
                    routePosition: projection.routePosition
                };
            }
        )
        .filter(Boolean)
        .sort(
            (junctionA, junctionB) =>
                junctionA.routePosition - junctionB.routePosition
        );

    updateNextJunction();
}


function updateNextJunction() {

    if (!routeData || !currentAmbulanceLocation) {
        return;
    }

    const routeCoordinates = routeData.geometry.coordinates;

    const ambulanceProjection = projectPointOntoRoute(
        currentAmbulanceLocation.latitude,
        currentAmbulanceLocation.longitude,
        routeCoordinates
    );

    if (!ambulanceProjection) {
        return;
    }

    const nextJunction = routeJunctions.find(
        (junction) =>
            junction.routePosition >=
            ambulanceProjection.routePosition - JUNCTION_PASSED_ROUTE_BUFFER
    ) || null;

    updateJunctionMarkerStyles(
        nextJunction ? nextJunction.id : null
    );

    if (junctionSequenceElement) {

        junctionSequenceElement.textContent =
            routeJunctions.length > 0
                ? routeJunctions.map((junction) => junction.id).join(" → ")
                : "No fixed junctions on this route";
    }

    if (!nextJunction) {

        updateJunctionPriority(
            null,
            Number.POSITIVE_INFINITY,
            ambulanceProjection.routePosition
        );

        if (nextJunctionElement) {
            nextJunctionElement.textContent = "No junction ahead";
        }

        if (junctionDistanceElement) {
            junctionDistanceElement.textContent = "--";
        }

        return;
    }

    const distanceToNextJunction = calculateHaversineDistance(
        currentAmbulanceLocation.latitude,
        currentAmbulanceLocation.longitude,
        nextJunction.latitude,
        nextJunction.longitude
    );

    if (nextJunctionElement) {
        nextJunctionElement.textContent =
            `${nextJunction.id} — ${nextJunction.name}`;
    }

    if (junctionDistanceElement) {
        junctionDistanceElement.textContent =
            formatRouteDistance(distanceToNextJunction);
    }

    updateJunctionPriority(
        nextJunction,
        distanceToNextJunction,
        ambulanceProjection.routePosition
    );
}


function updateJunctionPriority(
    nextJunction,
    distanceToNextJunction,
    ambulanceRoutePosition
) {

    const activeJunction = routeJunctions.find(
        (junction) => junction.id === activePriorityJunctionId
    );

    if (
        activeJunction &&
        ambulanceRoutePosition >
            activeJunction.routePosition + JUNCTION_PASSED_ROUTE_BUFFER
    ) {
        activePriorityJunctionId = null;
    }

    if (
        !activePriorityJunctionId &&
        nextJunction &&
        distanceToNextJunction <= PRIORITY_DISTANCE
    ) {
        activePriorityJunctionId = nextJunction.id;
    }

    const priorityText = activePriorityJunctionId
        ? `PRIORITY ACTIVE — ${activePriorityJunctionId}`
        : nextJunction
            ? `NEXT — ${nextJunction.id}`
            : "NORMAL";

    if (routeStatusElement) {
        routeStatusElement.textContent = priorityText;
    }

    const junctionStates = {};

    junctions.forEach(
        (junction) => {

            const onRoute = routeJunctions.some(
                (item) => item.id === junction.id
            );

            junctionStates[junction.id] = {
                status: junction.id === activePriorityJunctionId
                    ? "PRIORITY_ACTIVE"
                    : junction.id === nextJunction?.id
                        ? "NEXT"
                        : onRoute
                            ? "WAITING"
                            : "NOT_ON_ROUTE",
                timestamp: Date.now()
            };
        }
    );

    set(
        ref(database, "junctionPriority"),
        {
            activeJunctionId: activePriorityJunctionId,
            nextJunctionId: nextJunction?.id || null,
            states: junctionStates,
            timestamp: Date.now()
        }
    ).catch(
        (error) => console.warn("Junction state upload failed:", error)
    );
}


function resetJunctionAnalysis() {

    routeJunctions = [];
    activePriorityJunctionId = null;

    if (nextJunctionElement) {
        nextJunctionElement.textContent = "--";
    }

    if (junctionDistanceElement) {
        junctionDistanceElement.textContent = "--";
    }

    if (junctionSequenceElement) {
        junctionSequenceElement.textContent = "--";
    }

    updateJunctionMarkerStyles();

    set(
        ref(database, "junctionPriority"),
        {
            activeJunctionId: null,
            nextJunctionId: null,
            status: "NORMAL",
            timestamp: Date.now()
        }
    ).catch(
        (error) => console.warn("Junction reset upload failed:", error)
    );
}


// =====================================================
// REMOVE ROUTE
// =====================================================

function clearRoute() {

    if (routeLine && map) {

        map.removeLayer(routeLine);
        routeLine = null;
    }

    routeData = null;
    lastRouteOrigin = null;
    lastRouteCalculatedAt = 0;

    resetJunctionAnalysis();

    if (routeStatusElement) {
        routeStatusElement.textContent = "NO ROUTE";
    }

    if (routeDistanceElement) {
        routeDistanceElement.textContent = "--";
    }

    if (routeTimeElement) {
        routeTimeElement.textContent = "--";
    }

    console.log("Route cleared.");
}


// =====================================================
// FORMAT ROUTE TIME
// =====================================================

function formatRouteTime(seconds) {

    if (!Number.isFinite(seconds)) {
        return "--";
    }

    const totalMinutes =
        Math.round(seconds / 60);

    if (totalMinutes < 1) {
        return "Less than 1 min";
    }

    const hours =
        Math.floor(totalMinutes / 60);

    const minutes =
        totalMinutes % 60;

    if (hours > 0) {

        if (minutes > 0) {
            return `${hours} hr ${minutes} min`;
        }

        return `${hours} hr`;
    }

    return `${minutes} min`;
}


// =====================================================
// FORMAT ROUTE DISTANCE
// =====================================================

function formatRouteDistance(meters) {

    if (!Number.isFinite(meters)) {
        return "--";
    }

    const kilometers =
        meters / 1000;

    if (kilometers < 1) {
        return `${Math.round(meters)} m`;
    }

    return `${kilometers.toFixed(2)} km`;
}


// =====================================================
// GPS RELIABILITY AND ROAD-SNAP VALIDATION
// =====================================================

function setGpsReliability(text, color = "#555") {

    if (gpsReliabilityElement) {
        gpsReliabilityElement.textContent = text;
        gpsReliabilityElement.style.color = color;
    }
}


function getStabilizedLocation() {

    if (acceptedGpsFixes.length < 3) {
        return null;
    }

    const totalWeight = acceptedGpsFixes.reduce(
        (sum, fix) => sum + 1 / Math.max(fix.accuracy, 1) ** 2,
        0
    );

    const latitude = acceptedGpsFixes.reduce(
        (sum, fix) =>
            sum + fix.latitude / Math.max(fix.accuracy, 1) ** 2,
        0
    ) / totalWeight;

    const longitude = acceptedGpsFixes.reduce(
        (sum, fix) =>
            sum + fix.longitude / Math.max(fix.accuracy, 1) ** 2,
        0
    ) / totalWeight;

    const averageReportedAccuracy = Math.sqrt(
        acceptedGpsFixes.reduce(
            (sum, fix) => sum + fix.accuracy ** 2,
            0
        ) / acceptedGpsFixes.length
    );

    const positionSpread = Math.sqrt(
        acceptedGpsFixes.reduce(
            (sum, fix) =>
                sum + calculateHaversineDistance(
                    latitude,
                    longitude,
                    fix.latitude,
                    fix.longitude
                ) ** 2,
            0
        ) / acceptedGpsFixes.length
    );

    return {
        latitude: latitude,
        longitude: longitude,
        accuracy: Math.sqrt(
            averageReportedAccuracy ** 2 + positionSpread ** 2
        ),
        rawAccuracy: acceptedGpsFixes.at(-1).accuracy,
        timestamp: Date.now(),
        reliable: true
    };
}


async function snapLocationToRoad(location) {

    const nearestUrl =
        `https://router.project-osrm.org/nearest/v1/driving/` +
        `${location.longitude},${location.latitude}?number=1`;

    const response = await fetch(nearestUrl);

    if (!response.ok) {
        throw new Error(`Road-snap HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const waypoint = data.waypoints && data.waypoints[0];

    if (!waypoint || !Array.isArray(waypoint.location)) {
        throw new Error("No nearby road was found for the GPS location.");
    }

    const snappedLocation = {
        latitude: waypoint.location[1],
        longitude: waypoint.location[0]
    };

    const snapDistance = calculateHaversineDistance(
        location.latitude,
        location.longitude,
        snappedLocation.latitude,
        snappedLocation.longitude
    );

    if (snapDistance > ROAD_SNAP_MAX_DISTANCE) {
        throw new Error(
            `Nearest road is ${Math.round(snapDistance)} m away; route rejected.`
        );
    }

    return {
        ...snappedLocation,
        accuracy: location.accuracy,
        rawAccuracy: location.rawAccuracy,
        timestamp: location.timestamp,
        reliable: true,
        snapDistance: snapDistance
    };
}


function shouldRecalculateRoute() {

    if (
        !routeData ||
        !lastRouteOrigin ||
        !currentAmbulanceLocation ||
        routeRequestInProgress ||
        Date.now() - lastRouteCalculatedAt < ROUTE_RECALCULATE_INTERVAL
    ) {
        return false;
    }

    return calculateHaversineDistance(
        lastRouteOrigin.latitude,
        lastRouteOrigin.longitude,
        currentAmbulanceLocation.latitude,
        currentAmbulanceLocation.longitude
    ) >= ROUTE_RECALCULATE_DISTANCE;
}


function requestControlledRouteRecalculation() {

    if (shouldRecalculateRoute()) {
        calculateRoute({ automatic: true });
    }
}


// =====================================================
// CALCULATE ACTUAL ROAD ROUTE USING OSRM
// =====================================================

async function calculateRoute(options = {}) {

    // -------------------------------------------------
    // CHECK MAP
    // -------------------------------------------------

    if (!map) {

        console.error(
            "Cannot calculate route: map is not initialized."
        );

        if (messageElement) {
            messageElement.textContent =
                "Map is not ready.";
        }

        return;
    }


    // -------------------------------------------------
    // CHECK LIVE GPS
    // -------------------------------------------------

    if (!currentAmbulanceLocation || !currentAmbulanceLocation.reliable) {

        console.warn(
            "Route requested before a GPS location was received."
        );

        if (messageElement) {
            messageElement.textContent =
                "Wait for a reliable GPS location before calculating a route.";
        }

        return;
    }


    // -------------------------------------------------
    // CHECK HOSPITAL
    // -------------------------------------------------

    if (!selectedHospital) {

        console.warn(
            "Route requested without selecting a hospital."
        );

        if (messageElement) {
            messageElement.textContent =
                "Please select a hospital first.";
        }

        return;
    }


    // -------------------------------------------------
    // CURRENT AMBULANCE LOCATION
    // -------------------------------------------------

    // -------------------------------------------------
    // FIXED HOSPITAL LOCATION
    // -------------------------------------------------

    const hospitalLatitude =
        Number(selectedHospital.latitude);

    const hospitalLongitude =
        Number(selectedHospital.longitude);


    // -------------------------------------------------
    // VALIDATE COORDINATES
    // -------------------------------------------------

    if (
        !Number.isFinite(hospitalLatitude) ||
        !Number.isFinite(hospitalLongitude)
    ) {

        console.error(
            "Invalid coordinates."
        );

        if (messageElement) {
            messageElement.textContent =
                "Invalid hospital coordinates.";
        }

        return;
    }


    // -------------------------------------------------
    // DISABLE BUTTON DURING REQUEST
    // -------------------------------------------------

    if (routeButton) {
        routeButton.disabled = true;
    }

    routeRequestInProgress = true;

    if (messageElement) {
        messageElement.textContent =
            options.automatic
                ? "Updating route from the latest reliable location..."
                : "Validating location and calculating road route...";
    }

    if (routeStatusElement) {
        routeStatusElement.textContent =
            "CALCULATING...";
    }


    // -------------------------------------------------
    // BUILD OSRM REQUEST
    //
    // IMPORTANT:
    // OSRM expects:
    // longitude,latitude
    // NOT latitude,longitude
    // -------------------------------------------------

    try {

        const routingOrigin = await snapLocationToRoad(
            currentAmbulanceLocation
        );

        const ambulanceLatitude = routingOrigin.latitude;
        const ambulanceLongitude = routingOrigin.longitude;

        const osrmUrl =
            `${OSRM_BASE_URL}/` +
            `${ambulanceLongitude},${ambulanceLatitude};` +
            `${hospitalLongitude},${hospitalLatitude}` +
            `?overview=full&geometries=geojson&steps=true`;

        console.log("OSRM ROUTE REQUEST:", osrmUrl);

        // -------------------------------------------------
        // REQUEST OSRM
        // -------------------------------------------------

        const response =
            await fetch(osrmUrl);


        // -------------------------------------------------
        // HTTP ERROR
        // -------------------------------------------------

        if (!response.ok) {

            throw new Error(
                `OSRM HTTP error: ${response.status}`
            );
        }


        // -------------------------------------------------
        // READ JSON
        // -------------------------------------------------

        const data =
            await response.json();

        console.log(
            "OSRM RESPONSE:",
            data
        );


        // -------------------------------------------------
        // CHECK OSRM STATUS
        // -------------------------------------------------

        if (
            data.code !== "Ok" ||
            !Array.isArray(data.routes) ||
            data.routes.length === 0
        ) {

            throw new Error(
                data.message ||
                "OSRM did not return a valid route."
            );
        }


        // -------------------------------------------------
        // GET BEST ROUTE
        // -------------------------------------------------

        const route =
            data.routes[0];


        if (
            !route.geometry ||
            !route.geometry.coordinates ||
            route.geometry.coordinates.length === 0
        ) {

            throw new Error(
                "OSRM returned a route without geometry."
            );
        }


        // -------------------------------------------------
        // SAVE ROUTE DATA
        // -------------------------------------------------

        routeData = {
            distance: route.distance,
            duration: route.duration,
            geometry: route.geometry,
            legs: route.legs || [],
            waypoints: data.waypoints || [],
            routingOrigin: routingOrigin
        };

        lastRouteOrigin = routingOrigin;
        lastRouteCalculatedAt = Date.now();


        // -------------------------------------------------
        // REMOVE OLD ROUTE
        // -------------------------------------------------

        if (routeLine) {

            map.removeLayer(routeLine);
            routeLine = null;
        }


        // -------------------------------------------------
        // DRAW ACTUAL ROAD ROUTE
        // -------------------------------------------------

        routeLine =
            L.geoJSON(
                route.geometry,
                {
                    style: {
                        weight: 6,
                        opacity: 0.85
                    }
                }
            ).addTo(map);


        // -------------------------------------------------
        // UPDATE HOSPITAL MARKER
        // -------------------------------------------------

        updateHospitalMarker(
            selectedHospital
        );


        // -------------------------------------------------
        // FIT MAP TO ROUTE
        // -------------------------------------------------

        const routeBounds =
            routeLine.getBounds();

        if (routeBounds.isValid() && !options.automatic) {

            map.fitBounds(
                routeBounds,
                {
                    padding: [40, 40]
                }
            );
        }


        // -------------------------------------------------
        // DISTANCE
        // -------------------------------------------------

        const distanceText =
            formatRouteDistance(
                route.distance
            );


        // -------------------------------------------------
        // ESTIMATED TIME
        // -------------------------------------------------

        const timeText =
            formatRouteTime(
                route.duration
            );


        // -------------------------------------------------
        // UPDATE UI
        // -------------------------------------------------

        if (destinationNameElement) {

            destinationNameElement.textContent =
                selectedHospital.name;
        }

        if (routeDistanceElement) {

            routeDistanceElement.textContent =
                distanceText;
        }

        if (routeTimeElement) {

            routeTimeElement.textContent =
                timeText;
        }

        if (routeStatusElement) {

            routeStatusElement.textContent =
                "ROUTE READY";
        }


        // -------------------------------------------------
        // ANALYZE FIXED JUNCTIONS ON THE ACTUAL ROAD ROUTE
        // -------------------------------------------------

        analyzeRouteJunctions(
            route.geometry.coordinates
        );


        // -------------------------------------------------
        // SUCCESS MESSAGE
        // -------------------------------------------------

        if (messageElement) {

            messageElement.textContent =
                `Actual road route calculated to ${selectedHospital.name}.`;
        }


        // -------------------------------------------------
        // CONSOLE INFORMATION
        // -------------------------------------------------

        console.log(
            "=========================================="
        );

        console.log(
            "OSRM ROUTE CALCULATED SUCCESSFULLY"
        );

        console.log(
            "FROM:",
            ambulanceLatitude,
            ambulanceLongitude
        );

        console.log(
            "TO:",
            hospitalLatitude,
            hospitalLongitude
        );

        console.log(
            "DESTINATION:",
            selectedHospital.name
        );

        console.log(
            "DISTANCE:",
            distanceText
        );

        console.log(
            "ESTIMATED TIME:",
            timeText
        );

        console.log(
            "ROUTE POINTS:",
            route.geometry.coordinates.length
        );

        console.log(
            "=========================================="
        );

    } catch (error) {

        // -------------------------------------------------
        // ROUTE ERROR
        // -------------------------------------------------

        console.error(
            "OSRM ROUTE CALCULATION ERROR:",
            error
        );

        clearRoute();

        if (messageElement) {

            messageElement.textContent =
                `Route calculation failed: ${error.message}`;
        }

        if (routeStatusElement) {

            routeStatusElement.textContent =
                "ROUTE ERROR";
        }

    } finally {

        // -------------------------------------------------
        // ENABLE BUTTON AGAIN
        // -------------------------------------------------

        if (routeButton) {
            routeButton.disabled = false;
        }

        routeRequestInProgress = false;
    }
}


// =====================================================
// START LIVE GPS
// =====================================================

function startGPS() {

    // -------------------------------------------------
    // PREVENT MULTIPLE GPS WATCHERS
    // -------------------------------------------------

    if (gpsWatchId !== null) {

        console.log(
            "GPS is already running."
        );

        return;
    }


    // -------------------------------------------------
    // CHECK GEOLOCATION SUPPORT
    // -------------------------------------------------

    if (!navigator.geolocation) {

        console.error(
            "Geolocation is not supported."
        );

        if (gpsStatus) {
            gpsStatus.textContent =
                "NOT SUPPORTED";
            gpsStatus.className =
                "status stopped";
        }

        if (messageElement) {
            messageElement.textContent =
                "Geolocation is not supported by this browser.";
        }

        return;
    }


    // -------------------------------------------------
    // START NEW GPS SESSION
    // -------------------------------------------------

    gpsSessionStarted = true;

    lastGpsTimestamp = null;

    currentAmbulanceLocation = null;
    acceptedGpsFixes = [];
    setGpsReliability("ACQUIRING FIXES", "#b26a00");


    // -------------------------------------------------
    // CLEAR OLD ROUTE
    // -------------------------------------------------

    clearRoute();


    // -------------------------------------------------
    // RESET GPS DISPLAY
    // -------------------------------------------------

    if (latitudeElement) {
        latitudeElement.textContent = "--";
    }

    if (longitudeElement) {
        longitudeElement.textContent = "--";
    }

    if (accuracyElement) {
        accuracyElement.textContent = "--";
    }

    if (lastUpdateElement) {
        lastUpdateElement.textContent = "--";
    }

    if (gpsStatus) {
        gpsStatus.textContent =
            "STARTING...";
    }


    // -------------------------------------------------
    // BUTTON STATE
    // -------------------------------------------------

    if (startButton) {
        startButton.disabled = true;
    }

    if (stopButton) {
        stopButton.disabled = false;
    }


    if (messageElement) {
        messageElement.textContent =
            "Waiting for current GPS location...";
    }


    console.log(
        "Starting live GPS..."
    );


    // -------------------------------------------------
    // START GPS WATCH
    // -------------------------------------------------

    gpsWatchId =
        navigator.geolocation.watchPosition(

            // =========================================
            // SUCCESS
            // =========================================

            function(position) {

                let latitude =
                    Number(position.coords.latitude);

                let longitude =
                    Number(position.coords.longitude);

                let accuracy =
                    Number(position.coords.accuracy);


                // -----------------------------------------
                // VALIDATE GPS
                // -----------------------------------------

                if (
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude)
                ) {

                    console.error(
                        "Invalid GPS coordinates received."
                    );

                    return;
                }

                if (
                    !Number.isFinite(accuracy) ||
                    accuracy > MAX_RAW_GPS_ACCURACY
                ) {

                    if (accuracyElement) {
                        accuracyElement.textContent =
                            Number.isFinite(accuracy)
                                ? Math.round(accuracy) + " m"
                                : "--";
                    }

                    if (gpsStatus) {
                        gpsStatus.textContent = "WAITING FOR BETTER GPS";
                        gpsStatus.className = "status stopped";
                    }

                    setGpsReliability(
                        Number.isFinite(accuracy)
                            ? `REJECTED (${Math.round(accuracy)} m raw)`
                            : "REJECTED (unknown accuracy)",
                        "#c62828"
                    );

                    if (messageElement) {
                        messageElement.textContent =
                            Number.isFinite(accuracy)
                                ? `GPS accuracy is ${Math.round(accuracy)} m. Move outdoors and wait for ≤ ${MAX_RAW_GPS_ACCURACY} m.`
                                : "GPS did not provide an accuracy value. Wait for a reliable fix.";
                    }

                    return;
                }

                acceptedGpsFixes.push(
                    {
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy,
                        timestamp: Date.now()
                    }
                );

                acceptedGpsFixes = acceptedGpsFixes.slice(
                    -GPS_FIX_WINDOW_SIZE
                );

                const stabilizedLocation = getStabilizedLocation();

                if (
                    !stabilizedLocation ||
                    stabilizedLocation.accuracy > REQUIRED_STABILIZED_ACCURACY
                ) {

                    if (gpsStatus) {
                        gpsStatus.textContent = "STABILIZING GPS";
                        gpsStatus.className = "status connecting";
                    }

                    setGpsReliability(
                        `${acceptedGpsFixes.length}/${GPS_FIX_WINDOW_SIZE} good fixes`,
                        "#b26a00"
                    );

                    if (messageElement) {
                        messageElement.textContent =
                            "Collecting reliable GPS fixes before enabling routing.";
                    }

                    return;
                }

                latitude = stabilizedLocation.latitude;
                longitude = stabilizedLocation.longitude;
                accuracy = stabilizedLocation.accuracy;


                // -----------------------------------------
                // SAVE CURRENT AMBULANCE LOCATION
                // -----------------------------------------

                currentAmbulanceLocation = {
                    latitude: latitude,
                    longitude: longitude,
                    accuracy: accuracy,
                    rawAccuracy: stabilizedLocation.rawAccuracy,
                    timestamp: stabilizedLocation.timestamp,
                    reliable: true
                };


                // -----------------------------------------
                // CURRENT GPS TIME
                // -----------------------------------------

                const gpsTime =
                    new Date();

                lastGpsTimestamp =
                    gpsTime.getTime();


                // -----------------------------------------
                // UPDATE UI
                // -----------------------------------------

                if (latitudeElement) {
                    latitudeElement.textContent =
                        latitude.toFixed(6);
                }

                if (longitudeElement) {
                    longitudeElement.textContent =
                        longitude.toFixed(6);
                }

                if (accuracyElement) {
                    accuracyElement.textContent =
                        Number.isFinite(accuracy)
                            ? Math.round(accuracy) + " m"
                            : "--";
                }

                if (lastUpdateElement) {
                    lastUpdateElement.textContent =
                        gpsTime.toLocaleTimeString();
                }

                if (gpsStatus) {
                    gpsStatus.textContent =
                        "GPS READY";
                    gpsStatus.className =
                        "status live";
                }

                setGpsReliability(
                    `READY (${Math.round(accuracy)} m stabilized)`,
                    "#2e7d32"
                );


                // -----------------------------------------
                // CONSOLE
                // -----------------------------------------

                console.log(
                    "GPS LOCATION:",
                    latitude,
                    longitude,
                    accuracy
                );


                // -----------------------------------------
                // UPDATE MAP
                // -----------------------------------------

                updateAmbulanceMarker(
                    latitude,
                    longitude,
                    Number.isFinite(accuracy)
                        ? accuracy
                        : 0
                );

                // -----------------------------------------
                // UPDATE THE NEXT JUNCTION AND SINGLE PRIORITY STATE
                // -----------------------------------------

                if (routeData && routeJunctions.length > 0) {
                    updateNextJunction();
                }

                requestControlledRouteRecalculation();


                // -----------------------------------------
                // UPDATE MESSAGE
                // -----------------------------------------

                if (messageElement) {

                    messageElement.textContent =
                        "Live GPS location received.";
                }


                // -----------------------------------------
                // SEND TO FIREBASE
                // -----------------------------------------

                const ambulanceRef =
                    ref(
                        database,
                        "ambulance"
                    );

                set(
                    ambulanceRef,
                    {
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy,
                        rawAccuracy: stabilizedLocation.rawAccuracy,
                        stabilized: true,
                        timestamp: Date.now(),
                        active: true,
                        mode: "browser-live"
                    }
                )
                .then(
                    () => {

                        console.log(
                            "Live GPS uploaded:",
                            latitude,
                            longitude
                        );
                    }
                )
                .catch(
                    (error) => {

                        console.error(
                            "Firebase GPS upload failed:",
                            error
                        );
                    }
                );
            },


            // =========================================
            // ERROR
            // =========================================

            function(error) {

                console.error(
                    "GPS ERROR:",
                    error
                );

                if (gpsStatus) {

                    gpsStatus.textContent =
                        "GPS ERROR";

                    gpsStatus.className =
                        "status stopped";
                }

                if (messageElement) {

                    let errorMessage =
                        "Unable to get GPS location.";

                    if (error.code === 1) {
                        errorMessage =
                            "Location permission denied. Allow location access.";
                    }

                    if (error.code === 2) {
                        errorMessage =
                            "GPS position unavailable. Move outdoors or near a window.";
                    }

                    if (error.code === 3) {
                        errorMessage =
                            "GPS request timed out. Waiting for another fix.";
                    }

                    messageElement.textContent =
                        errorMessage;
                }
            },


            // =========================================
            // GPS OPTIONS
            // =========================================

            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000
            }
        );
}


// =====================================================
// STOP LIVE GPS
// =====================================================

function stopGPS() {

    console.log(
        "Stopping live GPS..."
    );


    // -------------------------------------------------
    // STOP GPS WATCHER
    // -------------------------------------------------

    if (gpsWatchId !== null) {

        navigator.geolocation.clearWatch(
            gpsWatchId
        );

        gpsWatchId = null;
    }


    // -------------------------------------------------
    // RESET GPS STATE
    // -------------------------------------------------

    gpsSessionStarted = false;

    lastGpsTimestamp = null;

    currentAmbulanceLocation = null;
    acceptedGpsFixes = [];
    setGpsReliability("STOPPED", "#777");


    // -------------------------------------------------
    // REMOVE AMBULANCE MARKER
    // -------------------------------------------------

    removeAmbulanceMarker();


    // -------------------------------------------------
    // CLEAR ROUTE
    // -------------------------------------------------

    clearRoute();


    // -------------------------------------------------
    // RESET GPS UI
    // -------------------------------------------------

    if (gpsStatus) {

        gpsStatus.textContent =
            "STOPPED";

        gpsStatus.className =
            "status stopped";
    }

    if (latitudeElement) {
        latitudeElement.textContent = "--";
    }

    if (longitudeElement) {
        longitudeElement.textContent = "--";
    }

    if (accuracyElement) {
        accuracyElement.textContent = "--";
    }

    if (lastUpdateElement) {
        lastUpdateElement.textContent = "--";
    }


    // -------------------------------------------------
    // BUTTON STATE
    // -------------------------------------------------

    if (startButton) {
        startButton.disabled = false;
    }

    if (stopButton) {
        stopButton.disabled = true;
    }


    // -------------------------------------------------
    // UPDATE FIREBASE
    // -------------------------------------------------

    const ambulanceRef =
        ref(
            database,
            "ambulance"
        );

    set(
        ambulanceRef,
        {
            active: false,
            timestamp: Date.now(),
            mode: "browser-live"
        }
    )
    .then(
        () => {

            console.log(
                "Firebase ambulance status set to inactive."
            );
        }
    )
    .catch(
        (error) => {

            console.error(
                "Failed to update Firebase:",
                error
            );
        }
    );


    if (messageElement) {
        messageElement.textContent =
            "Live GPS stopped.";
    }

    console.log(
        "Live GPS stopped."
    );
}


// =====================================================
// GPS STALE-DATA PROTECTION
// =====================================================

function monitorGpsFreshness() {

    if (
        !gpsSessionStarted ||
        !lastGpsTimestamp ||
        Date.now() - lastGpsTimestamp <= GPS_STALE_AFTER
    ) {
        return;
    }

    currentAmbulanceLocation = null;
    lastGpsTimestamp = null;
    clearRoute();

    if (gpsStatus) {
        gpsStatus.textContent = "GPS STALE";
        gpsStatus.className = "status stopped";
    }

    setGpsReliability("STALE — ROUTING PAUSED", "#c62828");

    if (messageElement) {
        messageElement.textContent =
            "No reliable GPS update for 15 seconds. Route and priority were paused.";
    }
}


// =====================================================
// HOSPITAL DROPDOWN
// =====================================================

function initializeHospitalSelect() {

    if (!hospitalSelect) {

        console.error(
            "Hospital select element not found."
        );

        return;
    }


    hospitalSelect.innerHTML =
        '<option value="">Select Hospital</option>';


    hospitals.forEach(
        (hospital) => {

            const option =
                document.createElement("option");

            option.value =
                hospital.id;

            option.textContent =
                hospital.name;

            hospitalSelect.appendChild(
                option
            );
        }
    );


    // -------------------------------------------------
    // HOSPITAL SELECTION
    // -------------------------------------------------

    hospitalSelect.addEventListener(
        "change",
        () => {

            const hospitalId =
                hospitalSelect.value;


            selectedHospital =
                hospitals.find(
                    (hospital) =>
                        hospital.id === hospitalId
                ) || null;


            // -----------------------------------------
            // NO HOSPITAL SELECTED
            // -----------------------------------------

            if (!selectedHospital) {

                clearRoute();

                if (hospitalMarker && map) {

                    map.removeLayer(
                        hospitalMarker
                    );

                    hospitalMarker = null;
                }

                if (destinationNameElement) {
                    destinationNameElement.textContent =
                        "--";
                }

                if (messageElement) {
                    messageElement.textContent =
                        "Please select a hospital.";
                }

                return;
            }


            // -----------------------------------------
            // SELECTED HOSPITAL
            // -----------------------------------------

            console.log(
                "SELECTED HOSPITAL:",
                selectedHospital
            );


            // -----------------------------------------
            // CLEAR PREVIOUS ROUTE
            // -----------------------------------------

            clearRoute();


            // -----------------------------------------
            // UPDATE DESTINATION
            // -----------------------------------------

            if (destinationNameElement) {

                destinationNameElement.textContent =
                    selectedHospital.name;
            }


            // -----------------------------------------
            // SHOW HOSPITAL ON MAP
            // -----------------------------------------

            updateHospitalMarker(
                selectedHospital
            );


            // -----------------------------------------
            // MESSAGE
            // -----------------------------------------

            if (messageElement) {

                if (currentAmbulanceLocation) {

                    messageElement.textContent =
                        `${selectedHospital.name} selected. Click Calculate Route.`;

                } else {

                    messageElement.textContent =
                        `${selectedHospital.name} selected. Start GPS first.`;
                }
            }
        }
    );
}


// =====================================================
// BUTTON EVENTS
// =====================================================

if (startButton) {

    startButton.addEventListener(
        "click",
        startGPS
    );
}


if (stopButton) {

    stopButton.addEventListener(
        "click",
        stopGPS
    );
}


if (routeButton) {

    routeButton.addEventListener(
        "click",
        calculateRoute
    );
}


// =====================================================
// INITIAL PAGE STATE
// =====================================================

initializeHospitalSelect();

resetGPSDisplay();

resetRouteDisplay();


// =====================================================
// INITIALIZE MAP
// =====================================================

initializeMap();

setInterval(monitorGpsFreshness, 3000);


// =====================================================
// APPLICATION READY
// =====================================================

console.log(
    "Smart Traffic Ambulance application ready."
);

console.log(
    "Waiting for user to start live GPS..."
);

