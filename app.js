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
// REMOVE ROUTE
// =====================================================

function clearRoute() {

    if (routeLine && map) {

        map.removeLayer(routeLine);
        routeLine = null;
    }

    routeData = null;

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
// CALCULATE ACTUAL ROAD ROUTE USING OSRM
// =====================================================

async function calculateRoute() {

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

    if (!currentAmbulanceLocation) {

        console.warn(
            "Route requested before a GPS location was received."
        );

        if (messageElement) {
            messageElement.textContent =
                "Start GPS and wait for the current ambulance location first.";
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

    const ambulanceLatitude =
        Number(currentAmbulanceLocation.latitude);

    const ambulanceLongitude =
        Number(currentAmbulanceLocation.longitude);


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
        !Number.isFinite(ambulanceLatitude) ||
        !Number.isFinite(ambulanceLongitude) ||
        !Number.isFinite(hospitalLatitude) ||
        !Number.isFinite(hospitalLongitude)
    ) {

        console.error(
            "Invalid coordinates."
        );

        if (messageElement) {
            messageElement.textContent =
                "Invalid GPS or hospital coordinates.";
        }

        return;
    }


    // -------------------------------------------------
    // DISABLE BUTTON DURING REQUEST
    // -------------------------------------------------

    if (routeButton) {
        routeButton.disabled = true;
    }

    if (messageElement) {
        messageElement.textContent =
            "Calculating actual road route...";
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

    const osrmUrl =
        `${OSRM_BASE_URL}/` +
        `${ambulanceLongitude},${ambulanceLatitude};` +
        `${hospitalLongitude},${hospitalLatitude}` +
        `?overview=full&geometries=geojson&steps=true`;

    console.log(
        "OSRM ROUTE REQUEST:",
        osrmUrl
    );


    try {

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
            waypoints: data.waypoints || []
        };


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

        if (routeBounds.isValid()) {

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
        // JUNCTION SECTION
        //
        // Junction logic will be added later.
        // -------------------------------------------------

        if (nextJunctionElement) {
            nextJunctionElement.textContent =
                "Not calculated";
        }

        if (junctionDistanceElement) {
            junctionDistanceElement.textContent =
                "--";
        }

        if (junctionSequenceElement) {
            junctionSequenceElement.textContent =
                "Junction analysis pending";
        }


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

                const latitude =
                    Number(position.coords.latitude);

                const longitude =
                    Number(position.coords.longitude);

                const accuracy =
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


                // -----------------------------------------
                // SAVE CURRENT AMBULANCE LOCATION
                // -----------------------------------------

                currentAmbulanceLocation = {
                    latitude: latitude,
                    longitude: longitude,
                    accuracy: accuracy
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
                        "LIVE";
                    gpsStatus.className =
                        "status live";
                }


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


// =====================================================
// APPLICATION READY
// =====================================================

console.log(
    "Smart Traffic Ambulance application ready."
);

console.log(
    "Waiting for user to start live GPS..."
);

