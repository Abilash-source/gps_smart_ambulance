/*
=========================================================
SMART TRAFFIC AMBULANCE - DEMO MODE
=========================================================

DEMO FLOW

FIXED DEMO AMBULANCE
11.0172444, 76.9350377
        ↓
SELECT HOSPITAL
        ↓
ACTUAL OSRM ROAD ROUTE
        ↓
CHECK FIXED JUNCTIONS
        ↓
ONLY JUNCTIONS NEAR ACTUAL ROUTE
        ↓
ORDER JUNCTIONS BY ROUTE POSITION
        ↓
NEXT JUNCTION
        ↓
TRAFFIC PRIORITY

IMPORTANT:
Browser geolocation is NOT used in this demo.

Later:

NEO-6M GPS
    ↓
ESP32
    ↓
Wi-Fi
    ↓
Firebase
    ↓
Web Dashboard

=========================================================
*/


/* ======================================================
   FIREBASE
====================================================== */

import {
    initializeApp
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    onValue
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyCDtZaALGEdyZpwgHlgGVd1AYfmOhi6dZ0",

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


const firebaseApp =
    initializeApp(firebaseConfig);

const database =
    getDatabase(firebaseApp);


/* ======================================================
   FIXED TRAFFIC JUNCTIONS
====================================================== */

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


/* ======================================================
   DEMO HOSPITALS
====================================================== */

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
    }

];


/* ======================================================
   FIXED DEMO AMBULANCE LOCATION
====================================================== */

const DEMO_AMBULANCE_LOCATION = {

    latitude: 11.0172444,

    longitude: 76.9350377,

    /*
        This is only a demo accuracy value.
        It is NOT actual GPS accuracy.
    */

    accuracy: 5

};


/* ======================================================
   ROUTE SETTINGS
====================================================== */

/*
    If an actual OSRM road route passes within
    this distance of a fixed junction, that junction
    is considered part of the route.
*/

const JUNCTION_ROUTE_RADIUS = 20;


/*
    Ambulance enters priority zone when it is
    within 100 m of the next junction.
*/

const PRIORITY_DISTANCE = 100;


/*
    Ambulance is considered AT the junction
    within 30 m.
*/

const PASSED_DISTANCE = 30;


/* ======================================================
   HTML ELEMENTS
====================================================== */

const startButton =
    document.getElementById("startButton");

const stopButton =
    document.getElementById("stopButton");

const routeButton =
    document.getElementById("routeButton");

const hospitalSelect =
    document.getElementById("hospitalSelect");

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

const messageElement =
    document.getElementById("message");


/* ======================================================
   MAP VARIABLES
====================================================== */

let map = null;

let ambulanceMarker = null;

let ambulanceAccuracyCircle = null;

let hospitalMarker = null;

let routeLine = null;

let junctionMarkers = [];


/* ======================================================
   APPLICATION VARIABLES
====================================================== */

let currentAmbulanceLocation = null;

let selectedHospital = null;

let routeJunctions = [];

let currentRouteCoordinates = [];

let routeCumulativeDistances = [];

let demoActive = false;


/* ======================================================
   INITIALIZE HOSPITAL SELECT
====================================================== */

