"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { parks } from "@/lib/parks-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // Ensure Dialog components are imported

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

import type { Park } from "@/types/park";

type ParksMapProps = {
  selectedPark: Park | null;
};

export default function ParksMap({ selectedPark }: ParksMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const userLocationRef = useRef<[number, number] | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);

  const savedLocation =
    typeof window !== "undefined"
      ? localStorage.getItem("user-location")
      : null;

  const initialCenter: [number, number] = savedLocation
    ? JSON.parse(savedLocation)
    : [-73.924958109856, 40.731742625495];

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

  function openParkPopup(map: mapboxgl.Map, park: Park): mapboxgl.Popup {
    const equipment = park.equipment;

    const renderBadge = (item: string) => `
          <span style="
            background:#374151;
            color:white;
            border-radius:6px;
            padding:4px 8px;
            font-size:11px;
          ">
            ${item}
          </span>
        `;

    const renderPopup = (expanded = false) => {
      const visibleEquipment = expanded ? equipment : equipment.slice(0, 2);

      const hiddenCount = equipment.length - visibleEquipment.length;

      return `
            <h3>${park.name}</h3>
            <p>${park.address}</p>

             <button
        id="show-directions"
        style="
    background:#2563eb;
    color:white;
    border:none;
    border-radius:6px;
    padding:6px 10px;
    cursor:pointer;
    font-size:12px;
    margin-top:10px;
  "
      >
        🧭 Directions
      </button>
      
            <div style="
              display:flex;
              flex-wrap:wrap;
              gap:6px;
              margin-top:10px;
            ">
              ${visibleEquipment.map(renderBadge).join("")}
      
              ${
                !expanded && hiddenCount > 0
                  ? `
                    <button
                      id="show-more-equipment"
                      style="
                        background:#374151;
                        color:white;
                        border:none;
                        border-radius:6px;
                        padding:4px 8px;
                        cursor:pointer;
                        font-size:11px;
                      "
                    >
                      +${hiddenCount}
                    </button>
                  `
                  : ""
              }
            </div>
          `;
    };

    const popup = new mapboxgl.Popup({
      closeButton: false,
      offset: 25,
    })
      .setLngLat([park.lon, park.lat])
      .setHTML(renderPopup(false))
      .addTo(map);

    setTimeout(() => {
      const btn = document.getElementById("show-more-equipment");
      const directionsBtn = document.getElementById("show-directions");
      directionsBtn?.addEventListener("click", async () => {
        directionsBtn.textContent = "Loading...";

        try {
          if (!userLocationRef.current) {
            setShowLocationDialog(true);
            directionsBtn.textContent = "Directions";
            return;
          }
          const [userLon, userLat] = userLocationRef.current;
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/walking/${userLon},${userLat};${park.lon},${park.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
          );

          const data = await response.json();

          console.log(data);

          const route = data.routes?.[0]?.geometry;

          if (!route) {
            directionsBtn.textContent = "No Route";
            return;
          }

          if (map.getSource("route")) {
            (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
              type: "Feature",
              properties: {},
              geometry: route,
            });
          } else {
            map.addSource("route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: route,
              },
            });

            map.addLayer({
              id: "route",
              type: "line",
              source: "route",
              paint: {
                "line-color": "#2563eb",
                "line-width": 5,
              },
            });
          }

          const bounds = new mapboxgl.LngLatBounds();

          route.coordinates.forEach((coord: [number, number]) => {
            bounds.extend(coord);
          });

          map.fitBounds(bounds, {
            padding: 80,
            duration: 1500,
          });

          directionsBtn.textContent = "✓ Route";
        } catch (err) {
          console.error(err);
          directionsBtn.textContent = "Error";
        }
      });

      if (!btn) return;

      btn.addEventListener("click", () => {
        popup.setHTML(renderPopup(true));
      });
    }, 0);
    popupRef.current = popup;
    return popup;
  }

  const [showLocationDialog, setShowLocationDialog] = useState(false);
  useEffect(() => {
    const locationAllowed = localStorage.getItem("location-allowed");

    if (!locationAllowed) {
      setShowLocationDialog(true);
    }
  }, []);
  const enableLocation = () => {
    setShowLocationDialog(false);

    geolocateRef.current?.trigger();
  };
  const maybeLater = () => {
    setShowLocationDialog(false);

    localStorage.removeItem("location-allowed");
  };
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
          show3dBuildings: true,
          show3dTrees: true,

          showPointOfInterestLabels: false,
          showTransitLabels: false,

          showRoadLabels: true,
          showPlaceLabels: true,

          showPedestrianRoads: true,
        },
      },

      center: initialCenter,
      zoom: 12,
      pitch: 60,
      bearing: -20,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: parks.map((park) => ({
          type: "Feature",
          properties: {
            id: park.id,
            name: park.name,
            address: park.address,
            equipment: park.equipment,
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

        const park = parks.find((p) => p.id === Number(feature.properties?.id));

        if (!park) return;

        popupRef.current?.remove();

        popupRef.current = openParkPopup(map, park);
      });
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });
    geolocateRef.current = geolocate;

    geolocate.on("geolocate", (e) => {
      const location: [number, number] = [
        e.coords.longitude,
        e.coords.latitude,
      ];

      userLocationRef.current = location;

      localStorage.setItem("location-allowed", "true");
      localStorage.setItem("user-location", JSON.stringify(location));

      map.flyTo({
        center: location,
        zoom: 14,
        duration: 1000,
      });
    });

    geolocate.on("error", () => {
      localStorage.removeItem("location-allowed");
      localStorage.removeItem("user-location");
    });

    map.addControl(geolocate, "top-right");
    map.on("load", () => {
      if (localStorage.getItem("location-allowed") === "true") {
        setTimeout(() => {
          geolocate.trigger();
        }, 500);
      }
    });

    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    return () => map.remove();
  }, [lightPreset, theme]);

  useEffect(() => {
    if (!selectedPark || !mapRef.current) return;

    popupRef.current?.remove();

    mapRef.current.flyTo({
      center: [selectedPark.lon, selectedPark.lat],
      zoom: 17,
      duration: 1500,
    });

    mapRef.current.once("moveend", () => {
      popupRef.current = openParkPopup(mapRef.current!, selectedPark);
    });
  }, [selectedPark]);

  return (
    <>
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Location</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Allow access to your location to get walking directions to nearby
            calisthenics parks.
            <br />
            <br />
            Your location is only used while using the app and can be disabled
            at any time from your browser settings.
          </p>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={maybeLater}>
              Maybe Later
            </Button>

            <Button onClick={enableLocation}>Allow Location</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="secondary" onClick={() => setLightPreset("dawn")}>
          ☀️ Dawn
        </Button>

        <Button variant="secondary" onClick={() => setLightPreset("day")}>
          ☀️ Day
        </Button>

        <Button variant="secondary" onClick={() => setLightPreset("dusk")}>
          🌆 Dusk
        </Button>

        <Button variant="secondary" onClick={() => setLightPreset("night")}>
          🌙 Night
        </Button>

        <Button variant="secondary" onClick={() => setTheme("default")}>
          Default
        </Button>

        <Button variant="secondary" onClick={() => setTheme("faded")}>
          Faded
        </Button>

        <Button variant="secondary" onClick={() => setTheme("monochrome")}>
          Monochrome
        </Button>
      </div>

      <div ref={mapContainer} className="w-full h-[600px] rounded-lg" />
    </>
  );
}
