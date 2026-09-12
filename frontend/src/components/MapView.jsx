import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });
function FollowUnit({ position }) { const map = useMap(); useEffect(() => { map.setView(position, map.getZoom(), { animate: true }); }, [map, position]); return null; }

export default function MapView({ unit }) {
  const gps = unit?.sensors?.gps;
  const heading = <div className="location-panel__heading"><span>⌖ &nbsp; LOCATION</span><b>{gps?.valid ? "GPS LOCK" : "GPS OFFLINE"}</b></div>;
  if (!gps?.valid || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return <div className="location-panel">{heading}<div className="location-panel__body"><div><strong>GPS UNAVAILABLE</strong><small>{gps?.satellites || 0} satellites<br />No fallback position is shown.</small></div><span className="location-panel__na">N/A</span></div></div>;
  const position = [gps.lat, gps.lng];
  return <div className="location-panel">{heading}<div className="location-panel__body"><div><strong>{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</strong><small>{gps.satellites || 0} satellites{unit?.sensors?.simulated ? " · SIMULATED GPS" : ""}</small></div><span className="location-panel__na">GPS</span></div><div className="map-container"><MapContainer center={position} zoom={16} scrollWheelZoom style={{ height: "250px", width: "100%" }}><FollowUnit position={position} /><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={position}><Popup><strong>RESQ-X Unit{unit?.sensors?.simulated ? " (SIMULATED GPS)" : ""}</strong><br />Unit: {unit.unitId}<br />Latitude: {gps.lat}<br />Longitude: {gps.lng}</Popup></Marker></MapContainer></div></div>;
}