function initializeHospitalSelect() {

    hospitalSelect.innerHTML = "";


    hospitals.forEach(

        function (hospital) {

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

}


/* ======================================================
   INITIALIZE MAP
====================================================== */

function initializeMap() {

    if (
        typeof L === "undefined"
    ) {

        messageElement.textContent =
            "Leaflet failed to load.";

        return;

    }


    map = L.map("map").setView(

        [
            11.018000,
            76.934700
        ],

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


    /* ==================================================
       FIXED JUNCTION MARKERS
    ================================================== */

    junctions.forEach(

        function (junction) {

            const marker =

                L.circleMarker(

                    [

                        junction.latitude,

                        junction.longitude

                    ],

                    {

                        radius: 10,

                        color: "white",

                        weight: 3,

                        fillColor: "#1976d2",

                        fillOpacity: 1

                    }

                ).addTo(map);


            marker.bindPopup(`

                <b>🚦 ${junction.name}</b>

                <br><br>

                Latitude:
                ${junction.latitude}

                <br>

                Longitude:
                ${junction.longitude}

            `);


            marker.bindTooltip(

                junction.id,

                {

                    permanent: true,

                    direction: "top"

                }

            );


            junctionMarkers.push(marker);

        }

    );


    /* ==================================================
       FIT JUNCTION AREA
    ================================================== */

    const points =

        junctions.map(

            function (junction) {

                return [

                    junction.latitude,

                    junction.longitude

                ];

            }

        );


    map.fitBounds(

        L.latLngBounds(points),

        {

            padding: [

                70,

                70

            ]

        }

    );


    setTimeout(

        function () {

            map.invalidateSize();

        },

        500

    );

}


/* ======================================================
   HAVERSINE DISTANCE
====================================================== */

function distanceBetweenPoints(

    lat1,
    lon1,
    lat2,
    lon2

) {

    const R =
        6371000;


    const dLat =

        toRadians(
            lat2 - lat1
        );


    const dLon =

        toRadians(
            lon2 - lon1
        );


    const a =

        Math.sin(
            dLat / 2
        ) ** 2

        +

        Math.cos(
            toRadians(lat1)
        )

        *

        Math.cos(
            toRadians(lat2)
        )

        *

        Math.sin(
            dLon / 2
        ) ** 2;


    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );


    return R * c;

}


/* ======================================================
   RADIANS
====================================================== */

function toRadians(degrees) {

    return (

        degrees *

        Math.PI /

        180

    );

}


/* ======================================================
   POINT TO SEGMENT DISTANCE
====================================================== */

function pointToSegmentDistance(

    point,
    segmentStart,
    segmentEnd

) {

    const latReference =

        point[0] *

        Math.PI /

        180;


    const metersPerLat =
        111320;


    const metersPerLon =

        111320 *

        Math.cos(
            latReference
        );


    const px =

        point[1] *

        metersPerLon;


    const py =

        point[0] *

        metersPerLat;


    const x1 =

        segmentStart[1] *

        metersPerLon;


    const y1 =

        segmentStart[0] *

        metersPerLat;


    const x2 =

        segmentEnd[1] *

        metersPerLon;


    const y2 =

        segmentEnd[0] *

        metersPerLat;


    const dx =
        x2 - x1;


    const dy =
        y2 - y1;


    if (

        dx === 0 &&

        dy === 0

    ) {

        return Math.sqrt(

            (px - x1) ** 2 +

            (py - y1) ** 2

        );

    }


    let t =

        (

            (px - x1) * dx +

            (py - y1) * dy

        )

        /

        (

            dx * dx +

            dy * dy

        );


    t = Math.max(

        0,

        Math.min(
            1,
            t
        )

    );


    const nearestX =

        x1 +

        t * dx;


    const nearestY =

        y1 +

        t * dy;


    return Math.sqrt(

        (px - nearestX) ** 2 +

        (py - nearestY) ** 2

    );

}


/* ======================================================
   FIND DISTANCE FROM JUNCTION TO ROUTE
====================================================== */

function findJunctionRouteDistance(

    junction,
    routeCoordinates

) {

    const point = [

        junction.latitude,

        junction.longitude

    ];


    let minimumDistance =
        Infinity;


    let bestSegmentIndex =
        0;


    for (

        let i = 0;

        i < routeCoordinates.length - 1;

        i++

    ) {

        const distance =

            pointToSegmentDistance(

                point,

                routeCoordinates[i],

                routeCoordinates[i + 1]

            );


        if (

            distance <

            minimumDistance

        ) {

            minimumDistance =
                distance;

            bestSegmentIndex =
                i;

        }

    }


    return {

        distance:
            minimumDistance,

        segmentIndex:
            bestSegmentIndex

    };

}


/* ======================================================
   BUILD CUMULATIVE ROUTE DISTANCE
====================================================== */

function buildRouteCumulativeDistances(

    routeCoordinates

) {

    const cumulative = [

        0

    ];


    for (

        let i = 1;

        i < routeCoordinates.length;

        i++

    ) {

        const previous =
            routeCoordinates[i - 1];


        const current =
            routeCoordinates[i];


        const segmentDistance =

            distanceBetweenPoints(

                previous[0],

                previous[1],

                current[0],

                current[1]

            );


        cumulative.push(

            cumulative[i - 1] +

            segmentDistance

        );

    }


    return cumulative;

}


/* ======================================================
   GET EXACT JUNCTION POSITION ON ROUTE
====================================================== */

function getJunctionRoutePosition(

    junction,
    routeCoordinates

) {

    const result =

        findJunctionRouteDistance(

            junction,

            routeCoordinates

        );


    const segmentIndex =
        result.segmentIndex;


    const start =
        routeCoordinates[
            segmentIndex
        ];


    const end =
        routeCoordinates[
            segmentIndex + 1
        ];


    const latReference =

        junction.latitude *

        Math.PI /

        180;


    const metersPerLat =
        111320;


    const metersPerLon =

        111320 *

        Math.cos(
            latReference
        );


    const px =

        junction.longitude *

        metersPerLon;


    const py =

        junction.latitude *

        metersPerLat;


    const x1 =

        start[1] *

        metersPerLon;


    const y1 =

        start[0] *

        metersPerLat;


    const x2 =

        end[1] *

        metersPerLon;


    const y2 =

        end[0] *

        metersPerLat;


    const dx =
        x2 - x1;


    const dy =
        y2 - y1;


    let t = 0;


    if (

        dx !== 0 ||

        dy !== 0

    ) {

        t =

            (

                (px - x1) * dx +

                (py - y1) * dy

            )

            /

            (

                dx * dx +

                dy * dy

            );


        t = Math.max(

            0,

            Math.min(
                1,
                t
            )

        );

    }


    const segmentLength =

        distanceBetweenPoints(

            start[0],

            start[1],

            end[0],

            end[1]

        );


    const routeDistance =

        routeCumulativeDistances[
            segmentIndex
        ]

        +

        (

            t *

            segmentLength

        );


    return {

        distanceToRoute:
            result.distance,

        routeDistance:
            routeDistance

    };

}


/* ======================================================
   FIND AMBULANCE POSITION ON ROUTE
====================================================== */

function getAmbulanceRouteDistance() {

    if (

        !currentAmbulanceLocation ||

        currentRouteCoordinates.length < 2

    ) {

        return null;

    }


    const point = [

        currentAmbulanceLocation.latitude,

        currentAmbulanceLocation.longitude

    ];


    let minimumDistance =
        Infinity;


    let bestSegment =
        0;


    let bestT =
        0;


    for (

        let i = 0;

        i < currentRouteCoordinates.length - 1;

        i++

    ) {

        const start =
            currentRouteCoordinates[i];


        const end =
            currentRouteCoordinates[i + 1];


        const latReference =

            point[0] *

            Math.PI /

            180;


        const metersPerLat =
            111320;


        const metersPerLon =

            111320 *

            Math.cos(
                latReference
            );


        const px =

            point[1] *

            metersPerLon;


        const py =

            point[0] *

            metersPerLat;


        const x1 =

            start[1] *

            metersPerLon;


        const y1 =

            start[0] *

            metersPerLat;


        const x2 =

            end[1] *

            metersPerLon;


        const y2 =

            end[0] *

            metersPerLat;


        const dx =
            x2 - x1;


        const dy =
            y2 - y1;


        if (

            dx === 0 &&

            dy === 0

        ) {

            continue;

        }


        let t =

            (

                (px - x1) * dx +

                (py - y1) * dy

            )

            /

            (

                dx * dx +

                dy * dy

            );


        t = Math.max(

            0,

            Math.min(
                1,
                t
            )

        );


        const nearestX =
            x1 + t * dx;


        const nearestY =
            y1 + t * dy;


        const distance =

            Math.sqrt(

                (px - nearestX) ** 2 +

                (py - nearestY) ** 2

            );


        if (

            distance <

            minimumDistance

        ) {

            minimumDistance =
                distance;

            bestSegment =
                i;

            bestT =
                t;

        }

    }


    const start =

        currentRouteCoordinates[
            bestSegment
        ];


    const end =

        currentRouteCoordinates[
            bestSegment + 1
        ];


    const segmentLength =

        distanceBetweenPoints(

            start[0],

            start[1],

            end[0],

            end[1]

        );


    return (

        routeCumulativeDistances[
            bestSegment
        ]

        +

        (

            bestT *

            segmentLength

        )

    );

}


/* ======================================================
   CALCULATE ACTUAL ROAD ROUTE
====================================================== */

async function calculateRoute() {

    if (!selectedHospital) {

        messageElement.textContent =
            "Please select a hospital.";

        return;

    }


    if (!currentAmbulanceLocation) {

        messageElement.textContent =
            "Demo ambulance location is not available.";

        return;

    }


    messageElement.textContent =
        "Calculating actual road route...";


    routeButton.disabled =
        true;


    try {

        const startLat =
            currentAmbulanceLocation.latitude;


        const startLon =
            currentAmbulanceLocation.longitude;


        const destinationLat =
            selectedHospital.latitude;


        const destinationLon =
            selectedHospital.longitude;


        /*
            OSRM coordinate format:

            longitude,latitude
        */

        const coordinates =

            `${startLon},${startLat};` +

            `${destinationLon},${destinationLat}`;


        const url =

            `https://router.project-osrm.org/route/v1/driving/${coordinates}` +

            `?overview=full&geometries=geojson&steps=true`;


        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                "OSRM routing server error."
            );

        }


        const data =
            await response.json();


        if (

            data.code !== "Ok" ||

            !data.routes ||

            data.routes.length === 0

        ) {

            throw new Error(
                "No road route found."
            );

        }


        const route =
            data.routes[0];


        /* ==================================================
           CONVERT OSRM COORDINATES
        ================================================== */

        const routeCoordinates =

            route.geometry.coordinates.map(

                function (coordinate) {

                    return [

                        coordinate[1],

                        coordinate[0]

                    ];

                }

            );


        currentRouteCoordinates =
            routeCoordinates;


        routeCumulativeDistances =

            buildRouteCumulativeDistances(

                routeCoordinates

            );


        /* ==================================================
           DRAW ROUTE
        ================================================== */

        if (routeLine) {

            map.removeLayer(
                routeLine
            );

        }


        routeLine =

            L.polyline(

                routeCoordinates,

                {

                    color: "#1565c0",

                    weight: 6,

                    opacity: 0.85

                }

            ).addTo(map);


        /* ==================================================
           HOSPITAL MARKER
        ================================================== */

        if (hospitalMarker) {

            map.removeLayer(
                hospitalMarker
            );

        }


        hospitalMarker =

            L.circleMarker(

                [

                    selectedHospital.latitude,

                    selectedHospital.longitude

                ],

                {

                    radius: 12,

                    color: "white",

                    weight: 3,

                    fillColor: "#7b1fa2",

                    fillOpacity: 1

                }

            ).addTo(map);


        hospitalMarker.bindPopup(`

            <b>🏥 ${selectedHospital.name}</b>

            <br><br>

            Latitude:
            ${selectedHospital.latitude}

            <br>

            Longitude:
            ${selectedHospital.longitude}

        `);


        hospitalMarker.bindTooltip(

            "🏥 Hospital",

            {

                permanent: true,

                direction: "top"

            }

        );


        /* ==================================================
           FIND JUNCTIONS ACTUALLY ON ROUTE
        ================================================== */

        const foundJunctions = [];


        junctions.forEach(

            function (junction) {

                const position =

                    getJunctionRoutePosition(

                        junction,

                        routeCoordinates

                    );


                /*
                    IMPORTANT:

                    We DO NOT add the junction
                    to the OSRM route.

                    We only check the actual
                    road geometry.
                */

                if (

                    position.distanceToRoute <=

                    JUNCTION_ROUTE_RADIUS

                ) {

                    foundJunctions.push({

                        junction:
                            junction,

                        distanceToRoute:
                            position.distanceToRoute,

                        routeDistance:
                            position.routeDistance

                    });

                }

            }

        );


        /* ==================================================
           ORDER JUNCTIONS ALONG ROUTE
        ================================================== */

        foundJunctions.sort(

            function (a, b) {

                return (

                    a.routeDistance -

                    b.routeDistance

                );

            }

        );


        routeJunctions =
            foundJunctions;


        /* ==================================================
           UPDATE ROUTE INFORMATION
        ================================================== */

        destinationNameElement.textContent =
            selectedHospital.name;


        routeDistanceElement.textContent =

            formatDistance(
                route.distance
            );


        routeTimeElement.textContent =

            formatDuration(
                route.duration
            );


        displayJunctionSequence();


        updateNextJunction();


        /* ==================================================
           FIT ROUTE ON MAP
        ================================================== */

        map.fitBounds(

            L.latLngBounds(
                routeCoordinates
            ),

            {

                padding: [

                    50,

                    50

                ]

            }

        );


        /* ==================================================
           MESSAGE
        ================================================== */

        if (
            foundJunctions.length > 0
        ) {

            messageElement.textContent =

                `Route calculated. ` +

                `${foundJunctions.length} ` +

                `fixed junction(s) detected on the actual route.`;

        }

        else {

            messageElement.textContent =

                "Route calculated. No fixed junction is close enough to this route.";

        }

    }

    catch (error) {

        console.error(
            "Route error:",
            error
        );


        messageElement.textContent =

            "Unable to calculate road route. Try again.";

    }

    finally {

        routeButton.disabled =
            false;

    }

}


