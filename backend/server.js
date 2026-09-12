require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { setupMqtt } = require("./src/mqttClient");
const { buildApiRouter } = require("./src/routes/api");
const store = require("./src/store");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

const mqttHandle = setupMqtt(io);

app.use("/api", buildApiRouter(mqttHandle));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "resqx-backend", time: Date.now() });
});

io.on("connection", (socket) => {
  console.log("[socket] dashboard connected:", socket.id);
  // Send current snapshot immediately so the UI isn't empty until the next MQTT message
  socket.emit("snapshot", {
    units: store.getAllUnits(),
    alerts: store.getAlerts(50),
    mqtt: mqttHandle.getStatus(),
  });

  socket.on("disconnect", () => {
    console.log("[socket] dashboard disconnected:", socket.id);
  });
});

// A unit is live only while it sends status or telemetry within the heartbeat window.
setInterval(() => {
  store.expireStaleUnits().forEach((unit) => {
    console.log(`[UNIT] ${unit.unitId} heartbeat expired; marking offline`);
    io.emit("unit:update", unit);
  });
}, 1000);

server.listen(PORT, () => {
  console.log(`RESQ-X backend listening on http://localhost:${PORT}`);
  console.log(`Expecting units: ${mqttHandle.unitIds.join(", ")}`);
});
