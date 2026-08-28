import {
    ref,
    set
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


const startButton =
    document.getElementById("startButton");

const stopButton =
    document.getElementById("stopButton");


const gpsStatus =
    document.getElementById("gpsStatus");


const latitude =
    document.getElementById("latitude");


const longitude =
    document.getElementById("longitude");


const accuracy =
    document.getElementById("accuracy");


const lastUpdate =
    document.getElementById("lastUpdate");


const message =
    document.getElementById("message");


let watchId = null;


/* ==============================
   LIVE MAP
   ============================== */

let map = null;
let ambulanceMarker = null;
let accuracyCircle = null;


function initializeMap() {

    const mapElement =
        document.getElementById("map");


    if (!mapElement || !window.L) {

        console.error("Leaflet map library was not loaded.");

        message.textContent =
            "Map could not be loaded. Check your internet connection and refresh the page.";

        return;
    }


    /*
       Show a useful default view until the first GPS position arrives.
       The map moves to the ambulance as soon as GPS is active.
    */
    map =
        L.map("map")
            .setView([11.0183, 76.9563], 13);


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    )
        .addTo(map);


    /*
       Leaflet needs a size refresh after the page finishes layout.
    */
    window.setTimeout(
        () => map.invalidateSize(),
        0
    );
}


function updateAmbulanceMap(lat, lon, acc) {

    if (!map) {
        return;
    }


    const ambulanceLocation =
        [lat, lon];


    if (!ambulanceMarker) {

        ambulanceMarker =
            L.marker(ambulanceLocation)
                .addTo(map)
                .bindPopup("Ambulance current location");


        accuracyCircle =
            L.circle(
                ambulanceLocation,
                {
                    radius: acc,
                    color: "#d32f2f",
                    fillColor: "#ef5350",
                    fillOpacity: 0.18,
                    weight: 2
                }
            )
                .addTo(map);
    } else {

        ambulanceMarker.setLatLng(ambulanceLocation);

        accuracyCircle
            .setLatLng(ambulanceLocation)
            .setRadius(acc);
    }


    map.setView(ambulanceLocation, 17);
}


initializeMap();


/* ==============================
   START GPS
   ============================== */

startButton.addEventListener(
    "click",
    startGPS
);


/* ==============================
   STOP GPS
   ============================== */

stopButton.addEventListener(
    "click",
    stopGPS
);


/* ==============================
   START GPS FUNCTION
   ============================== */

function startGPS() {

    // Check browser GPS support

    if (!navigator.geolocation) {

        gpsStatus.textContent =
            "NOT SUPPORTED";

        gpsStatus.style.color =
            "red";

        message.textContent =
            "This browser does not support GPS location.";

        return;
    }


    gpsStatus.textContent =
        "STARTING...";

    gpsStatus.style.color =
        "orange";


    message.textContent =
        "Requesting GPS permission...";


    startButton.disabled =
        true;

    stopButton.disabled =
        false;


    /*
       Start continuous GPS tracking
    */

    watchId =
        navigator.geolocation.watchPosition(

            updateLocation,

            locationError,

            {

                enableHighAccuracy: true,

                maximumAge: 2000,

                timeout: 10000

            }

        );
}


/* ==============================
   UPDATE LOCATION
   ============================== */

function updateLocation(position) {


    const lat =
        position.coords.latitude;


    const lon =
        position.coords.longitude;


    const acc =
        position.coords.accuracy;


    const timestamp =
        Date.now();


    /*
       Update webpage
    */

    latitude.textContent =
        lat.toFixed(6);


    longitude.textContent =
        lon.toFixed(6);


    accuracy.textContent =
        acc.toFixed(2) + " meters";


    lastUpdate.textContent =
        new Date(timestamp)
            .toLocaleTimeString();


    gpsStatus.textContent =
        "ACTIVE";


    gpsStatus.style.color =
        "green";


    message.textContent =
        "Location updated successfully.";


    /*
       Update the map with the same GPS data sent to Firebase.
    */
    updateAmbulanceMap(lat, lon, acc);


    /*
       Firebase reference

       Data will be stored at:

       /ambulance
    */

    const ambulanceRef =
        ref(
            window.firebaseDatabase,
            "ambulance"
        );


    /*
       Upload GPS data
    */

    set(
        ambulanceRef,
        {

            latitude: lat,

            longitude: lon,

            accuracy: acc,

            timestamp: timestamp,

            active: true

        }

    )

        .then(() => {

            console.log(
                "GPS data uploaded to Firebase"
            );

        })

        .catch((error) => {

            console.error(
                "Firebase upload error:",
                error
            );


            message.textContent =
                "GPS working, but Firebase upload failed.";

        });
}


/* ==============================
   GPS ERROR
   ============================== */

function locationError(error) {


    gpsStatus.textContent =
        "ERROR";


    gpsStatus.style.color =
        "red";


    switch (error.code) {


        case error.PERMISSION_DENIED:

            message.textContent =
                "Location permission was denied.";

            break;


        case error.POSITION_UNAVAILABLE:

            message.textContent =
                "GPS location is unavailable.";

            break;


        case error.TIMEOUT:

            message.textContent =
                "GPS request timed out.";

            break;


        default:

            message.textContent =
                "Unknown GPS error.";

    }


    /*
       Allow user to try again
    */

    startButton.disabled =
        false;

    stopButton.disabled =
        true;
}


/* ==============================
   STOP GPS
   ============================== */

function stopGPS() {


    if (watchId !== null) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;
    }


    gpsStatus.textContent =
        "STOPPED";


    gpsStatus.style.color =
        "#777";


    startButton.disabled =
        false;


    stopButton.disabled =
        true;


    message.textContent =
        "GPS tracking stopped.";


    /*
       Mark ambulance inactive
    */

    const ambulanceRef =
        ref(
            window.firebaseDatabase,
            "ambulance"
        );


    set(
        ambulanceRef,
        {

            active: false,

            timestamp: Date.now()

        }

    )

        .then(() => {

            console.log(
                "Ambulance marked inactive"
            );

        })

        .catch((error) => {

            console.error(
                "Error updating active status:",
                error
            );

        });
}