/* ======================================================
   DISPLAY JUNCTION SEQUENCE
====================================================== */

function displayJunctionSequence() {

    junctionSequenceElement.innerHTML =
        "";


    if (

        routeJunctions.length === 0

    ) {

        junctionSequenceElement.textContent =

            "No fixed junction detected on this route.";

        return;

    }


    /* ==================================================
       AMBULANCE
    ================================================== */

    const ambulanceItem =
        document.createElement("span");


    ambulanceItem.className =
        "sequence-item";


    ambulanceItem.textContent =
        "🚑 Ambulance";


    junctionSequenceElement.appendChild(
        ambulanceItem
    );


    /* ==================================================
       JUNCTIONS
    ================================================== */

    routeJunctions.forEach(

        function (item) {

            const arrow =
                document.createElement("span");


            arrow.className =
                "sequence-arrow";


            arrow.textContent =
                "→";


            junctionSequenceElement.appendChild(
                arrow
            );


            const junction =
                document.createElement("span");


            junction.className =
                "sequence-item";


            junction.textContent =

                "🚦 " +

                item.junction.id;


            junctionSequenceElement.appendChild(
                junction
            );

        }

    );


    /* ==================================================
       HOSPITAL
    ================================================== */

    const hospitalArrow =
        document.createElement("span");


    hospitalArrow.className =
        "sequence-arrow";


    hospitalArrow.textContent =
        "→";


    junctionSequenceElement.appendChild(
        hospitalArrow
    );


    const hospitalItem =
        document.createElement("span");


    hospitalItem.className =
        "sequence-hospital";


    hospitalItem.textContent =

        "🏥 " +

        selectedHospital.name;


    junctionSequenceElement.appendChild(
        hospitalItem
    );

}


