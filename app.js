import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    onValue
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

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

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

console.log("Firebase initialized successfully");

const connectionRef = ref(database, ".info/connected");

onValue(connectionRef, (snapshot) => {
    if (snapshot.val() === true) {
        console.log("Firebase database connected successfully");

        const firebaseStatus = document.getElementById("firebaseStatus");

        if (firebaseStatus) {
            firebaseStatus.textContent = "CONNECTED";
            firebaseStatus.style.color = "green";
        }
    } else {
        console.log("Firebase database disconnected");

        const firebaseStatus = document.getElementById("firebaseStatus");

        if (firebaseStatus) {
            firebaseStatus.textContent = "DISCONNECTED";
            firebaseStatus.style.color = "red";
        }
    }
});

// =====================================================
// LIVE BROWSER GPS
// =====================================================

const gpsStatus = document.getElementById("gpsStatus");
const latitudeElement = document.getElementById("latitude");
const longitudeElement = document.getElementById("longitude");
const accuracyElement = document.getElementById("accuracy");
const lastUpdateElement = document.getElementById("lastUpdate");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

let gpsWatchId = null;

function startGPS() {

    if (!navigator.geolocation) {
        console.error("Geolocation is not supported.");
        gpsStatus.textContent = "NOT SUPPORTED";
        return;
    }

    gpsStatus.textContent = "STARTING...";

    gpsWatchId = navigator.geolocation.watchPosition(

        function(position) {

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log(
                "GPS LOCATION:",
                latitude,
                longitude,
                accuracy
            );

            // ==========================================
            // UPDATE GPS INFORMATION ON WEBPAGE
            // ==========================================

            latitudeElement.textContent =
                latitude.toFixed(6);

            longitudeElement.textContent =
                longitude.toFixed(6);

            accuracyElement.textContent =
                Math.round(accuracy) + " m";

            lastUpdateElement.textContent =
                new Date().toLocaleTimeString();

            gpsStatus.textContent = "LIVE";

            // ==========================================
            // UPDATE AMBULANCE ON MAP
            // ==========================================

            updateAmbulanceMarker(
                latitude,
                longitude,
                accuracy
            );

            // ==========================================
            // SEND LOCATION TO FIREBASE
            // ==========================================

            const ambulanceRef =
                ref(database, "ambulance");

            set(ambulanceRef, {

                latitude: latitude,
                longitude: longitude,
                accuracy: accuracy,
                timestamp: Date.now(),
                active: true,
                mode: "browser-live"

            })
            .then(() => {

                console.log(
                    "Live GPS uploaded:",
                    latitude,
                    longitude
                );

            })
            .catch((error) => {

                console.error(
                    "Firebase GPS upload failed:",
                    error
                );

            });

        },

        function(error) {

            console.error(
                "GPS ERROR:",
                error
            );

            gpsStatus.textContent =
                "GPS ERROR";

        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }

    );
}


function stopGPS() {

    if (gpsWatchId !== null) {

        navigator.geolocation.clearWatch(gpsWatchId);

        gpsWatchId = null;

    }

    gpsStatus.textContent = "STOPPED";

    const ambulanceRef = ref(database, "ambulance");

    set(ambulanceRef, {

        active: false,
        timestamp: Date.now(),
        mode: "browser-live"

    });

    console.log("Live GPS stopped");

}


startButton.addEventListener("click", startGPS);

stopButton.addEventListener("click", stopGPS);

// =====================================================
// LIVE AMBULANCE MAP MARKER
// =====================================================

let map = null;
let ambulanceMarker = null;
let ambulanceAccuracyCircle = null;

// Initialize map
function initializeMap() {

    if (typeof L === "undefined") {
        console.error("Leaflet is not loaded.");
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
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    console.log("Map initialized successfully");
}


// Update ambulance position on map
function updateAmbulanceMarker(
    latitude,
    longitude,
    accuracy
) {

    if (!map) {
        return;
    }

    const position = [
        latitude,
        longitude
    ];

    // Create marker first time
    if (!ambulanceMarker) {

        ambulanceMarker = L.marker(position)
            .addTo(map)
            .bindPopup("<b>🚑 Ambulance</b>");

        ambulanceAccuracyCircle =
            L.circle(position, {
                radius: accuracy,
                color: "#d32f2f",
                fillColor: "#d32f2f",
                fillOpacity: 0.15
            }).addTo(map);

        map.setView(position, 17);

    } else {

        // Move existing marker
        ambulanceMarker.setLatLng(position);

        // Update accuracy circle
        ambulanceAccuracyCircle.setLatLng(position);
        ambulanceAccuracyCircle.setRadius(accuracy);

    }
}


// Start map
initializeMap();
