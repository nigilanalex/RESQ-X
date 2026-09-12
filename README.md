# RESQ-X — Smart Rescue Robot Command Center

RESQ-X is a rescue-robot control system for hazardous or inaccessible search areas. It combines an ESP32-based robot, MQTT telemetry, a Node.js backend, Socket.IO live updates, and a React command-center dashboard.

The project runs in **simulation mode by default**, so the full software stack can be demonstrated without an ESP32, ESP32-CAM, Arduino IDE, or physical sensors.

## Dashboard

The dashboard shows four distinct live states:

- **Dashboard** — Browser ↔ backend Socket.IO connection.
- **MQTT Broker** — Backend ↔ Mosquitto connection.
- **Unit Link** — Recent telemetry/status received from the robot or simulator.
- **Mode** — `SIMULATION` for the software simulator or `LIVE` for physical ESP32 telemetry.

In software-only mode, the expected states are:

```text
DASHBOARD     LIVE
MQTT BROKER   ONLINE
UNIT LINK     OK
MODE          SIMULATION
```

GPS and battery intentionally show as unavailable/not measured in the simulator. No fallback GPS position or fake battery percentage is displayed.

## Architecture

```text
ESP32 / Simulator → MQTT → Node.js backend → Socket.IO → React dashboard
ESP32-CAM (optional) ───────────────────────────────────→ Dashboard camera panel
Dashboard controls → REST API → MQTT control topic → ESP32
```

## Quick start — Windows

### Prerequisites

- Node.js 18 or newer
- Mosquitto MQTT broker installed as the Windows `mosquitto` service

The root command checks that the Mosquitto service is running. It starts the backend, Vite frontend, and software simulator in one terminal.

```powershell
cd C:\Users\Nigilan\Downloads\resqx-full-stack\resqx
npm.cmd install
npm.cmd run dev
```

Open the dashboard at:

```text
http://localhost:5173
```

Use `npm.cmd` in PowerShell if your Windows execution policy blocks `npm.ps1`.

Press `Ctrl + C` once in that terminal to stop the RESQ-X development stack.

## One-command services

`npm.cmd run dev` starts:

| Service | Purpose |
| --- | --- |
| Mosquitto check | Verifies that the local Windows MQTT service is running. |
| Backend | Express, Socket.IO, MQTT ingestion, API, and risk engine on port `4000`. |
| Frontend | Vite React dashboard on port `5173`. |
| Simulator | Publishes safe, clearly marked `unit-01` test telemetry every 3 seconds. |

The development command uses `mqtt://localhost:1883` for software-only simulation. Your saved backend `.env` broker configuration is not overwritten.

## Build for presentation/deployment

```powershell
npm.cmd run build
```

This creates the production frontend build in `frontend/dist`.

## Simulator telemetry

The simulator publishes:

```text
resqx/unit-01/status
resqx/unit-01/sensors
```

Its telemetry contains `simulated: true`, realistic temperature/humidity/motion values, and intentionally unavailable GPS/battery/PIR hardware values. Simulator controls are logged only; they never drive a physical robot.

## Physical ESP32 setup

The firmware is in `firmware/resqx_unit/resqx_unit.ino`.

1. Copy `firmware/resqx_unit/secrets.h.example` to `firmware/resqx_unit/secrets.h`.
2. Add your Wi-Fi and MQTT credentials to `secrets.h`.
3. Open `resqx_unit.ino` in Arduino IDE and select the correct ESP32 board/port.
4. Upload the sketch.

The firmware maintains the existing RESQ-X MQTT topics and uses non-blocking Wi-Fi/MQTT reconnect behavior. ESP32-CAM is optional and is not required for the dashboard to run.

## MQTT topics

| Topic | Direction | Purpose |
| --- | --- | --- |
| `resqx/unit-01/status` | Unit → backend | `online` / `offline` state |
| `resqx/unit-01/sensors` | Unit → backend | Sensor and GPS telemetry |
| `resqx/unit-01/detection` | Unit/AI → backend | Optional person-detection result |
| `resqx/unit-01/control` | Dashboard → unit | Movement commands |

## Project folders

- `frontend/` — React + Vite command-center dashboard.
- `backend/` — Express, Socket.IO, MQTT client, API, risk engine, and simulator.
- `firmware/resqx_unit/` — ESP32 motor, sensor, GPS, telemetry, and web-control firmware.
- `ai-detector/` — Optional external AI detection worker.
- `scripts/` — Windows Mosquitto availability check for the root dev command.

## Camera

The camera panel is intentionally independent from the main telemetry/control stack. Until an ESP32-CAM stream is available, it shows:

```text
CAMERA OFFLINE
No stream configured
ESP32-CAM not connected
```

When available, enter the stream URL in **Set Stream URL**, for example:

```text
http://<esp32-cam-ip>:81/stream
```

## Safety note

This is a hackathon prototype. Validate motor direction, emergency stop behavior, sensor calibration, network reliability, and physical safety before deploying a robot in a real rescue environment.
