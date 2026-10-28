/*
 * ==============================================================================
 * SMART TRAFFIC AMBULANCE — 3-WAY JUNCTION TRAFFIC CONTROLLER [NODE: J3]
 * ==============================================================================
 * Hardware: ESP32 Development Board
 * Node Identifier: J3
 * 
 * Intersection Configuration (3-Way / T-Junction):
 * - ROAD 1 (Ambulance Corridor / Main Path): Red: 25, Yellow: 26, Green: 27
 * - ROAD 2 (Cross Road A):                   Red: 14, Yellow: 12, Green: 13
 * - ROAD 3 (Cross Road B):                   Red: 19, Yellow: 18, Green: 5
 * 
 * Operating Modes:
 * 1. NORMAL OPERATION (No Ambulance):
 *    - Fully automatic cyclic traffic light sequence:
 *      Road 1 GREEN (5s) -> YELLOW (1.5s) ->
 *      Road 2 GREEN (4s) -> YELLOW (1.5s) ->
 *      Road 3 GREEN (4s) -> YELLOW (1.5s) -> (Repeats)
 * 
 * 2. EMERGENCY PREEMPTION (Ambulance within 8m threshold -> PRIORITY_ACTIVE):
 *    - Instantly interrupts normal cycle.
 *    - Safely switches any active cross-road green to yellow for amber clearance (1.2s).
 *    - Sets ROAD 1 (Ambulance Path) to GREEN.
 *    - Sets ROAD 2 and ROAD 3 to RED (All cross traffic stopped).
 * 
 * 3. EMERGENCY RELEASE (Ambulance clears +8m -> PASSED):
 *    - Amber clearance on Road 1 (1.5s).
 *    - Sets Road 1 to RED.
 *    - Resumes normal 3-way cyclic rotation smoothly.
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>

// =====================================================
// 1. WI-FI & NODE CONFIGURATION
// =====================================================
const char* WIFI_SSID     = "vivo y200 5g";       // Enter your Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Enter your Wi-Fi password

const char* JUNCTION_ID   = "J3";                 // Node ID

// Firebase Realtime Database Base URL
const char* FIREBASE_URL  = "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app";

// =====================================================
// 2. GPIO PIN ASSIGNMENTS (9 LEDs Across 3 Roads)
// =====================================================
// ROAD 1: Ambulance Priority Corridor (Main Path)
const int PIN_R1_RED    = 25;
const int PIN_R1_YELLOW = 26;
const int PIN_R1_GREEN  = 27;

// ROAD 2: Cross Road A (Side Street)
const int PIN_R2_RED    = 14;
const int PIN_R2_YELLOW = 12;
const int PIN_R2_GREEN  = 13;

// ROAD 3: Cross Road B (Side Street)
const int PIN_R3_RED    = 19;
const int PIN_R3_YELLOW = 18;
const int PIN_R3_GREEN  = 5;

// =====================================================
// 3. TRAFFIC CYCLE TIMINGS (Milliseconds)
// =====================================================
const unsigned long DURATION_R1_GREEN  = 5000;
const unsigned long DURATION_R2_GREEN  = 4000;
const unsigned long DURATION_R3_GREEN  = 4000;
const unsigned long DURATION_YELLOW    = 1500;
const unsigned long DURATION_PREEMPT_CLEAR = 1200; // Amber clearance before emergency green

// =====================================================
// 4. STATE MACHINE DEFINITIONS
// =====================================================
enum NormalPhase {
  PHASE_R1_GREEN,
  PHASE_R1_YELLOW,
  PHASE_R2_GREEN,
  PHASE_R2_YELLOW,
  PHASE_R3_GREEN,
  PHASE_R3_YELLOW
};

enum PreemptState {
  STATE_NORMAL_RUNNING,
  STATE_PREEMPT_CLEARING, // Amber clearance for cross traffic
  STATE_PRIORITY_ACTIVE,  // Road 1 locked GREEN, Roads 2 & 3 locked RED
  STATE_RELEASE_CLEARING  // Road 1 amber clearance before returning to normal
};

// Runtime Variables
NormalPhase currentPhase = PHASE_R1_GREEN;
PreemptState preemptState = STATE_NORMAL_RUNNING;
unsigned long phaseStartTime = 0;
unsigned long preemptStartTime = 0;

String currentFirebaseStatus = "NORMAL";
String lastFirebaseStatus    = "";

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_MS = 350; // Fast Firebase polling

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 5000;

// Forward Declarations
void setRoad1(bool r, bool y, bool g);
void setRoad2(bool r, bool y, bool g);
void setRoad3(bool r, bool y, bool g);
void applyPhaseLeds(NormalPhase phase);

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Configure all 9 LED pins as OUTPUT
  pinMode(PIN_R1_RED, OUTPUT);
  pinMode(PIN_R1_YELLOW, OUTPUT);
  pinMode(PIN_R1_GREEN, OUTPUT);

  pinMode(PIN_R2_RED, OUTPUT);
  pinMode(PIN_R2_YELLOW, OUTPUT);
  pinMode(PIN_R2_GREEN, OUTPUT);

  pinMode(PIN_R3_RED, OUTPUT);
  pinMode(PIN_R3_YELLOW, OUTPUT);
  pinMode(PIN_R3_GREEN, OUTPUT);

  // Initial State: Safe All RED for 1 second
  setRoad1(true, false, false);
  setRoad2(true, false, false);
  setRoad3(true, false, false);

  Serial.println("\n\n============================================================");
  Serial.printf("🚦 SMART TRAFFIC 3-WAY JUNCTION CONTROLLER — [%s]\n", JUNCTION_ID);
  Serial.println("============================================================");
  Serial.println("[WIRING PINOUT]");
  Serial.println("  ROAD 1 (Ambulance Path): Red: 25 | Yellow: 26 | Green: 27");
  Serial.println("  ROAD 2 (Side Road A):    Red: 14 | Yellow: 12 | Green: 13");
  Serial.println("  ROAD 3 (Side Road B):    Red: 19 | Yellow: 18 | Green: 5");
  Serial.println("============================================================");

  connectWiFi();

  // Begin normal cyclic sequence at Road 1 Green
  currentPhase = PHASE_R1_GREEN;
  phaseStartTime = millis();
  applyPhaseLeds(currentPhase);

  Serial.println("[TRAFFIC] Automatic 3-Way Cycle Started: Road 1 GREEN");
  Serial.printf("[FIREBASE] Polling /junctionPriority/states/%s/status every 350ms\n", JUNCTION_ID);
  Serial.println("============================================================\n");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost! Reconnecting...");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  unsigned long now = millis();

  // 1. Fast Non-blocking Firebase Polling
  if (now - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = now;
    pollFirebasePriority();
  }

  // 2. Traffic Light Engine (Non-blocking State Machine)
  updateTrafficLights(now);

  // 3. Heartbeat to Firebase
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }
}

// =====================================================
// TRAFFIC LIGHT CONTROL ENGINE
// =====================================================
void updateTrafficLights(unsigned long now) {
  switch (preemptState) {
    
    // -------------------------------------------------
    // CASE A: Normal 3-Way Automatic Cycle
    // -------------------------------------------------
    case STATE_NORMAL_RUNNING: {
      unsigned long elapsed = now - phaseStartTime;

      switch (currentPhase) {
        case PHASE_R1_GREEN:
          if (elapsed >= DURATION_R1_GREEN) {
            currentPhase = PHASE_R1_YELLOW;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 1: YELLOW -> Clearing intersection");
          }
          break;

        case PHASE_R1_YELLOW:
          if (elapsed >= DURATION_YELLOW) {
            currentPhase = PHASE_R2_GREEN;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 2: GREEN (Cross Traffic Active)");
          }
          break;

        case PHASE_R2_GREEN:
          if (elapsed >= DURATION_R2_GREEN) {
            currentPhase = PHASE_R2_YELLOW;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 2: YELLOW -> Clearing intersection");
          }
          break;

        case PHASE_R2_YELLOW:
          if (elapsed >= DURATION_YELLOW) {
            currentPhase = PHASE_R3_GREEN;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 3: GREEN (Cross Traffic Active)");
          }
          break;

        case PHASE_R3_GREEN:
          if (elapsed >= DURATION_R3_GREEN) {
            currentPhase = PHASE_R3_YELLOW;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 3: YELLOW -> Clearing intersection");
          }
          break;

        case PHASE_R3_YELLOW:
          if (elapsed >= DURATION_YELLOW) {
            currentPhase = PHASE_R1_GREEN;
            phaseStartTime = now;
            applyPhaseLeds(currentPhase);
            Serial.println("[CYCLE] Road 1: GREEN (Main Path Active)");
          }
          break;
      }
      break;
    }

    // -------------------------------------------------
    // CASE B: Preemption Amber Clearance for Cross Traffic
    // -------------------------------------------------
    case STATE_PREEMPT_CLEARING: {
      if (now - preemptStartTime >= DURATION_PREEMPT_CLEAR) {
        // Cross traffic amber cleared -> Open Emergency Green on Road 1!
        preemptState = STATE_PRIORITY_ACTIVE;
        setRoad1(false, false, true); // Road 1: GREEN
        setRoad2(true, false, false); // Road 2: RED
        setRoad3(true, false, false); // Road 3: RED

        Serial.println("\n============================================================");
        Serial.printf("🚑 [JUNCTION %s] *** EMERGENCY PRIORITY ACTIVE! ***\n", JUNCTION_ID);
        Serial.println("🚦 ROAD 1 (Ambulance Path): [GREEN] -> CORRIDOR OPEN");
        Serial.println("🛑 ROAD 2 (Side Road A):    [RED]   -> STOPPED");
        Serial.println("🛑 ROAD 3 (Side Road B):    [RED]   -> STOPPED");
        Serial.println("============================================================\n");
      }
      break;
    }

    // -------------------------------------------------
    // CASE C: Priority Active (Hold Road 1 Green)
    // -------------------------------------------------
    case STATE_PRIORITY_ACTIVE: {
      // Hold emergency corridor in steady green
      setRoad1(false, false, true);
      setRoad2(true, false, false);
      setRoad3(true, false, false);
      break;
    }

    // -------------------------------------------------
    // CASE D: Priority Release Clearance (Amber on Road 1)
    // -------------------------------------------------
    case STATE_RELEASE_CLEARING: {
      if (now - preemptStartTime >= DURATION_YELLOW) {
        // Clearance complete -> Resume normal 3-way cycle at Road 2 Green!
        preemptState = STATE_NORMAL_RUNNING;
        currentPhase = PHASE_R2_GREEN; // Give turn to side road that waited
        phaseStartTime = now;
        applyPhaseLeds(currentPhase);

        Serial.println("\n============================================================");
        Serial.printf("✓ [JUNCTION %s] Normal 3-Way Cycle Restored\n", JUNCTION_ID);
        Serial.println("[CYCLE] Resuming with Road 2 GREEN");
        Serial.println("============================================================\n");
      }
      break;
    }
  }
}

// =====================================================
// FIREBASE PRIORITY MONITORING
// =====================================================
void pollFirebasePriority() {
  HTTPClient http;
  String url = String(FIREBASE_URL) + "/junctionPriority/states/" + JUNCTION_ID + "/status.json";
  http.begin(url);
  http.setTimeout(1200);

  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    String payload = http.getString();
    payload.trim();

    if (payload.startsWith("\"") && payload.endsWith("\"")) {
      payload = payload.substring(1, payload.length() - 1);
    }

    if (payload.length() > 0 && payload != currentFirebaseStatus) {
      lastFirebaseStatus = currentFirebaseStatus;
      currentFirebaseStatus = payload;
      handleFirebaseStatusChange(lastFirebaseStatus, currentFirebaseStatus);
    }
  }
  http.end();
}

void handleFirebaseStatusChange(String prev, String current) {
  unsigned long now = millis();

  // ---------------------------------------------------
  // EVENT 1: Ambulance Approaches Within 8m -> PRIORITY_ACTIVE
  // ---------------------------------------------------
  if (current == "PRIORITY_ACTIVE") {
    Serial.println("\n============================================================");
    Serial.printf("⚡ [JUNCTION %s] EMERGENCY DETECTED (Within 8m Threshold)!\n", JUNCTION_ID);
    Serial.println("============================================================");

    // If Road 2 or Road 3 is currently Green, grant Amber clearance first
    if (currentPhase == PHASE_R2_GREEN || currentPhase == PHASE_R2_YELLOW) {
      Serial.println("[PREEMPT] Clearing Road 2 with AMBER clearance...");
      setRoad1(true, false, false);
      setRoad2(false, true, false); // Road 2 Yellow
      setRoad3(true, false, false);
      preemptState = STATE_PREEMPT_CLEARING;
      preemptStartTime = now;
    }
    else if (currentPhase == PHASE_R3_GREEN || currentPhase == PHASE_R3_YELLOW) {
      Serial.println("[PREEMPT] Clearing Road 3 with AMBER clearance...");
      setRoad1(true, false, false);
      setRoad2(true, false, false);
      setRoad3(false, true, false); // Road 3 Yellow
      preemptState = STATE_PREEMPT_CLEARING;
      preemptStartTime = now;
    }
    else {
      // Road 1 was already Green/Yellow -> Switch directly to Green!
      preemptState = STATE_PRIORITY_ACTIVE;
      setRoad1(false, false, true);
      setRoad2(true, false, false);
      setRoad3(true, false, false);

      Serial.println("🚦 ROAD 1 (Ambulance Path): [GREEN] -> CORRIDOR OPEN");
      Serial.println("🛑 ROAD 2 (Side Road A):    [RED]   -> STOPPED");
      Serial.println("🛑 ROAD 3 (Side Road B):    [RED]   -> STOPPED");
    }
  }

  // ---------------------------------------------------
  // EVENT 2: Ambulance Passes Beyond 8m -> PASSED
  // ---------------------------------------------------
  else if (current == "PASSED" || (prev == "PRIORITY_ACTIVE" && current != "PRIORITY_ACTIVE")) {
    Serial.println("\n============================================================");
    Serial.printf("✓ [JUNCTION %s] *** AMBULANCE PASSED (+8m BEYOND JUNCTION) ***\n", JUNCTION_ID);
    Serial.println("🚦 ROAD 1: AMBER CLEARANCE -> RELEASING EMERGENCY PRIORITY");
    Serial.println("⏭️ HANDOFF: CONTROL TRANSFERRED TO NEXT JUNCTION");
    Serial.println("============================================================\n");

    // Amber clearance on Road 1 before returning to normal cycle
    setRoad1(false, true, false); // Yellow
    setRoad2(true, false, false); // Red
    setRoad3(true, false, false); // Red
    preemptState = STATE_RELEASE_CLEARING;
    preemptStartTime = now;
  }

  // ---------------------------------------------------
  // EVENT 3: Upcoming Junction Alert -> NEXT
  // ---------------------------------------------------
  else if (current == "NEXT") {
    Serial.println("------------------------------------------------------------");
    Serial.printf(">> [JUNCTION %s] STATUS: NEXT\n", JUNCTION_ID);
    Serial.println("   Ambulance is approaching along route. Armed for 8m trigger.");
    Serial.println("   (Normal 3-Way cycle continues until 8m mark)");
    Serial.println("------------------------------------------------------------");
  }

  // ---------------------------------------------------
  // EVENT 4: Queued Behind Prior Junction -> WAITING
  // ---------------------------------------------------
  else if (current == "WAITING") {
    Serial.printf(">> [JUNCTION %s] STATUS: WAITING (Queued on route, normal cycle running)\n", JUNCTION_ID);
  }

  else {
    Serial.printf(">> [JUNCTION %s] STATUS: %s (Normal 3-Way Cycle Active)\n", JUNCTION_ID, current.c_str());
  }
}

// =====================================================
// HARDWARE LED CONTROL HELPERS
// =====================================================
void setRoad1(bool r, bool y, bool g) {
  digitalWrite(PIN_R1_RED,    r ? HIGH : LOW);
  digitalWrite(PIN_R1_YELLOW, y ? HIGH : LOW);
  digitalWrite(PIN_R1_GREEN,  g ? HIGH : LOW);
}

void setRoad2(bool r, bool y, bool g) {
  digitalWrite(PIN_R2_RED,    r ? HIGH : LOW);
  digitalWrite(PIN_R2_YELLOW, y ? HIGH : LOW);
  digitalWrite(PIN_R2_GREEN,  g ? HIGH : LOW);
}

void setRoad3(bool r, bool y, bool g) {
  digitalWrite(PIN_R3_RED,    r ? HIGH : LOW);
  digitalWrite(PIN_R3_YELLOW, y ? HIGH : LOW);
  digitalWrite(PIN_R3_GREEN,  g ? HIGH : LOW);
}

void applyPhaseLeds(NormalPhase phase) {
  switch (phase) {
    case PHASE_R1_GREEN:
      setRoad1(false, false, true);
      setRoad2(true, false, false);
      setRoad3(true, false, false);
      break;

    case PHASE_R1_YELLOW:
      setRoad1(false, true, false);
      setRoad2(true, false, false);
      setRoad3(true, false, false);
      break;

    case PHASE_R2_GREEN:
      setRoad1(true, false, false);
      setRoad2(false, false, true);
      setRoad3(true, false, false);
      break;

    case PHASE_R2_YELLOW:
      setRoad1(true, false, false);
      setRoad2(false, true, false);
      setRoad3(true, false, false);
      break;

    case PHASE_R3_GREEN:
      setRoad1(true, false, false);
      setRoad2(true, false, false);
      setRoad3(false, false, true);
      break;

    case PHASE_R3_YELLOW:
      setRoad1(true, false, false);
      setRoad2(true, false, false);
      setRoad3(false, true, false);
      break;
  }
}

// =====================================================
// WI-FI & TELEMETRY
// =====================================================
void connectWiFi() {
  Serial.printf("[WIFI] Connecting to '%s'", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" CONNECTED!");
    Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Warning: Could not connect. Check credentials.");
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(FIREBASE_URL) + "/junctionDevices/" + JUNCTION_ID + ".json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"id\":\"" + String(JUNCTION_ID) + "\",\"online\":true,\"status\":\"" + currentFirebaseStatus + "\",\"mode\":\"3-WAY-TRAFFIC\"}";
  http.PUT(body);
  http.end();
}
