import { useCallback, useEffect, useRef, useState } from "react";
import "./CameraFeed.css";
import HeadlightControl from './HeadlightControl';
import { captureMetadata } from './photoEvidence';

function validUrl(value) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

export default function CameraFeed({ unit, streamUrl, onChangeStreamUrl, onCaptured }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(streamUrl || "");
  const [health, setHealth] = useState(streamUrl ? "CONNECTING" : "NOT_CONNECTED");
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef(null);
  const imageErrorRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const frameRef = useRef(null);
  const captureRequest = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    setCaptureMessage('');
    return () => captureRequest.current?.abort();
  }, [unit?.operatingMode, unit?.unitId, unit?.online, streamUrl]);
  useEffect(() => {
    if (!captureMessage) return;
    const timer = setTimeout(() => setCaptureMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [captureMessage]);
  async function toggleFullscreen() {
    try {
      setFullscreenError('');
      if (document.fullscreenElement === frameRef.current) await document.exitFullscreen();
      else if (frameRef.current?.requestFullscreen) await frameRef.current.requestFullscreen();
      else setFullscreenError('FULL SCREEN UNAVAILABLE');
    } catch { setFullscreenError('FULL SCREEN UNAVAILABLE'); }
  }
  async function captureImage() {
    if (captureRequest.current) return;
    setCaptureMessage('');
    if (unit?.operatingMode === 'SIMULATION') {
      setCaptureMessage('PHOTO CAPTURED (SIMULATED)');
      return; // No request and no fabricated download in simulation.
    }
    if (unit?.operatingMode !== 'LIVE' || !unit?.online) {
      setCaptureMessage('CAPTURE FAILED — CAMERA UNAVAILABLE');
      return;
    }
    const controller = new AbortController();
    captureRequest.current = controller;
    setCapturing(true);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // The control/capture server is separate from the MJPEG server on port 81.
      const base = new URL(import.meta.env.VITE_ESP32_CAM_BASE_URL || streamUrl);
      if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid camera URL');
      if (!import.meta.env.VITE_ESP32_CAM_BASE_URL && base.port === '81') base.port = '';
      const captureUrl = new URL('/capture', base);
      const metadata = captureMetadata(unit, captureUrl.href);
      const response = await fetch(captureUrl, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Camera HTTP ${response.status}`);
      const blob = await response.blob();
      const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      if (!blob.size || signature[0] !== 0xff || signature[1] !== 0xd8) throw new Error('Camera did not return a JPEG');
      // Reject undecodable/corrupt payloads before downloading or saving evidence.
      const decoded = await createImageBitmap(blob);
      decoded.close();
      if (controller.signal.aborted) return;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = metadata.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
      onCaptured?.(metadata, blob);
      setCaptureMessage('PHOTO CAPTURED');
    } catch (error) {
      setCaptureMessage('CAPTURE FAILED — CAMERA UNAVAILABLE');
      console.debug('[RESQ-X camera] Capture failed (check camera reachability and browser permissions)', error);
    } finally {
      clearTimeout(timeout);
      captureRequest.current = null;
      setCapturing(false);
    }
  }
  const mountImage = useCallback(image => {
    imageRef.current = image;
    if (!image) return;
    imageErrorRef.current = false;
    setHealth("CONNECTING");
    setDiagnostics(null);
    console.debug("[RESQ-X camera] <img> mounted", {
      src: image.src, assignedSrc: image.getAttribute("src"), pageOrigin: window.location.origin,
    });
  }, []);
  const handleImageError = event => {
    imageErrorRef.current = true;
    setHealth("ERROR");
    setDiagnostics(current => ({ ...current, error: true }));
    // Image error events do not expose HTTP status or browser policy details.
    console.error("[RESQ-X camera] MJPEG image error; inspect Network/Console for the cause", {
      src: event.currentTarget.src, event: event.nativeEvent,
      pageOrigin: window.location.origin,
    });
  };
  const camera = unit?.sensors?.camera || {};
  const simulated = unit?.operatingMode === "SIMULATION";
  useEffect(() => {
    setHealth(streamUrl ? (imageErrorRef.current ? "ERROR" : "CONNECTING") : "NOT_CONNECTED");
    if (!streamUrl) return;
    // MJPEG can render frames without completing a normal image load.
    // Never wait for response completion or fail an open stream on a timer.
    const inspectImage = () => {
      const image = imageRef.current;
      if (!image) return;
      const bounds = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      const next = {
        mounted: image.isConnected, src: image.getAttribute("src"), resolvedSrc: image.currentSrc || image.src,
        width: Math.round(bounds.width), height: Math.round(bounds.height),
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        display: style.display, visibility: style.visibility, opacity: style.opacity,
        error: imageErrorRef.current,
      };
      setDiagnostics(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      if (image?.naturalWidth > 0 && image.naturalHeight > 0) {
        setHealth(current => current === "ERROR" ? current : "STREAMING");
      }
    };
    inspectImage();
    // Read DOM metrics only; this never changes src or starts another request.
    const timer = setInterval(inspectImage, 1000);
    return () => clearInterval(timer);
  }, [streamUrl, attempt]);
  const status = streamUrl ? health : (camera.status || "NOT_CONNECTED");
  const save = () => { if (validUrl(draft)) { setHealth("CONNECTING"); setAttempt(value => value + 1); onChangeStreamUrl(draft); setEditing(false); } };
  const offline = status !== "ONLINE" && status !== "STREAMING";
  return <div className="cam">
    <div className="cam__heading"><span>CAMERA <small>LIVE VIEW</small></span><span className={offline ? "cam__stream" : "cam__stream is-live"}>● {streamUrl ? (status === "CONNECTING" ? "CONNECTING" : offline ? "OFFLINE" : "LIVE") : simulated ? `SIMULATED ${status}` : offline ? "OFFLINE" : "LIVE"}</span></div>
    <div className="cam__frame" ref={frameRef}>
      <div className="cam__headlight"><HeadlightControl unit={unit} /></div>
      {streamUrl && <img key={`${streamUrl}:${attempt}`} ref={mountImage} className="cam__img" src={streamUrl} alt="ESP32-CAM stream" onError={handleImageError} />}
      {(!streamUrl || health === "ERROR") && <div className="cam__placeholder"><strong>CAMERA OFFLINE</strong><span>{streamUrl ? "ESP32-CAM STREAM UNAVAILABLE" : "ESP32-CAM NOT CONNECTED"}</span><small>{streamUrl ? "Retry or update the stream URL" : "No stream configured"}</small>{simulated && <em>SIMULATED CAMERA STATE: {camera.status || "NOT_CONNECTED"}</em>}<button className="cam__configure" onClick={() => { setDraft(streamUrl || ""); setEditing(true); }}>{streamUrl ? "Retry / Set Stream URL" : "Set Stream URL"}</button></div>}
      <div className="cam__actions">
        <button onClick={captureImage} disabled={capturing} aria-busy={capturing}>{capturing ? 'CAPTURING…' : '📸 CAPTURE IMAGE'}</button>
        <button onClick={toggleFullscreen}>{fullscreen ? '⛶ EXIT FULL SCREEN' : '⛶ FULL SCREEN'}</button>
      </div>
      {(captureMessage || fullscreenError) && <div className="cam__feedback" role="status">{captureMessage || fullscreenError}</div>}
    </div>
    <div className="cam__bar"><span className="cam__label">STATUS: {status}</span><span className="cam__feed-label">{streamUrl ? "STREAM CONFIGURED" : "STREAM NOT CONFIGURED"}</span>{streamUrl && <button className="cam__edit" onClick={() => { setDraft(streamUrl); setEditing(true); }}>Retry / Set Stream URL</button>}</div>
    {editing && <div className="cam__editor" role="region" aria-label="Camera Stream URL editor"><div className="cam__dialog"><label htmlFor="camera-stream-url">Camera Stream URL</label><input id="camera-stream-url" type="url" autoFocus value={draft} placeholder="http://192.168.x.x/..." onChange={(event) => setDraft(event.target.value)} /><small>{draft && !validUrl(draft) ? "Enter a valid HTTP or HTTPS URL." : "Enter the ESP32-CAM stream URL (HTTP/HTTPS)."}</small><div><button onClick={() => setEditing(false)}>Cancel</button><button disabled={!validUrl(draft)} onClick={save}>Save</button></div></div></div>}
    {streamUrl && <div className="cam__diagnostics" aria-label="Temporary camera diagnostics">
      <strong>CAMERA DIAGNOSTICS (TEMPORARY)</strong>
      <span>Active URL: {streamUrl}</span>
      <span>Image mounted: {diagnostics?.mounted ? "YES" : "CHECKING"} | onerror: {diagnostics?.error ? "YES" : "NO"}</span>
      <span>Rendered: {diagnostics?.width ?? "?"} x {diagnostics?.height ?? "?"} px | Decoded: {diagnostics?.naturalWidth ?? 0} x {diagnostics?.naturalHeight ?? 0} px</span>
      <span>CSS: {diagnostics?.display ?? "?"} / {diagnostics?.visibility ?? "?"} / opacity {diagnostics?.opacity ?? "?"}</span>
      <span>Assigned src: {diagnostics?.src ?? streamUrl}</span>
      <span>Resolved src: {diagnostics?.resolvedSrc ?? "Checking"}</span>
      <small>{window.location.protocol === "https:" && streamUrl.startsWith("http:") ? "HTTPS page with HTTP camera: check Console for mixed-content blocking. " : ""}If blank, inspect the stream request in DevTools Network and local-network permission errors in Console. An image error cannot reveal the underlying network reason.</small>
    </div>}
  </div>;
}
