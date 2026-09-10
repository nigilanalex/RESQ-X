import { useState } from "react";
import { sendControl } from "../api/socket";
import "./ControlPanel.css";

export default function ControlPanel({ unit }) {
  const [sirenOn, setSirenOn] = useState(false);
  const [lightOn, setLightOn] = useState(false);
  const [error, setError] = useState(null);

  const unitId = unit?.unitId;

  async function fire(action, params) {
    if (!unitId) return;
    setError(null);
    try {
      await sendControl(unitId, action, params);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="ctrl">
      <div className="ctrl__title">
        MANUAL CONTROL{" "}
        {!unit?.online && <span className="ctrl__offline">UNIT OFFLINE</span>}
      </div>

      <div className="ctrl__dpad">
        <div />
        <button className="ctrl__btn" onMouseDown={() => fire("move_forward")} onMouseUp={() => fire("stop")}>
          ▲
        </button>
        <div />
        <button className="ctrl__btn" onMouseDown={() => fire("turn_left")} onMouseUp={() => fire("stop")}>
          ◀
        </button>
        <button className="ctrl__btn ctrl__btn--stop" onClick={() => fire("stop")}>
          STOP
        </button>
        <button className="ctrl__btn" onMouseDown={() => fire("turn_right")} onMouseUp={() => fire("stop")}>
          ▶
        </button>
        <div />
        <button className="ctrl__btn" onMouseDown={() => fire("move_backward")} onMouseUp={() => fire("stop")}>
          ▼
        </button>
        <div />
      </div>

      <div className="ctrl__toggles">
        <button
          className={`ctrl__toggle ${sirenOn ? "is-on" : ""}`}
          onClick={() => {
            const next = !sirenOn;
            setSirenOn(next);
            fire(next ? "siren_on" : "siren_off");
          }}
        >
          SIREN {sirenOn ? "ON" : "OFF"}
        </button>
        <button
          className={`ctrl__toggle ${lightOn ? "is-on" : ""}`}
          onClick={() => {
            const next = !lightOn;
            setLightOn(next);
            fire(next ? "light_on" : "light_off");
          }}
        >
          LIGHT {lightOn ? "ON" : "OFF"}
        </button>
      </div>

      {error && <div className="ctrl__error">{error}</div>}

      {unit?.lastCommand && (
        <div className="ctrl__last">
          Last sent: <span>{unit.lastCommand.action}</span>
        </div>
      )}
    </div>
  );
}
