# ESP32-CAM headlight

The operator panel controls the camera GPIO 4, not the main robot board.
`backend/.env` configures `ESP32_CAM_BASE_URL`. The video URL is unchanged.

The backend accepts `POST /api/units/unit-01/headlight` with
`{"state":"ON"}` or `{"state":"OFF"}`. GET at the same path reads status.
SIMULATION is determined from backend unit state and never contacts the camera.
LIVE sends a bounded HTTP request to the camera `/headlight?state=on|off`;
GET `/headlight` only reads status. A valid JSON acknowledgement is required.
Offline, unknown mode, timeout and invalid acknowledgements produce UNAVAILABLE.
Status polling detects loss within a polling interval plus request timeout;
it never replays ON after reconnection. A lost acknowledgement cannot prove the
physical light is OFF: UNAVAILABLE means its state is unknown.

The existing working Arduino sketch was edited in its supplied temporary folder:
`C:\Users\Nigilan\AppData\Local\Temp\.arduinoIDE-unsaved2026814-4612-1jcx1ul.yfbnk\CameraWebServer`.
Only `CameraWebServer.ino` and `app_httpd.cpp` changed. Save the working sketch to
a permanent folder in Arduino IDE and upload it to the ESP32-CAM (not the DOIT
controller) before expecting the new endpoint to work. Camera settings and
the JPEG stream handler were retained. Legacy capture/stream automatic LED
switching is disabled; GPIO 4 now follows explicit headlight commands only.
The existing PWM attachment is retained and defaults OFF at boot.

No CORS header is needed for the backend-to-camera HTTP request. No video proxy
is involved. These unauthenticated development endpoints belong on a trusted
LAN, not the public Internet. LIVE mode inherits the existing telemetry-based
mode identification; it is not hardware authentication.

Run `node scripts/test-headlight.cjs` for isolated tests against a local fake
camera HTTP server. These tests do not operate real hardware. Build with
`npm.cmd run build`, and start the stack with `npm.cmd run dev`.
