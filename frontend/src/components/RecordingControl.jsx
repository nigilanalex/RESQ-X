// Extension point: future origin-clean canvas -> captureStream -> MediaRecorder.
// No recording request, fake timer, or additional stream until verified.
export default function RecordingControl() {
  return <button type="button" disabled title="Recording is not implemented. Browser canvas/CORS compatibility must be verified first." aria-label="Recording unavailable">● REC <small>UNAVAILABLE</small></button>;
}
