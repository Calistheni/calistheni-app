"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { parks } from "@/lib/parks-data";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function ParksMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);

  function getInitialLightPreset(): "dawn" | "day" | "dusk" | "night" {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 9) return "dawn";
    if (hour >= 9 && hour < 18) return "day";
    if (hour >= 18 && hour < 21) return "dusk";

    return "night";
  }

  const [lightPreset, setLightPreset] = useState<
    "dawn" | "day" | "dusk" | "night"
  >(getInitialLightPreset);

  const [theme, setTheme] = useState<"default" | "faded" | "monochrome">(
    "default"
  );
  const markerColor =
    lightPreset === "day" || lightPreset === "dawn"
      ? "#22d3ee" // cyan
      : "#ef4444"; // red
  useEffect(() => {
    if (!mapContainer.current) return;
    console.log(lightPreset, markerColor);
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
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: parks.map((park) => ({
          type: "Feature",
          properties: {
            id: park.id,
            name: park.name,
            address: park.address,
          },
          geometry: {
            type: "Point",
            coordinates: [park.lon, park.lat],
          },
        })),
      };

      map.addSource("parks", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 35,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "parks",
        filter: ["has", "point_count"],

        paint: {
          "circle-color": markerColor,

          "circle-radius": [
            "step",
            ["get", "point_count"],
            20,
            50,
            25,
            200,
            30,
          ],

          "circle-radius-transition": {
            duration: 300,
            delay: 0,
          },

          "circle-opacity-transition": {
            duration: 300,
            delay: 0,
          },

          "circle-emissive-strength": 1,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "parks",
        filter: ["has", "point_count"],

        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,

          "text-anchor": "center",
          "text-justify": "center",

          "text-allow-overlap": true,
          "text-ignore-placement": true,

          "text-optional": true,
        },

        paint: {
          "text-color": "#ffffff",

          "text-opacity-transition": {
            duration: 250,
            delay: 0,
          },
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "parks",

        filter: ["!", ["has", "point_count"]],

        paint: {
          "circle-color": markerColor,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-emissive-strength": 1,
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });

        const clusterId = features[0].properties?.cluster_id;

        const source = map.getSource("parks") as mapboxgl.GeoJSONSource;

        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;

          const coordinates = (features[0].geometry as GeoJSON.Point)
            .coordinates;

          map.easeTo({
            center: coordinates as [number, number],
            zoom: zoom ?? 12,
            duration: 1200,
            essential: true,
          });
        });
      });
      map.on("click", "unclustered-point", (e) => {
        const feature = e.features?.[0];

        if (!feature) return;

        const coordinates = (feature.geometry as GeoJSON.Point).coordinates;

        const props = feature.properties;

        new mapboxgl.Popup({ closeButton: false, offset: 25 })
          .setLngLat(coordinates as [number, number])
          .setHTML(
            `
            <h3>${props?.name}</h3>
            <p>${props?.address}</p>
          `
          )
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
