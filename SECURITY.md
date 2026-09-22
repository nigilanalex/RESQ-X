# RESQ-X security model

RESQ-X uses local username/password accounts with salted Node.js `scrypt` password hashes. Browser sessions are opaque, server-side, HttpOnly cookies with `SameSite=Strict`, a finite lifetime, CSRF protection for state-changing requests, and logout invalidation. Cookies receive `Secure` only in production, which must use explicit HTTPS `CORS_ORIGIN` values.

Roles are enforced by the backend:

| Role | Access |
| --- | --- |
| `ADMIN` | Users, configuration-facing APIs, controls, alerts, evidence and telemetry |
| `OPERATOR` | Controls, emergency STOP, simulation controls, headlight, capture, evidence, alerts and telemetry |
| `VIEWER` | Read-only telemetry, camera stream, alerts and evidence |

Create the first account once, from the `backend` directory:

```powershell
npm.cmd run init-admin -- your-admin-name
```

Rotate a local password without exposing it on the command line:

```powershell
npm.cmd run reset-password -- your-admin-name
```

The account database and audit log are saved under `backend/.data/`, which is git-ignored. Never commit `.env`, `backend/.data/`, or `firmware/resqx_unit/secrets.h`. An alternative one-time bootstrap uses `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`; remove the password from the environment immediately after startup.

## Configuration

Use `backend/.env` locally and only placeholders in `.env.example`.

- `CORS_ORIGIN` — comma-separated trusted dashboard origins. Production requires explicit HTTPS origins.
- `MQTT_BROKER_URL` — credential-free `mqtt://`, `mqtts://`, `ws://`, or `wss://` broker URL.
- `MQTT_USERNAME`, `MQTT_PASSWORD` — broker credentials, passed to MQTT only and never returned or logged.
- `ESP32_CAM_BASE_URL` — fixed camera control endpoint. It must be HTTP(S), without URL credentials.
- `RESQX_UNIT_IDS` — allowlisted unit IDs.

Use `NODE_ENV=production` only behind HTTPS. Production rejects missing/non-HTTPS CORS origins, enables Secure cookies and HSTS, and still requires a reverse proxy or deployment platform to terminate TLS.

## API and session security

The backend applies deny-by-default API CSP/security headers, explicit credentialed CORS origins, a 32 KiB JSON limit, safe JSON error responses, CSRF checks on state changes, and route-specific rate limits. Robot commands, STOP, simulation actions, capture, headlight control, alert clearing, and user administration require backend authentication and role checks. Session state is stored in memory and expires after eight hours; logout and password/role changes invalidate active browser sockets.

MQTT payloads are size-limited and accepted only on the configured `resqx/<unit>/sensors`, `detection`, and `status` topics plus the fixed `resqx/robot/motor/status` topic. Real motor commands can be published only to `resqx/robot/motor/command`; simulated motor commands use the separate `resqx/robot/motor/simulator` topic. Use broker accounts with topic ACLs and TLS (`mqtts://`) for deployments. Plain `mqtt://` is not encrypted.

## Camera and hardware limitations

The MJPEG stream remains a direct browser connection by design. The currently supported ESP32-CAM stream is unauthenticated HTTP on a local network; treat that network as trusted or isolate it with a firewall/VLAN. Capture and headlight actions go through authenticated backend endpoints, but an attacker who can directly reach an unauthenticated ESP32-CAM endpoint may bypass dashboard policy. ESP32 firmware and MQTT publishers need broker credentials/ACLs to prevent telemetry spoofing.

Simulation is enforced server-side: simulated movement commands are never published to the real control topic, and simulation headlight/capture actions never contact the ESP32-CAM.

## Known limitations

- Accounts and sessions use local files/in-memory state and are suitable for one backend instance, not a horizontally scaled deployment.
- The ESP32-CAM stream and device endpoints are not authenticated by the current firmware. Network isolation remains necessary.
- MQTT source labels identify simulation versus hardware but are trustworthy only when broker authentication and topic ACLs prevent spoofing.
- The Vite development server is bound to localhost and is not a production server. Use the production build behind HTTPS for deployment.
- Browser evidence remains session-only; download evidence that must persist.

## Security verification

Run `npm.cmd run test:security`, `npm.cmd run test:intelligence`, `npm.cmd run test:motor`, `node scripts/test-headlight.cjs`, `node scripts/test-command-center.cjs`, and `npm.cmd run build`. Run npm audits for root, backend, and frontend separately. Security tests use isolated local services and do not contact physical hardware.

## Operations

Audit events are written locally without passwords, tokens, MQTT secrets, image data, or raw telemetry. Events include login success/failure, logout, robot commands, emergency STOP, headlight changes, captures, account changes, and rejected access. Rotate broker and camera-network credentials after suspected exposure, update `.env`/firmware secrets outside git, restart the affected services, and invalidate/recreate application accounts as appropriate.

Report a suspected vulnerability privately to the project maintainers; do not include credentials or camera URLs in public issues.