/* ======================================================
   UPDATE NEXT JUNCTION
====================================================== */

function updateNextJunction() {

    if (
        !currentAmbulanceLocation
    ) {

        return;

    }


    if (
        routeJunctions.length === 0
    ) {

        nextJunctionElement.textContent =
            "None";


        junctionDistanceElement.textContent =
            "--";


        routeStatusElement.textContent =
            "No Junction";


        routeStatusElement.style.color =
            "#333";


        return;

    }


    const ambulanceRouteDistance =

        getAmbulanceRouteDistance();


    if (
        ambulanceRouteDistance === null
    ) {

        return;

    }


    let nextJunction =
        null;


    let nextDistance =
        Infinity;


    /* ==================================================
       FIND FIRST JUNCTION AHEAD
    ================================================== */

    for (

        let i = 0;

        i < routeJunctions.length;

        i++

    ) {

        const item =
            routeJunctions[i];


        const distance =

            distanceBetweenPoints(

                currentAmbulanceLocation.latitude,

                currentAmbulanceLocation.longitude,

                item.junction.latitude,

                item.junction.longitude

            );


        /*
            Junction must still be ahead
            on the route.
        */

        if (

            item.routeDistance >=

            ambulanceRouteDistance -

            PASSED_DISTANCE

        ) {

            nextJunction =
                item;

            nextDistance =
                distance;

            break;

        }

    }


    /* ==================================================
       ALL JUNCTIONS PASSED
    ================================================== */

    if (!nextJunction) {

        nextJunctionElement.textContent =
            "None";


        junctionDistanceElement.textContent =
            "--";


        routeStatusElement.textContent =
            "ALL JUNCTIONS PASSED";


        routeStatusElement.style.color =
            "green";


        return;

    }


    /* ==================================================
       DISPLAY NEXT JUNCTION
    ================================================== */

    nextJunctionElement.textContent =

        nextJunction.junction.name;


    junctionDistanceElement.textContent =

        formatDistance(
            nextDistance
        );


    /* ==================================================
       AT JUNCTION
    ================================================== */

    if (

        nextDistance <=

        PASSED_DISTANCE

    ) {

        routeStatusElement.textContent =
            "🚑 AT JUNCTION";


        routeStatusElement.style.color =
            "green";

    }


    /* ==================================================
       PRIORITY ZONE
    ================================================== */

    else if (

        nextDistance <=

        PRIORITY_DISTANCE

    ) {

        routeStatusElement.textContent =
            "🚨 PRIORITY ZONE";


        routeStatusElement.style.color =
            "red";

    }


    /* ==================================================
       NORMAL
    ================================================== */

    else {

        routeStatusElement.textContent =
            "NORMAL";


        routeStatusElement.style.color =
            "#333";

    }

}


