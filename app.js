// =====================================================
// SMART TRAFFIC AMBULANCE
// CURRENT STAGE:
// Firebase + Live Browser GPS + Leaflet Ambulance Marker
// =====================================================


// =====================================================
// FIREBASE IMPORTS
// =====================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    onValue
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


// =====================================================
// FIREBASE CONFIGURATION
// =====================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyCDzTaALGEdyZpwgHlgGVd1AYfmOhi6dZ0",

    authDomain:
        "smart-traffic-ambalance.firebaseapp.com",

    databaseURL:
        "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app",

    projectId:
        "smart-traffic-ambalance",

    storageBucket:
        "smart-traffic-ambalance.firebasestorage.app",

    messagingSenderId:
        "220308583511",

    appId:
        "1:220308583511:web:4433f941507bcda83f9f12",

    measurementId:
        "G-D64VYM5TGJ"
};


// =====================================================
// INITIALIZE FIREBASE
// =====================================================

const firebaseApp =
    initializeApp(firebaseConfig);

const database =
    getDatabase(firebaseApp);

console.log(
    "Firebase initialized successfully"
);


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


// =====================================================
// APPLICATION VARIABLES
// =====================================================

let gpsWatchId = null;

let gpsSessionStarted = false;

let lastGpsTimestamp = null;

let map = null;

let ambulanceMarker = null;

let ambulanceAccuracyCircle = null;


// =====================================================
// INITIAL UI STATE
// =====================================================

function resetGPSDisplay() {

    gpsStatus.textContent =
        "WAITING FOR GPS";

    gpsStatus.className =
        "status stopped";

    latitudeElement.textContent =
        "--";

    longitudeElement.textContent =
        "--";

    accuracyElement.textContent =
        "--";

    lastUpdateElement.textContent =
        "--";
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

            firebaseStatus.textContent =
                "CONNECTED";

            firebaseStatus.style.color =
                "green";

        } else {

            console.log(
                "Firebase database disconnected"
            );

            firebaseStatus.textContent =
                "DISCONNECTED";

            firebaseStatus.style.color =
                "red";
        }
    }
);


// =====================================================
// INITIALIZE MAP
// =====================================================

function initializeMap() {

    if (typeof L === "undefined") {

        console.error(
            "Leaflet is not loaded."
        );

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


    console.log(
        "Map initialized successfully"
    );


    setTimeout(
        () => {

            map.invalidateSize();

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

        console.error(
            "Map is not initialized."
        );

        return;
    }


    const position = [
        latitude,
        longitude
    ];


    // -------------------------------------------------
    // CREATE MARKER
    // -------------------------------------------------

    if (!ambulanceMarker) {

        ambulanceMarker =
            L.marker(position)
                .addTo(map)
                .bindPopup(
                    "<b>🚑 Ambulance</b>"
                );


        ambulanceAccuracyCircle =
            L.circle(
                position,
                {
                    radius: accuracy,

                    color: "#d32f2f",

                    fillColor: "#d32f2f",

                    fillOpacity: 0.15
                }
            ).addTo(map);


        console.log(
            "Ambulance marker created."
        );


        map.setView(
            position,
            17
        );


    } else {

        // -------------------------------------------------
        // MOVE EXISTING MARKER
        // -------------------------------------------------

        ambulanceMarker.setLatLng(
            position
        );


        if (ambulanceAccuracyCircle) {

            ambulanceAccuracyCircle.setLatLng(
                position
            );

            ambulanceAccuracyCircle.setRadius(
                accuracy
            );
        }


        console.log(
            "Ambulance marker updated."
        );
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

        gpsStatus.textContent =
            "NOT SUPPORTED";

        return;
    }


    // -------------------------------------------------
    // START NEW GPS SESSION
    // -------------------------------------------------

    gpsSessionStarted = true;

    lastGpsTimestamp = null;


    // -------------------------------------------------
    // RESET OLD DISPLAY
    // -------------------------------------------------

    latitudeElement.textContent =
        "--";

    longitudeElement.textContent =
        "--";

    accuracyElement.textContent =
        "--";

    lastUpdateElement.textContent =
        "--";


    gpsStatus.textContent =
        "STARTING...";


    // -------------------------------------------------
    // BUTTON STATE
    // -------------------------------------------------

    startButton.disabled =
        true;

    stopButton.disabled =
        false;


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
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                const accuracy =
                    position.coords.accuracy;


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

                latitudeElement.textContent =
                    latitude.toFixed(6);

                longitudeElement.textContent =
                    longitude.toFixed(6);

                accuracyElement.textContent =
                    Math.round(accuracy) + " m";

                lastUpdateElement.textContent =
                    gpsTime.toLocaleTimeString();


                gpsStatus.textContent =
                    "LIVE";

                gpsStatus.className =
                    "status live";


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
                    accuracy
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

                        latitude:
                            latitude,

                        longitude:
                            longitude,

                        accuracy:
                            accuracy,

                        timestamp:
                            Date.now(),

                        active:
                            true,

                        mode:
                            "browser-live"
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


                gpsStatus.textContent =
                    "GPS ERROR";

                gpsStatus.className =
                    "status stopped";


                if (messageElement) {

                    messageElement.textContent =
                        "GPS error: " +
                        error.message;
                }
            },


            // =========================================
            // GPS OPTIONS
            // =========================================

            {
                enableHighAccuracy:
                    true,

                maximumAge:
                    0,

                timeout:
                    15000
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


    gpsSessionStarted =
        false;

    lastGpsTimestamp =
        null;


    // -------------------------------------------------
    // REMOVE MAP MARKER
    // -------------------------------------------------

    removeAmbulanceMarker();


    // -------------------------------------------------
    // RESET UI
    // -------------------------------------------------

    gpsStatus.textContent =
        "STOPPED";

    gpsStatus.className =
        "status stopped";


    latitudeElement.textContent =
        "--";

    longitudeElement.textContent =
        "--";

    accuracyElement.textContent =
        "--";

    lastUpdateElement.textContent =
        "--";


    // -------------------------------------------------
    // BUTTON STATE
    // -------------------------------------------------

    startButton.disabled =
        false;

    stopButton.disabled =
        true;


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

            active:
                false,

            timestamp:
                Date.now(),

            mode:
                "browser-live"
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
// BUTTON EVENTS
// =====================================================

startButton.addEventListener(
    "click",
    startGPS
);


stopButton.addEventListener(
    "click",
    stopGPS
);


// =====================================================
// INITIAL PAGE STATE
// =====================================================

resetGPSDisplay();


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