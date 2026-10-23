/*
 * ==============================================================================
 * SMART TRAFFIC AMBULANCE — ESP32 JUNCTION TRAFFIC CONTROLLER
 * ==============================================================================
 * Target Hardware: ESP32-WROOM-32 Development Board
 * Node ID: Configured per junction (e.g. J1, J2, J3, J4)
 * 
 * Safe Traffic Light Output (Section 12):
 * - Red LED:    GPIO 25 (Normal / Waiting / Next / Passed)
 * - Yellow LED: GPIO 26 (Transition clearance interval)
 * - Green LED:  GPIO 27 (Emergency Priority Corridor Active ONLY)
 * 
 * Target Endpoints:
 * - Read state:     /junctionPriority/states/{JUNCTION_ID}/status.json
 * - Read active ID: /junctionPriority/activeJunctionId.json
 * - Publish status: /junctionDevices/{JUNCTION_ID}.json
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// =====================================================
// USER CONFIGURATION (Change for each ESP32 board)
// =====================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Node Identifier: Set to "J1", "J2", "J3", or "J4" for each respective board
const char* JUNCTION_ID   = "J1";

// Firebase Realtime Database Base URL
const char* FIREBASE_URL  = "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app";

// =====================================================
// GPIO PIN ASSIGNMENTS
// =====================================================
const int PIN_LED_RED    = 25;
const int PIN_LED_YELLOW = 26;
const int PIN_LED_GREEN  = 27;

// Operational Variables
String currentStatus = "NORMAL";
String lastReportedStatus = "";
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_MS = 400; // Rapid priority response (400ms)

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 5000; // Heartbeat every 5s

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize GPIO outputs
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);

  // Set default safe traffic light state: Steady RED
  setLedsNormal();

  Serial.println();
  Serial.println("==================================================");
  Serial.printf("Smart Traffic Junction Controller Node: %s\n", JUNCTION_ID);
  Serial.println("==================================================");

  connectToWiFi();

  Serial.println("[FIREBASE] Initialized subscription loop.");
  Serial.printf("[FIREBASE] Target Path: /junctionPriority/states/%s/status\n", JUNCTION_ID);
  Serial.println("==================================================");
}

void loop() {
  // Maintain Wi-Fi connectivity
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost! Reconnecting...");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  unsigned long now = millis();

  // Fast poll loop for priority status
  if (now - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = now;
    pollJunctionPriority();
  }

  // Periodic heartbeat reporting
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendDeviceHeartbeat();
  }
}

void connectToWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("[WIFI] Connected! Assigned IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Warning: Could not connect to Wi-Fi. Safe fallback mode active.");
  }
}

/**
 * Polls Firebase Realtime Database for this junction's priority status.
 */
void pollJunctionPriority() {
  HTTPClient http;
  
  // Endpoint: /junctionPriority/states/{JUNCTION_ID}/status.json
  String endpoint = String(FIREBASE_URL) + "/junctionPriority/states/" + JUNCTION_ID + "/status.json";
  http.begin(endpoint);
  http.setTimeout(1200);

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    payload.trim();

    // Strip quotation marks from JSON string
    if (payload.startsWith("\"") && payload.endsWith("\"")) {
      payload = payload.substring(1, payload.length() - 1);
    }

    if (payload != currentStatus && payload.length() > 0) {
      String previousStatus = currentStatus;
      currentStatus = payload;

      // Print status to Serial Monitor (Section 12 requirement)
      Serial.printf("%s status: %s\n", JUNCTION_ID, currentStatus.c_str());

      // Execute safe transition
      applyTrafficStateTransition(previousStatus, currentStatus);
    }
  }

  http.end();
}

/**
 * Executes safe LED signal transitions.
 * Includes amber clearance interval to prevent dangerous abrupt switching.
 */
void applyTrafficStateTransition(String fromStatus, String toStatus) {
  if (toStatus == "PRIORITY_ACTIVE") {
    // Transitioning into Priority Active: Amber clearance (1.5s) then GREEN
    Serial.printf("[%s] ALERT: Granting Emergency Vehicle Green Priority!\n", JUNCTION_ID);
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_LED_YELLOW, HIGH);
    digitalWrite(PIN_LED_GREEN, LOW);
    delay(1500); // Amber clearance

    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_LED_YELLOW, LOW);
    digitalWrite(PIN_LED_GREEN, HIGH);
    Serial.printf("[%s LED] GPIO 27 GREEN: HIGH (Priority Corridor Cleared)\n", JUNCTION_ID);
  }
  else if (fromStatus == "PRIORITY_ACTIVE" && toStatus != "PRIORITY_ACTIVE") {
    // Releasing Priority: Yellow clearance (2.0s) then return to RED
    Serial.printf("[%s] Emergency vehicle passed. Releasing priority corridor...\n", JUNCTION_ID);
    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_YELLOW, HIGH);
    digitalWrite(PIN_LED_RED, LOW);
    delay(2000); // Amber clearance

    setLedsNormal();
    Serial.printf("[%s LED] GPIO 25 RED: HIGH (Normal Cycle Restored)\n", JUNCTION_ID);
  }
  else if (toStatus == "NEXT") {
    // Approaching Next Junction: Red ON, Yellow blink advisory
    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_YELLOW, HIGH);
    digitalWrite(PIN_LED_RED, HIGH);
    Serial.printf("[%s LED] GPIO 26 YELLOW: HIGH (Ambulance Approaching)\n", JUNCTION_ID);
  }
  else {
    // NORMAL, WAITING, PASSED, NOT_ON_ROUTE: Steady RED
    setLedsNormal();
  }
}

void setLedsNormal() {
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, HIGH);
}

/**
 * Publishes health check telemetry to /junctionDevices/{JUNCTION_ID}.json
 */
void sendDeviceHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(FIREBASE_URL) + "/junctionDevices/" + JUNCTION_ID + ".json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<192> doc;
  doc["id"] = JUNCTION_ID;
  doc["online"] = true;
  doc["lastSeen"] = millis();
  doc["status"] = currentStatus;
  doc["ip"] = WiFi.localIP().toString();
  doc["mode"] = "ESP32-HARDWARE";

  String body;
  serializeJson(doc, body);

  http.PUT(body);
  http.end();
}