/* ======================================================
   FORMAT DISTANCE
====================================================== */

function formatDistance(meters) {

    if (
        meters < 1000
    ) {

        return (

            meters.toFixed(0) +

            " m"

        );

    }


    return (

        (

            meters /

            1000

        ).toFixed(2) +

        " km"

    );

}


/* ======================================================
   FORMAT TIME
====================================================== */

function formatDuration(seconds) {

    const minutes =

        Math.round(

            seconds /

            60

        );


    if (
        minutes < 60
    ) {

        return (

            minutes +

            " min"

        );

    }


    const hours =

        Math.floor(

            minutes /

            60

        );


    const remainingMinutes =

        minutes %

        60;


    return (

        hours +

        " hr " +

        remainingMinutes +

        " min"

    );

}


/* ======================================================
   UPDATE AMBULANCE MARKER
====================================================== */

function updateAmbulanceMarker(

    lat,
    lon,
    accuracy

) {

    const position = [

        lat,

        lon

    ];


    if (!ambulanceMarker) {

        ambulanceMarker =

            L.circleMarker(

                position,

                {

                    radius: 12,

                    color: "white",

                    weight: 4,

                    fillColor: "#e53935",

                    fillOpacity: 1

                }

            ).addTo(map);


        ambulanceMarker.bindTooltip(

            "🚑 Ambulance",

            {

                permanent: true,

                direction: "top"

            }

        );


        ambulanceAccuracyCircle =

            L.circle(

                position,

                {

                    radius:
                        accuracy,

                    color:
                        "#e53935",

                    fillColor:
                        "#e53935",

                    fillOpacity:
                        0.10

                }

            ).addTo(map);

    }

    else {

        ambulanceMarker.setLatLng(
            position
        );


        ambulanceAccuracyCircle

            .setLatLng(
                position
            )

            .setRadius(
                accuracy
            );

    }

}


