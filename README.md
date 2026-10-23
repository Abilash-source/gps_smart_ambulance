# Smart Traffic Ambulance / Intelligent Ambulance Traffic Priority System

A standalone web application and traffic signaling system for tracking ambulances live, calculating road routes via OSRM, identifying fixed junctions along the road corridor, and activating traffic light priority for the next junction in sequence with Firebase Realtime Database and ESP32 hardware synchronization.

---

## 📁 Project Structure (Zero npm / No Build Tools Required)

```text
smart-traffic-ambulance-priority-system/
├── index.html     # Dashboard layout, Leaflet map container, controls & status cards
├── style.css      # Clean, responsive CSS styling and traffic priority indicators
├── app.js         # Core logic: GPS stabilization, OSRM routing, corridor matching & Firebase sync
└── README.md      # Documentation & hardware setup guide
```

> **No `npm install`, no `node_modules`, and no build tools are required.**
> Everything runs directly in the browser using official CDNs for Leaflet and Firebase.

---

## 🚀 How to Run the Project (Without npm)

### Option 1: VS Code "Live Server" (Recommended — 1 Click)
1. Open this folder in **VS Code**.
2. Install the **Live Server** extension (by Ritwick Dey) if not already installed.
3. Right-click on `index.html` and choose **"Open with Live Server"**.
4. The application opens automatically at `http://127.0.0.1:5500/index.html`.

### Option 2: Python (Zero Install)
Open PowerShell or Command Prompt in this folder and run:
```bash
python -m http.server 3000
```
Then open:
- On PC: `http://localhost:3000`
- On Mobile Phone: `http://10.37.20.124:3000`

---

## 🏥 Fixed Targets & Coordinates

### Fixed Hospitals
- **Demo Hospital A (H1)**: `11.0206146, 76.9334139`
- **Demo Hospital B (H2)**: `11.019335, 76.938563`
- **Demo Hospital C (H3)**: `11.017290, 76.9352481`

### Fixed Traffic Junctions
- **Junction 1 (J1)**: `11.018563, 76.934374`
- **Junction 2 (J2)**: `11.019186, 76.934437`
- **Junction 3 (J3)**: `11.017374, 76.934561`
- **Junction 4 (J4)**: `11.017930, 76.935116`

---

## 🚦 System Rules & Thresholds

| Rule | Threshold | Description |
|---|---|---|
| **Raw GPS Rejection** | $> 40\,\text{m}$ | Poor GPS readings are rejected (`WAITING FOR BETTER GPS`). |
| **Stabilized GPS** | $\le 25\,\text{m}$ | Multi-fix weighted stabilization requires $\ge 3$ fixes. |
| **GPS Stale Timeout** | $15\,\text{s}$ | Pauses routing if no good fix arrives for 15 seconds. |
| **Road-Snap Limit** | $\le 30\,\text{m}$ | Rejects route if position is $>30\,\text{m}$ from navigable road. |
| **Junction Corridor** | $\le 50\,\text{m}$ | Only junctions within 50m of road polyline are included. |
| **Priority Active** | $\le 100\,\text{m}$ | Approaching within 100m along road activates green priority. |
| **Passed Buffer** | $\ge 30\,\text{m}$ | Advancing 30m beyond junction marks it `PASSED` and advances. |

---

## 🔥 Firebase Realtime Database Structure

- `/ambulance`: Live ambulance location, accuracy, mode, timestamp.
- `/junctionPriority`: Current active junction, next junction, and states (`NOT_ON_ROUTE`, `WAITING`, `NEXT`, `PRIORITY_ACTIVE`, `PASSED`, `NORMAL`).

---

## 🛠️ ESP32 Junction Hardware (Arduino)

- **Red LED**: GPIO 25 (Normal / Waiting / Passed)
- **Yellow LED**: GPIO 26 (Next approaching)
- **Green LED**: GPIO 27 (Priority Active ONLY)
- **Serial Monitor**: 115200 baud
- **Firebase Endpoint**: `/junctionPriority/states/J1/status`
