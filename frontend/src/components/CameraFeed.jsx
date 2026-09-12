import { useState } from "react";
import "./CameraFeed.css";

const LEVEL_COLOR = { LOW: "var(--level-low)", MEDIUM: "var(--level-medium)", HIGH: "var(--level-high)", CRITICAL: "var(--level-critical)" };

export default function CameraFeed({ unit, streamUrl, onChangeStreamUrl }) {
  const [editing, setEditing] = useState(false);
  const level = unit?.risk?.level || "LOW";
  const detection = unit?.detection;
  const saveUrl = (event) => { onChangeStreamUrl(event.target.value); setEditing(false); };

  return <div className="cam" style={{ "--level-color": LEVEL_COLOR[level] }}>
    <div className="cam__heading"><span><b>◉</b> CAMERA <small>LIVE VIEW</small></span><span className={streamUrl ? "cam__stream is-live" : "cam__stream"}>● {streamUrl ? "LIVE" : "OFFLINE"}</span></div>
    <div className="cam__frame">
      {streamUrl ? <img className="cam__img" src={streamUrl} alt="Live unit camera feed" /> : <div className="cam__placeholder"><span className="cam__camera-icon">▣</span><strong>CAMERA OFFLINE</strong><span>No stream configured</span><small>ESP32-CAM not connected</small><button className="cam__configure" onClick={() => setEditing(true)}>⌁ &nbsp; Set Stream URL</button></div>}
      <div className="cam__bracket cam__bracket--tl" /><div className="cam__bracket cam__bracket--tr" /><div className="cam__bracket cam__bracket--bl" /><div className="cam__bracket cam__bracket--br" />
      {detection?.personDetected && <div className="cam__tag">{detection.count ?? 1} PERSON{(detection.count ?? 1) > 1 ? "S" : ""} · {Math.round((detection.confidence ?? 0) * 100)}%</div>}
    </div>
    <div className="cam__bar"><span className="cam__label">RESQ-X &nbsp; {unit?.unitId ?? "UNAVAILABLE"}</span>{editing ? <input className="cam__input" autoFocus defaultValue={streamUrl} placeholder="http://<esp32-cam-ip>:81/stream" onBlur={saveUrl} onKeyDown={(event) => { if (event.key === "Enter") event.target.blur(); }} /> : streamUrl ? <button className="cam__edit" onClick={() => setEditing(true)}>Change stream URL</button> : <span className="cam__feed-label">ESP32-CAM PENDING</span>}</div>
  </div>;
}
