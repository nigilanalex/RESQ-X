# Repository Guidelines

## Project Structure & Module Organization

RESQ-X is a three-process rescue-robot dashboard. `frontend/` is the React/Vite command-center UI; reusable UI lives in `frontend/src/components/`, while Socket.IO and HTTP helpers live in `frontend/src/api/`. `backend/` is the Express, Socket.IO, and MQTT service. Its runtime modules are in `backend/src/`; API routes are in `backend/src/routes/`. `firmware/resqx_motor_controller/` is the dedicated motor ESP32; `firmware/resqx_unit/` is retained legacy/reference firmware. `scripts/` contains repository-level checks and local broker setup. Keep populated firmware `secrets.h` files ignored.

## Build, Test, and Development Commands

From the repository root on Windows:

```powershell
npm.cmd run dev             # Starts backend, Vite, and the MQTT simulator
npm.cmd run build           # Builds the frontend production bundle
npm.cmd run test:security   # Runs deterministic authentication/RBAC/security checks
npm.cmd run test:intelligence
node scripts/test-headlight.cjs
node scripts/test-command-center.cjs
```

The development command prints a random secure local dashboard link. Open that link instead of entering a username and password. Account administration remains available for deployments that disable local-link access:

```powershell
cd backend
npm.cmd run init-admin -- your-admin-name
```

## Coding Style & Naming Conventions

Use JavaScript with semicolons and two-space indentation in new backend code; follow the surrounding component style in the frontend. Use `PascalCase.jsx` for React components (for example, `CameraFeed.jsx`) and `camelCase.js` for utilities. Keep stateful hardware decisions in the backend—frontend buttons are never the authorization boundary. Prefer small modules with explicit exports and do not add dependencies without a clear need.

## Testing Guidelines

Run `npm.cmd run build` and the focused relevant test scripts before handing off a change. Tests must not contact a physical robot or camera unless that behavior is explicitly requested. Add deterministic checks for validation, simulation isolation, and role permissions when changing MQTT, control, camera, or authentication code.

## Commit & Pull Request Guidelines

Existing history uses short imperative summaries, such as `Complete RESQ-X simulation command center`. Keep commits scoped and descriptive. Pull requests should explain operational impact, list test commands/results, identify any MQTT or firmware compatibility change, and include dashboard screenshots for visual changes. Never commit `.env`, `backend/.data/`, camera credentials, Wi-Fi secrets, tokens, or captured evidence.

## Security & Configuration

Copy `backend/.env.example` to `backend/.env` and use environment variables for broker and camera configuration. Review `SECURITY.md` before changing access control, capture, headlight, or MQTT behavior.

# RESQ-X Project Context

RESQ-X is an intelligent disaster-response rescue robot and command-center software platform for remotely operated rovers in hazardous or inaccessible environments. It is separate from the AI-Powered Post-Recovery Assistant healthcare project; never mix the two.

Current priority is software/dashboard development. Hardware may be unavailable, so every feature must support safe simulation without requiring physical devices.

## Stack and Current Features

- React + Vite frontend; Node.js + Express backend; MQTT and Socket.IO realtime updates.
- ESP32 rover firmware and an AI-Thinker ESP32-CAM with an OV3660 sensor.
- Telemetry, GPS/map state, sensor cards, risk intelligence, alerts, manual movement, emergency STOP, simulation, MJPEG camera view, image capture, fullscreen, GPIO4 headlight HUD, and evidence metadata/gallery.
- Authentication, RBAC, audit, and other security hardening must remain server-enforced where implemented.

## Camera, MQTT, and Development Endpoints

The working camera architecture is frontend-displayed MJPEG; do not replace it unnecessarily. Known development endpoints are `http://192.168.1.10`, `http://192.168.1.10:81/stream`, and `http://192.168.1.10/capture`. The flash headlight is GPIO4. Do not change its implementation automatically.

The development broker is `mqtt://192.168.1.4:1883`; the unit is `unit-01`. Existing topics include `resqx/unit-01/sensors`, `status`, `simulator`, and `detection`. The dashboard is `http://localhost:5173`; the backend is `http://localhost:4000`.

For real hardware, do not use the root command if it launches the simulator. Use:

```powershell
$env:MQTT_BROKER_URL="mqtt://192.168.1.4:1883"
npm.cmd --prefix backend run dev
```

## Integrity, Safety, and Hardware Rules

Never invent sensor data or GPS coordinates; use `NOT AVAILABLE`, `NO FIX`, or `GPS UNAVAILABLE`. LIVE requires actual connectivity and SIMULATION must be explicit. Simulation must never operate the physical robot, camera, headlight, or create fake evidence.

Robot commands require a strict allowlist: `FORWARD`, `BACKWARD`, `LEFT`, `RIGHT`, and `STOP`. Keep emergency STOP immediate; do not add confirmation delays. Motor and sensor controllers are separate. The dedicated motor ESP32 uses L298N IN1/GPIO18, IN2/GPIO19, IN3/GPIO21, and IN4/GPIO22, with ENA/ENB jumpers. Its topics are `resqx/robot/motor/command` and `resqx/robot/motor/status`. Sensor hardware and pin ownership belong to the separate sensor team; do not combine sensor code into the motor firmware.

Captured evidence retains available telemetry. Invalid GPS never falls back to coordinates. MJPEG `<img>` cannot be recorded directly; browser recording, if added, must use canvas `captureStream()` and `MediaRecorder`, and must not disrupt driving or camera controls.

## Change Rules

Inspect the relevant flow first, make the smallest safe change, preserve working behavior, validate all external input, and build/test after significant changes. Do not expose or log credentials; use environment variables and protect control/authentication endpoints. Explain conflicts before destructive changes.

RESQ-X DEVELOPMENT PRINCIPLE: “Build a professional rescue-robot command system without sacrificing data integrity, safety, reliability, or maintainability.”
