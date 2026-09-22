# RESQ-X — Smart Rescue Robot Command Center

RESQ-X is a rescue-robot control system for hazardous or inaccessible search areas. It uses separate motor and sensor ESP32 controllers, MQTT, a Node.js backend, Socket.IO live updates, and a React command-center dashboard.

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
                   RESQ-X DASHBOARD
                          |
                          v
                 AUTHENTICATED BACKEND
                          |
                         MQTT
                    _____/   \_____
                   /               \
                  v                 v
         MOTOR ESP32          SENSOR ESP32
              |                    |
            L298N               SENSORS
              |
            MOTORS
```

## Quick start — Windows

### Prerequisites

- Node.js 18 or newer
- Mosquitto MQTT broker installed as the Windows `mosquitto` service

The root command checks that the Mosquitto service is running. It starts the backend, Vite frontend, and software simulator in one terminal.

```powershell
cd C:\Users\Nigilan\Downloads\resqx-full-stack\resqx
npm.cmd install
npm.cmd --prefix backend run init-admin -- admin
npm.cmd run dev
```

The account command prompts for a hidden password of at least 12 characters. It creates a salted `scrypt` hash under the git-ignored `backend/.data/` directory; no default password exists. On later runs, use the account you created. Rotate it with `npm.cmd --prefix backend run reset-password -- admin`.

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

The dashboard requires an authenticated `ADMIN`, `OPERATOR`, or `VIEWER` session. Controls, STOP, simulation actions, capture, and headlight changes are enforced by backend roles and CSRF checks. See `SECURITY.md` for the complete security model and current limitations.

The development command uses `mqtt://localhost:1883` for software-only simulation. Your saved backend `.env` broker configuration is not overwritten.
It also sets `RESQX_SIMULATION_MODE=true` inside the development child processes. This server-side lock rejects physical motor control and prevents publishing to `resqx/robot/motor/command` during a software-only run.

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
resqx/robot/motor/status
```

Its telemetry contains `simulated: true`, realistic temperature/humidity/motion values, and intentionally unavailable GPS/battery/PIR hardware values. Simulated motor commands use `resqx/robot/motor/simulator`; the real motor ESP32 never subscribes to that topic.

## Dedicated motor ESP32

The motor controller is a separate DOIT ESP32 DEVKIT V1. It must not contain sensor code.

| L298N input | ESP32 pin |
| --- | --- |
| IN1 | GPIO18 |
| IN2 | GPIO19 |
| IN3 | GPIO21 |
| IN4 | GPIO22 |

ENA and ENB remain enabled by their L298N jumpers. Motor direction can be corrected with the per-side inversion constants in the motor sketch. The command watchdog is 1000 ms: a moving controller stops unless another valid command arrives. Boot, invalid commands, stale commands, Wi-Fi loss, MQTT loss, and reconnects all default to STOP.

To flash it:

1. Copy `firmware/resqx_motor_controller/secrets.h.example` to `firmware/resqx_motor_controller/secrets.h`.
2. Set Wi-Fi, broker, optional MQTT credentials, and a unique controller ID.
3. Install Arduino libraries `PubSubClient` and `ArduinoJson`.
4. Open `resqx_motor_controller.ino`, select **DOIT ESP32 DEVKIT V1**, compile, and upload.

For a real-hardware session, set the broker and credentials in `backend/.env`, keep `RESQX_SIMULATION_MODE=false`, and run from the repository root:

```powershell
npm.cmd run dev:hardware
```

This starts backend and frontend in one terminal without starting the simulator. The normal `npm.cmd run dev` command is software-only and deliberately enables the simulation lock.

The existing `firmware/resqx_unit/` code is retained as legacy/reference code. The sensor team must use its own sensor ESP32 and sensor topics; do not add sensors to the dedicated motor controller.

HC-SR04/ultrasonic hardware is not part of RESQ-X and has no telemetry field, MQTT topic, pin assignment, simulator value, or dashboard card. VL53L0X is the designated distance sensor for future/current sensor-controller work. LD2410 `human.distance` is presence-sensor ranging and is intentionally retained; it is not HC-SR04 telemetry.

## MQTT topics

| Topic | Direction | Purpose |
| --- | --- | --- |
| `resqx/unit-01/status` | Unit → backend | `online` / `offline` state |
| `resqx/unit-01/sensors` | Unit → backend | Sensor and GPS telemetry |
| `resqx/unit-01/detection` | Unit/AI → backend | Optional person-detection result |
| `resqx/robot/motor/command` | Backend → Motor ESP32 | Validated real motor commands |
| `resqx/robot/motor/status` | Motor ESP32 → backend | Confirmed motor state and heartbeat |
| `resqx/robot/motor/simulator` | Backend → simulator | Isolated development-only motor commands |

Motor commands are JSON: `{"command":"forward","commandId":"<id>","issuedAt":<milliseconds>}`. Only `forward`, `backward`, `left`, `right`, and `stop` are accepted. Status is JSON containing `online`, `state`, `source`, `simulated`, `controllerId`, `commandId`, and `reason`. The dashboard displays a request as pending until a matching controller status confirms it.

## Project folders

- `frontend/` — React + Vite command-center dashboard.
- `backend/` — Express, Socket.IO, MQTT client, API, risk engine, and simulator.
- `firmware/resqx_motor_controller/` — dedicated L298N motor ESP32 firmware.
- `firmware/resqx_unit/` — retained legacy/reference unit firmware; sensor work remains separate.
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

## Rescue Command Center interface

The desktop UI has three operating zones: robot controls/GPS, the camera feed,
and rescue intelligence/emergency alerts. It switches to two columns on tablets
and one column on smaller screens. The camera remains mounted while switching
the lower Overview, Telemetry, Mission, Evidence and Alert History tabs.

- LIVE requires connected ESP32-marked telemetry. It is not cryptographic hardware authentication.
- SIMULATION is explicit: no real camera stream/capture requests or headlight
  commands. Simulated movement uses an isolated MQTT topic and is never published
  to the physical motor command topic.
- Emergency STOP uses the existing software STOP command, not a physical power cutoff.
  WASD/Space controls remain; losing window focus stops an active hold command.
- Risk scores come from the existing backend. Missing sensors show NOT AVAILABLE;
  missing flame values remain null instead of falsely displaying CLEAR.
- Camera fullscreen, JPEG capture, headlight controls and the URL editor remain.
  Diagnostics are available in a collapsed disclosure. Recording is explicitly
  UNAVAILABLE: canvas/CORS/MediaRecorder support is not implemented or verified.
- Alert acknowledgement is local to this browser session. It does not resolve a
  hazard or update the backend. Clear view does not delete session alert history.
- Mission timeline uses received events and observed camera status transitions.
  No fake mission starts, historical sensor trends or GPS tracks are generated.
- Evidence retains original JPEGs plus capture-time telemetry in session memory.
  VIEW/ESC/CLOSE and DOWNLOAD remain available. Refresh clears the archive.

Start from the repository root with `npm.cmd run dev`; open http://localhost:5173.
Build with `npm.cmd run build`. No new dependencies are needed.

Checks:

```powershell
npm.cmd run test:security
npm.cmd run test:intelligence
npm.cmd run test:motor
node scripts/test-command-center.cjs
node scripts/test-headlight.cjs
npm.cmd run build
```

These checks use isolated HTTP, component-rendering, transport, and rule-engine
tests. They do not operate real hardware and do not replace browser or physical
device verification.

Browser console, responsive screenshots and physical camera playback/capture/
fullscreen still require manual verification when no automation browser is connected.

## Safety note

This is a hackathon prototype. Validate motor direction, emergency stop behavior, sensor calibration, network reliability, and physical safety before deploying a robot in a real rescue environment.

### First physical motor test

1. Lift all drive wheels clear of the ground and secure the robot.
2. Keep a physical power-disconnect within reach; dashboard STOP is not a power cutoff.
3. Start only Mosquitto, the backend, and frontend against the hardware broker. Do **not** start the software simulator.
4. Power the motor ESP32 and confirm the dashboard reports `STOPPED` from `motor-esp32`.
5. Tap and release each direction briefly. Confirm the UI first shows the request and then the ESP32-confirmed state.
6. Verify release sends STOP. Interrupt Wi-Fi/MQTT and confirm the wheels stop within the 1000 ms watchdog window.
7. If a side runs backward, power down and change only `INVERT_MOTOR_A` or `INVERT_MOTOR_B`.

For software-only MQTT inspection, subscribe to `resqx/robot/motor/status` and publish only to `resqx/robot/motor/simulator`. Never publish test movement to the physical command topic while the robot is on the ground.
