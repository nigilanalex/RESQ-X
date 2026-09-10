import { useState } from "react";
import "./CameraFeed.css";

const LEVEL_COLOR = {
  LOW: "var(--level-low)",
  MEDIUM: "var(--level-medium)",
  HIGH: "var(--level-high)",
  CRITICAL: "var(--level-critical)",
};

export default function CameraFeed({ unit, streamUrl, onChangeStreamUrl }) {
  const [editing, setEditing] = useState(false);
  const level = unit?.risk?.level || "LOW";
  const detection = unit?.detection;

  return (
    <div className="cam" style={{ "--level-color": LEVEL_COLOR[level] }}>
      <div className="cam__frame">
        {streamUrl ? (
          <img className="cam__img" src={streamUrl} alt="Live unit camera feed" />
        ) : (
          <div className="cam__placeholder">No stream URL set</div>
        )}

        {/* Signature: targeting brackets pulse faster/brighter as risk rises */}
        <div className="cam__bracket cam__bracket--tl" />
        <div className="cam__bracket cam__bracket--tr" />
        <div className="cam__bracket cam__bracket--bl" />
        <div className="cam__bracket cam__bracket--br" />

        {detection?.personDetected && (
          <div className="cam__tag">
            {detection.count ?? 1} PERSON{(detection.count ?? 1) > 1 ? "S" : ""} ·{" "}
            {Math.round((detection.confidence ?? 0) * 100)}%
          </div>
        )}
      </div>

      <div className="cam__bar">
        <span className="cam__label">CAM · {unit?.unitId ?? "—"}</span>
        {editing ? (
          <input
            className="cam__input"
            autoFocus
            defaultValue={streamUrl}
            placeholder="http://<esp32-cam-ip>:81/stream"
            onBlur={(e) => {
              onChangeStreamUrl(e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
            }}
          />
        ) : (
          <button className="cam__edit" onClick={() => setEditing(true)}>
            Set stream URL
          </button>
        )}
      </div>
    </div>
  );
}
