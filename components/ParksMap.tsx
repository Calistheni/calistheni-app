"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { parks } from "@/lib/parks-data";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function ParksMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.924958109856, 40.731742625495],
      zoom: 12,
      attributionControl: false,
    });
    console.log("Center:", map.getCenter());
    console.log("Zoom:", map.getZoom());
    console.log(map.getCenter());

    map.on("load", () => {
      console.log(map.getCenter());

      parks.slice(0, 20).forEach((park) => {
        new mapboxgl.Marker().setLngLat([park.lon, park.lat]).addTo(map);
      });
    });
    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    return () => {
      map.remove();
    };
  }, []);

  return <div ref={mapContainer} className="w-full h-[600px] rounded-lg" />;
}
