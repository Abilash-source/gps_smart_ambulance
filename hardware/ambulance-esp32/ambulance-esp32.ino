/*
 * ==============================================================================
 * SMART TRAFFIC AMBULANCE — PHYSICAL AMBULANCE TRACKER (NEO-6M + ESP32)
 * ==============================================================================
 * Target Hardware: ESP32-WROOM-32 Development Board + u-blox NEO-6M GPS Module
 * 
 * Hardware Pinout (Section 12):
 * - NEO-6M TX  -> ESP32 GPIO 16 (Serial2 RX)
 * - NEO-6M RX  -> ESP32 GPIO 17 (Serial2 TX)
 * - NEO-6M GND -> ESP32 GND
 * - NEO-6M VCC -> 3.3V or 5V (depending on module breakout regulator)
 * 
 * Telemetry Destination:
 * - Firebase Realtime Database: /ambulance.json
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// =====================================================
// USER CONFIGURATION
// =====================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase Realtime Database Base URL
const char* FIREBASE_URL  = "https://smart-traffic-ambalance-default-rtdb.asia-southeast1.firebasedatabase.app";

// Serial2 Pins for NEO-6M GPS
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUD_RATE 9600

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

unsigned long lastUploadTime = 0;
const unsigned long UPLOAD_INTERVAL_MS = 1000; // 1Hz telemetry updates

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize hardware serial for GPS module
  gpsSerial.begin(GPS_BAUD_RATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("Smart Ambulance — Hardware GPS Transponder (NEO-6M)");
  Serial.println("==================================================");

  connectToWiFi();
}

void loop() {
  // Read incoming NMEA stream from NEO-6M
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Periodic telemetry upload
  if (millis() - lastUploadTime >= UPLOAD_INTERVAL_MS) {
    lastUploadTime = millis();

    if (gps.location.isValid()) {
      float lat = gps.location.lat();
      float lon = gps.location.lng();
      
      // Calculate estimated accuracy in metres from HDOP (Horizontal Dilution of Precision)
      // HDOP < 1.0 is ideal (~2-3m), HDOP 1.0-2.0 is good (~5-8m), HDOP > 5 is poor (>20m)
      float estimatedAccuracy = gps.hdop.isValid() ? (gps.hdop.hdop() * 3.5) : 15.0;
      int satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;

      Serial.printf("[GPS FIX] Lat: %.6f, Lon: %.6f | Est Acc: %.1fm | Sats: %d\n",
        lat, lon, estimatedAccuracy, satellites);

      publishAmbulanceTelemetry(lat, lon, estimatedAccuracy);
    } else {
      Serial.printf("[GPS] Searching for satellites... (Chars processed: %d)\n", gps.charsProcessed());
    }
  }
}

void connectToWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.printf("[WIFI] Connected! Assigned IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.println("==================================================");
}

void publishAmbulanceTelemetry(float latitude, float longitude, float accuracy) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Telemetry paused: Wi-Fi disconnected.");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  String url = String(FIREBASE_URL) + "/ambulance.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["latitude"]    = latitude;
  doc["longitude"]   = longitude;
  doc["accuracy"]    = accuracy;
  doc["rawAccuracy"] = accuracy;
  doc["stabilized"]  = (accuracy <= 25.0);
  doc["timestamp"]   = millis();
  doc["active"]      = true;
  doc["mode"]        = "esp32-neo6m";
  doc["sessionId"]   = "hw-tracker-1";

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.PUT(requestBody);

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("[FIREBASE] Telemetry published to /ambulance.json");
  } else {
    Serial.printf("[FIREBASE] HTTP error publishing telemetry: %d\n", httpCode);
  }

  http.end();
}