/* ======================================================
   START DEMO
====================================================== */

function startGPS() {

    /*
        This function is intentionally named startGPS
        because the existing HTML button uses that
        function.

        In DEMO MODE there is no browser GPS.

        The ambulance position is fixed.
    */

    currentAmbulanceLocation = {

        latitude:
            DEMO_AMBULANCE_LOCATION.latitude,

        longitude:
            DEMO_AMBULANCE_LOCATION.longitude,

        accuracy:
            DEMO_AMBULANCE_LOCATION.accuracy

    };


    demoActive =
        true;


    /* ==================================================
       UPDATE UI
    ================================================== */

    latitudeElement.textContent =

        DEMO_AMBULANCE_LOCATION.latitude.toFixed(6);


    longitudeElement.textContent =

        DEMO_AMBULANCE_LOCATION.longitude.toFixed(6);


    accuracyElement.textContent =

        DEMO_AMBULANCE_LOCATION.accuracy.toFixed(1) +

        " m";


    lastUpdateElement.textContent =

        new Date().toLocaleTimeString();


    gpsStatus.textContent =
        "DEMO ACTIVE";


    gpsStatus.style.color =
        "green";


    startButton.disabled =
        true;


    stopButton.disabled =
        false;


    /* ==================================================
       UPDATE MAP
    ================================================== */

    updateAmbulanceMarker(

        DEMO_AMBULANCE_LOCATION.latitude,

        DEMO_AMBULANCE_LOCATION.longitude,

        DEMO_AMBULANCE_LOCATION.accuracy

    );


    updateNextJunction();


    /* ==================================================
       WRITE DEMO LOCATION TO FIREBASE
    ================================================== */

    writeDemoLocationToFirebase();


    messageElement.textContent =

        "Demo ambulance active at fixed location.";

}


