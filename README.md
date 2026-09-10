# RESQ-X — Control Software

Software layer for your RESQ-X hardware: a backend that ingests sensor/AI data
from the unit and scores risk, and a live dashboard for rescue teams to watch
and steer it.

```
ESP32 unit (sensors + motors) ──MQTT──> backend (Node) ──WebSocket──> dashboard (React)
ESP32-CAM (video) ──MJPEG (direct)────────────────────────────────────> dashboard
[optional] ai-detector (Python/YOLO) ──MQTT (detections)──> backend
dashboard ──REST (control commands)──> backend ──MQTT──> ESP32 unit
```

## Why MQTT

Disaster zones have unreliable networks. MQTT is built for exactly that: small
messages, automatic reconnect, and a "Last Will" so the dashboard instantly
knows if a unit drops offline instead of silently going stale.

## Folders

- `backend/` — Node/Express + Socket.IO + MQTT. Ingests telemetry, computes a
  0–100 risk score, raises alerts, exposes REST endpoints for control, and
  pushes everything to the dashboard in real time.
- `frontend/` — React (Vite) dashboard: live camera view with a risk-reactive
  overlay, sensor telemetry, alert log, and a manual control panel.
- `firmware/resqx_unit/` — Reference ESP32 sketch showing the exact MQTT
  topics/payloads the backend expects. Wire in your real sensor pins.
- `ai-detector/` — Optional Python worker that reads the ESP32-CAM stream and
  runs a person detector (YOLOv8n), publishing results over MQTT so the
  microcontroller itself never has to run AI.

## Getting it running

1. **MQTT broker.** Easiest for local testing: `mosquitto` (`brew install
   mosquitto` / `apt install mosquitto`), or point at a public test broker
   like `broker.hivemq.com` for a first smoke test.

2. **Backend**
   ```
   cd backend
   cp .env.example .env   # fill in MQTT_BROKER_URL, RESQX_UNIT_IDS, etc.
   npm install
   npm run dev
   ```

3. **Frontend**
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173. Once your ESP32 is publishing, the unit
   appears automatically — no manual pairing step.

4. **Firmware.** Open `firmware/resqx_unit/resqx_unit.ino` in Arduino IDE,
   fill in WiFi + broker details, adjust pins to your wiring, flash it.

5. **Camera.** Flash the ESP32-CAM with the standard `CameraWebServer`
   example sketch (ships with the ESP32 board package), note its IP, then
   paste `http://<cam-ip>:81/stream` into "Set stream URL" in the dashboard.

6. **(Optional) AI detector**
   ```
   cd ai-detector
   pip install opencv-python paho-mqtt ultralytics
   python detect.py --cam-url http://<cam-ip>:81/stream --unit-id unit-01 --broker <broker-ip>
   ```

## Tuning risk scoring

`backend/src/riskEngine.js` combines gas/temp/vibration/person-detection into
one score. The thresholds are reasonable defaults for MQ2 + DHT22 — recalibrate
them against real readings from your build before field use.

## Extending alerts

`backend/src/alertService.js` logs alerts and pushes them to the dashboard
live. There's a commented Twilio SMS stub — wire in whatever channel your team
actually watches (SMS, push, a control-room siren relay, etc).
