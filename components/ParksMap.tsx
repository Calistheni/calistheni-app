"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { parks } from "@/lib/parks-data";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function ParksMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);

  const [lightPreset, setLightPreset] = useState<
    "day" | "dusk" | "night" | "dawn"
  >("day");

  const [theme, setTheme] = useState<"default" | "faded" | "monochrome">(
    "default"
  );

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,

      style: "mapbox://styles/mapbox/standard",

      config: {
        basemap: {
          lightPreset,
          theme,

          show3dObjects: true,
          showPointOfInterestLabels: false,
          showTransitLabels: false,
        },
      },

      center: [-73.924958109856, 40.731742625495],
      zoom: 12,
      pitch: 60,
      bearing: -20,
      attributionControl: false,
    });

    map.on("load", () => {
      parks.slice(0, 100).forEach((park) => {
        const popup = new mapboxgl.Popup({
          offset: 25,
          closeButton: false,
        }).setHTML(`
          <div>
            <h3 style="font-weight:700;margin-bottom:6px;">
              ${park.name}
            </h3>
            <p style="font-size:14px;">
              ${park.address}
            </p>
          </div>
        `);

        const markerElement = document.createElement("div");
        markerElement.className = "park-marker";

        new mapboxgl.Marker(markerElement)
          .setLngLat([park.lon, park.lat])
          .setPopup(popup)
          .addTo(map);
      });
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
      "top-right"
    );

    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    return () => map.remove();
  }, [lightPreset, theme]);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setLightPreset("dawn")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          ☀️ Dawn
        </button>
        <button
          onClick={() => setLightPreset("day")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          ☀️ Day
        </button>

        <button
          onClick={() => setLightPreset("dusk")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          🌆 Dusk
        </button>

        <button
          onClick={() => setLightPreset("night")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          🌙 Night
        </button>

        <button
          onClick={() => setTheme("default")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          Default
        </button>

        <button
          onClick={() => setTheme("faded")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          Faded
        </button>

        <button
          onClick={() => setTheme("monochrome")}
          className="px-3 py-2 rounded bg-gray-700"
        >
          Monochrome
        </button>
      </div>

      <div ref={mapContainer} className="w-full h-[600px] rounded-lg" />
    </>
  );
}