/* ======================================================
   WRITE DEMO LOCATION TO FIREBASE
====================================================== */

function writeDemoLocationToFirebase() {

    const ambulanceRef =

        ref(

            database,

            "ambulance"

        );


    set(

        ambulanceRef,

        {

            latitude:
                DEMO_AMBULANCE_LOCATION.latitude,

            longitude:
                DEMO_AMBULANCE_LOCATION.longitude,

            accuracy:
                DEMO_AMBULANCE_LOCATION.accuracy,

            timestamp:
                Date.now(),

            active:
                true,

            mode:
                "demo-fixed"

        }

    )

    .then(

        function () {

            firebaseStatus.textContent =
                "CONNECTED";


            firebaseStatus.style.color =
                "green";

        }

    )

    .catch(

        function (error) {

            console.error(

                "Firebase write error:",

                error

            );


            firebaseStatus.textContent =
                "ERROR";


            firebaseStatus.style.color =
                "red";

        }

    );

}


/* ======================================================
   STOP DEMO
====================================================== */

function stopGPS() {

    demoActive =
        false;


    gpsStatus.textContent =
        "STOPPED";


    gpsStatus.style.color =
        "#777";


    startButton.disabled =
        false;


    stopButton.disabled =
        true;


    const ambulanceRef =

        ref(

            database,

            "ambulance"

        );


    set(

        ambulanceRef,

        {

            latitude:
                DEMO_AMBULANCE_LOCATION.latitude,

            longitude:
                DEMO_AMBULANCE_LOCATION.longitude,

            accuracy:
                DEMO_AMBULANCE_LOCATION.accuracy,

            timestamp:
                Date.now(),

            active:
                false,

            mode:
                "demo-fixed"

        }

    )

    .catch(

        function (error) {

            console.error(

                "Firebase stop error:",

                error

            );

        }

    );


    messageElement.textContent =

        "Demo ambulance tracking stopped.";

}


/* ======================================================
   FIREBASE LIVE LISTENER
====================================================== */

const ambulanceRef =

    ref(

        database,

        "ambulance"

    );


onValue(

    ambulanceRef,

    function (snapshot) {

        const data =
            snapshot.val();


        /*
            Firebase is only used to confirm
            database connectivity in DEMO MODE.

            Firebase data is NOT allowed to
            change the fixed ambulance position.
        */

        if (data) {

            firebaseStatus.textContent =
                "CONNECTED";


            firebaseStatus.style.color =
                "green";

        }

    },

    function (error) {

        console.error(

            "Firebase listener:",

            error

        );


        firebaseStatus.textContent =
            "ERROR";


        firebaseStatus.style.color =
            "red";

    }

);


