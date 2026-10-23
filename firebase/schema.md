# Firebase Realtime Database Schema Documentation

## 1. `/ambulance`
Stores the latest live location telemetry from the moving emergency vehicle.

```json
{
  "latitude": 11.018000,
  "longitude": 76.934700,
  "accuracy": 14.2,
  "rawAccuracy": 15.0,
  "stabilized": true,
  "timestamp": 1711200000000,
  "active": true,
  "mode": "browser-live",
  "sessionId": "web-session-1"
}
```

### Fields:
- `latitude` (number): -90 to +90 degrees.
- `longitude` (number): -180 to +180 degrees.
- `accuracy` (number): Stabilized horizontal accuracy in metres.
- `rawAccuracy` (number): Raw sensor accuracy before filter.
- `stabilized` (boolean): `true` if $\ge 3$ fixes collected and accuracy $\le 25\,\text{m}$.
- `timestamp` (number): Epoch milliseconds.
- `active` (boolean): `true` during active tracking session.
- `mode` (string): `"browser-live"`, `"esp32-neo6m"`, or `"simulated"`.

---

## 2. `/junctionPriority`
Stores the active priority decision and the command states for all fixed traffic junctions.

```json
{
  "activeJunctionId": "J1",
  "nextJunctionId": "J1",
  "status": "PRIORITY ACTIVE — J1",
  "version": 42,
  "timestamp": 1711200005000,
  "states": {
    "J1": { "status": "PRIORITY_ACTIVE", "timestamp": 1711200005000 },
    "J2": { "status": "WAITING", "timestamp": 1711200005000 },
    "J3": { "status": "PASSED", "timestamp": 1711200005000 },
    "J4": { "status": "NOT_ON_ROUTE", "timestamp": 1711200005000 }
  }
}
```

### Allowed Junction Statuses:
- `NOT_ON_ROUTE`: Junction is $>50\,\text{m}$ away from the active driving path.
- `WAITING`: Junction is on the route ahead of the vehicle, but $>100\,\text{m}$ away.
- `NEXT`: First upcoming unpassed junction on route corridor.
- `PRIORITY_ACTIVE`: Vehicle is within $100\,\text{m}$ of the next junction along the road. Green LED turns ON.
- `PASSED`: Vehicle has advanced $\ge 8\,\text{m}$ beyond the junction along the road. Green priority released.
- `NORMAL`: Default safe non-emergency cycle.

---

## 3. `/junctionDevices`
Monitors the operational health and connectivity of physical ESP32 junction controllers.

```json
{
  "J1": {
    "id": "J1",
    "online": true,
    "lastSeen": 1711200009000,
    "status": "PRIORITY_ACTIVE",
    "ip": "192.168.1.101",
    "mode": "ESP32-HARDWARE"
  }
}
```
