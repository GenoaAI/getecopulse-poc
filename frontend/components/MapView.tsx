"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const STYLES: Record<string, PathOptions> = {
  site_boundary: { color: "#f59e0b", weight: 2, dashArray: "6 4", fillOpacity: 0.06 },
  overpass:      { color: "#10b981", weight: 2, fillOpacity: 0.28 },
  nominatim:     { color: "#3b82f6", weight: 2, fillOpacity: 0.2 },
  osm:           { color: "#3b82f6", weight: 2, fillOpacity: 0.2 },
  default:       { color: "#6366f1", weight: 2, fillOpacity: 0.2 },
};

function featureStyle(feature?: Feature): PathOptions {
  const label  = feature?.properties?.label  as string | undefined;
  const source = feature?.properties?.source as string | undefined;
  if (label === "site_boundary") return STYLES.site_boundary;
  if (source === "overpass")     return STYLES.overpass;
  if (source === "nominatim")    return STYLES.nominatim;
  if (source === "osm")          return STYLES.osm;
  return STYLES.default;
}

// ---------------------------------------------------------------------------
// FlyTo helper
// ---------------------------------------------------------------------------

function FlyTo({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 17, { duration: 1.5 });
  }, [center, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface MapViewProps {
  center: [number, number];
  geojson: FeatureCollection | null;
}

export default function MapView({ center, geojson }: MapViewProps) {
  // Guard: only render Leaflet after client-side mount.
  // Leaflet accesses the DOM at initialisation — rendering it during SSR
  // (or before hydration with Turbopack) throws "appendChild of undefined".
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Fix default marker icons broken by Next.js asset pipeline.
    // Must run client-side only, hence inside useEffect.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-slate-800 flex items-center justify-center">
        <span className="text-xs text-slate-500">Chargement de la carte…</span>
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo center={center} />

      {geojson && (
        <GeoJSON
          key={`${center[0]}-${center[1]}`}
          data={geojson}
          style={featureStyle}
          pointToLayer={(_, latlng) => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const L = require("leaflet") as typeof import("leaflet");
            return L.circleMarker(latlng, {
              radius: 7,
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.9,
              weight: 2,
            });
          }}
        />
      )}
    </MapContainer>
  );
}
