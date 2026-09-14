import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './CapturedPhotos.css';

function Metadata({ photo }) {
  return <div className="evidence__metadata">
    <strong>{photo.unitId}</strong>
    <time dateTime={photo.timestamp}>{new Date(photo.timestamp).toLocaleString()}</time>
    <span>{photo.gps ? `GPS: ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}` : 'GPS UNAVAILABLE'}</span>
    <b className={['CRITICAL', 'HIGH'].includes(photo.risk) ? 'evidence__danger' : ''}>Risk: {photo.risk} · Severity: {photo.severity}</b>
    <span>Temperature: {photo.temperature === null ? 'UNAVAILABLE' : `${photo.temperature} °C`} · Humidity: {photo.humidity === null ? 'UNAVAILABLE' : `${photo.humidity}%`}</span>
    <span>Flame: {photo.flame} · Human: {photo.human}</span>
    {photo.telemetrySimulated && <b>SIMULATED TELEMETRY</b>}
    <small>Telemetry snapshot at capture request{photo.telemetryTimestamp ? ` · last received ${new Date(photo.telemetryTimestamp).toLocaleString()}` : ' · receive time unavailable'}</small>
    <small>Camera source: {photo.cameraSource}</small>
  </div>;
}

function Preview({ photo, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="evidence__preview" onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }} aria-label="Captured photo preview">
    <div className="evidence__toolbar"><h3>PHOTO EVIDENCE</h3><button autoFocus onClick={onClose}>CLOSE</button></div>
    <img src={photo.url} alt={`Captured photo from ${photo.unitId}`} />
    <Metadata photo={photo} />
    <a download={photo.filename} href={photo.url}>DOWNLOAD JPEG</a>
  </dialog>, document.body);
}

export default function CapturedPhotos({ photos }) {
  const [selected, setSelected] = useState(null);
  return <section className="evidence" aria-label="Captured photos">
    <h2>📸 CAPTURED PHOTOS <small>{photos.length} · SESSION ONLY</small></h2>
    <p>Temporary evidence — download photos to keep them after refresh. Simulated captures do not create photo evidence.</p>
    {!photos.length ? <p>No captured photos yet.</p> : <div className="evidence__cards">{photos.map(photo => <article key={photo.id} className="evidence__card">
      <img src={photo.url} alt={`Captured photo from ${photo.unitId}`} loading="lazy" />
      <Metadata photo={photo} />
      <div className="evidence__toolbar"><button onClick={() => setSelected(photo)}>VIEW</button><a href={photo.url} download={photo.filename}>DOWNLOAD</a></div>
    </article>)}</div>}
    {selected && <Preview photo={selected} onClose={() => setSelected(null)} />}
  </section>;
}