/* ======================================================
   BUTTON EVENTS
====================================================== */

startButton.addEventListener(

    "click",

    startGPS

);


stopButton.addEventListener(

    "click",

    stopGPS

);


routeButton.addEventListener(

    "click",

    calculateRoute

);


/* ======================================================
   HOSPITAL SELECTION
====================================================== */

hospitalSelect.addEventListener(

    "change",

    function () {

        const hospitalId =
            hospitalSelect.value;


        selectedHospital =

            hospitals.find(

                function (hospital) {

                    return (

                        hospital.id ===

                        hospitalId

                    );

                }

            );


        if (
            selectedHospital
        ) {

            destinationNameElement.textContent =

                selectedHospital.name;


            /*
                Clear previous route when
                destination changes.
            */

            if (routeLine) {

                map.removeLayer(
                    routeLine
                );

                routeLine =
                    null;

            }


            if (hospitalMarker) {

                map.removeLayer(
                    hospitalMarker
                );

                hospitalMarker =
                    null;

            }


            routeJunctions = [];

            currentRouteCoordinates = [];

            routeCumulativeDistances = [];


            routeDistanceElement.textContent =
                "--";


            routeTimeElement.textContent =
                "--";


            nextJunctionElement.textContent =
                "None";


            junctionDistanceElement.textContent =
                "--";


            routeStatusElement.textContent =
                "Select Route";


            routeStatusElement.style.color =
                "#333";


            junctionSequenceElement.textContent =
                "Route not calculated.";

        }

    }

);


/* ======================================================
   INITIALIZE APPLICATION
====================================================== */

initializeHospitalSelect();

initializeMap();


/* ======================================================
   SET FIXED DEMO AMBULANCE
====================================================== */

currentAmbulanceLocation = {

    latitude:
        DEMO_AMBULANCE_LOCATION.latitude,

    longitude:
        DEMO_AMBULANCE_LOCATION.longitude,

    accuracy:
        DEMO_AMBULANCE_LOCATION.accuracy

};


/* ======================================================
   SELECT HOSPITAL A BY DEFAULT
====================================================== */

selectedHospital =
    hospitals[0];


hospitalSelect.value =
    selectedHospital.id;


destinationNameElement.textContent =
    selectedHospital.name;


/* ======================================================
   INITIAL DISPLAY
====================================================== */

latitudeElement.textContent =

    DEMO_AMBULANCE_LOCATION.latitude.toFixed(6);


longitudeElement.textContent =

    DEMO_AMBULANCE_LOCATION.longitude.toFixed(6);


accuracyElement.textContent =

    DEMO_AMBULANCE_LOCATION.accuracy.toFixed(1) +

    " m";


lastUpdateElement.textContent =
    "--";


gpsStatus.textContent =
    "DEMO READY";


gpsStatus.style.color =
    "#1565c0";


firebaseStatus.textContent =
    "CONNECTING...";


firebaseStatus.style.color =
    "orange";


destinationNameElement.textContent =
    selectedHospital.name;


routeDistanceElement.textContent =
    "--";


routeTimeElement.textContent =
    "--";


nextJunctionElement.textContent =
    "None";


junctionDistanceElement.textContent =
    "--";


routeStatusElement.textContent =
    "Select Route";


routeStatusElement.style.color =
    "#333";


junctionSequenceElement.textContent =
    "Start demo and calculate a route.";


/* ======================================================
   SHOW FIXED AMBULANCE IMMEDIATELY
====================================================== */

updateAmbulanceMarker(

    DEMO_AMBULANCE_LOCATION.latitude,

    DEMO_AMBULANCE_LOCATION.longitude,

    DEMO_AMBULANCE_LOCATION.accuracy

);


console.log(
    "======================================"
);

console.log(
    "SMART TRAFFIC AMBULANCE"
);

console.log(
    "DEMO MODE"
);

console.log(
    "Ambulance:",
    DEMO_AMBULANCE_LOCATION
);

console.log(
    "Hospitals:",
    hospitals
);

console.log(
    "Junctions:",
    junctions
);

console.log(
    "======================================"
);
