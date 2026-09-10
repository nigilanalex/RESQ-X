import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function MapView({ unit }) {
  const gps = unit?.sensors?.gps;

  if (!gps || gps.lat == null || gps.lng == null) {
    return (
      <div className="map-empty">
        Waiting for GPS location...
      </div>
    );
  }

  const position = [gps.lat, gps.lng];

  return (
    <div className="map-container">
      <MapContainer
        center={position}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: "400px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={position}>
          <Popup>
            <strong>RESQ-X Unit</strong>
            <br />
            Unit: {unit.unitId}
            <br />
            Latitude: {gps.lat}
            <br />
            Longitude: {gps.lng}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}