"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParkDetail, ParkSummary } from "@/types/park";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const VIEWPORT_DEBOUNCE_MS = 100;

type ParksMapProps = {
  parks: ParkSummary[];
  selectedPark: ParkSummary | null;
  onViewportParksChange: (parks: ParkSummary[]) => void;
  onViewportLoadingChange?: (isLoading: boolean) => void;
};

type PopupRenderOptions = {
  park?: Pick<ParkSummary, "name" | "address"> | ParkDetail;
  loading?: boolean;
  error?: string;
  expanded?: boolean;
};

function getInitialLightPreset(): "dawn" | "day" | "dusk" | "night" {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 18) return "day";
  if (hour >= 18 && hour < 21) return "dusk";

  return "night";
}

function escapeHtml(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCoordinate(value: number) {
  return Number(value.toFixed(1));
}

function getViewportKey(map: mapboxgl.Map) {
  const bounds = map.getBounds();

  if (!bounds) {
    return null;
  }

  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  return [
    normalizeCoordinate(southWest.lat),
    normalizeCoordinate(southWest.lng),
    normalizeCoordinate(northEast.lat),
    normalizeCoordinate(northEast.lng),
  ].join(":");
}

function buildGeoJson(parks: ParkSummary[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parks.map((park) => ({
      type: "Feature",
      properties: {
        id: park.id,
      },
      geometry: {
        type: "Point",
        coordinates: [park.lon, park.lat],
      },
    })),
  };
}

function renderPopupMarkup({
  park,
  loading = false,
  error,
  expanded = false,
}: PopupRenderOptions) {
  const equipment = park && "equipment" in park ? park.equipment : undefined;
  const visibleEquipment =
    equipment && !expanded ? equipment.slice(0, 2) : equipment ?? [];
  const hiddenCount = (equipment?.length ?? 0) - visibleEquipment.length;

  if (loading) {
    return `
      <div style="min-width:220px">
        <h3 style="font-size:16px;font-weight:600;margin:0 0 8px 0;">
          ${escapeHtml(park?.name ?? "Loading park")}
        </h3>
        <div style="height:10px;border-radius:999px;background:#e5e7eb;margin-bottom:8px;"></div>
        <div style="height:10px;width:70%;border-radius:999px;background:#e5e7eb;margin-bottom:12px;"></div>
        <div style="display:flex;gap:6px;">
          <span style="display:inline-block;width:54px;height:24px;border-radius:999px;background:#e5e7eb;"></span>
          <span style="display:inline-block;width:72px;height:24px;border-radius:999px;background:#e5e7eb;"></span>
        </div>
      </div>
    `;
  }

  if (error) {
    return `
      <div style="min-width:220px">
        <h3 style="font-size:16px;font-weight:600;margin:0 0 8px 0;">
          ${escapeHtml(park?.name ?? "Park")}
        </h3>
        <p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
          ${escapeHtml(error)}
        </p>
        <button
          data-popup-action="retry"
          style="
            background:#2563eb;
            color:white;
            border:none;
            border-radius:6px;
            padding:6px 10px;
            cursor:pointer;
            font-size:12px;
          "
        >
          Retry
        </button>
      </div>
    `;
  }

  return `
    <div style="min-width:220px">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 6px 0;">
        ${escapeHtml(park?.name ?? "Park")}
      </h3>
      <p style="margin:0;color:#6b7280;font-size:13px;">
        ${escapeHtml(park?.address ?? "Address unavailable")}
      </p>

      <button
        data-popup-action="directions"
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
        Directions
      </button>

      ${
        equipment
          ? `
            <div style="
              display:flex;
              flex-wrap:wrap;
              gap:6px;
              margin-top:10px;
            ">
              ${visibleEquipment
                .map(
                  (item) => `
                    <span style="
                      background:#374151;
                      color:white;
                      border-radius:6px;
                      padding:4px 8px;
                      font-size:11px;
                    ">
                      ${escapeHtml(item)}
                    </span>
                  `
                )
                .join("")}

              ${
                !expanded && hiddenCount > 0
                  ? `
                    <button
                      data-popup-action="show-more"
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
          `
          : ""
      }
    </div>
  `;
}

export default function ParksMap({
  parks,
  selectedPark,
  onViewportParksChange,
  onViewportLoadingChange,
}: ParksMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const parksRef = useRef(parks);
  const userLocationRef = useRef<[number, number] | null>(null);
  const viewportCacheRef = useRef(new Map<string, ParkSummary[]>());
  const detailCacheRef = useRef(new Map<number, ParkDetail>());
  const detailRequestCacheRef = useRef(new Map<number, Promise<ParkDetail>>());
  const lastViewportKeyRef = useRef<string | null>(null);
  const lastZoomBucketRef = useRef<number | null>(null);
  const viewportRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const viewportDebounceRef = useRef<number | null>(null);
  const mapLoadedRef = useRef(false);
  const [lightPreset, setLightPreset] = useState<
    "dawn" | "day" | "dusk" | "night"
  >(getInitialLightPreset);
  const [theme, setTheme] = useState<"default" | "faded" | "monochrome">(
    "default"
  );
  const [showLocationDialog, setShowLocationDialog] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return !localStorage.getItem("location-allowed");
  });
  const [isMapInitializing, setIsMapInitializing] = useState(true);
  const [isViewportLoading, setIsViewportLoading] = useState(true);
  const [viewportError, setViewportError] = useState<string | null>(null);

  const savedLocation =
    typeof window !== "undefined"
      ? localStorage.getItem("user-location")
      : null;

  const initialCenterRef = useRef<[number, number]>(
    savedLocation
      ? JSON.parse(savedLocation)
      : [-73.924958109856, 40.731742625495]
  );

  const markerColor =
    lightPreset === "day" || lightPreset === "dawn" ? "#22d3ee" : "#ef4444";

  function setViewportLoading(nextValue: boolean) {
    setIsViewportLoading(nextValue);
    onViewportLoadingChange?.(nextValue);
  }

  async function fetchParkDetail(parkId: number) {
    const cachedPark = detailCacheRef.current.get(parkId);

    if (cachedPark) {
      return cachedPark;
    }

    const inFlightRequest = detailRequestCacheRef.current.get(parkId);

    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = fetch(`/api/parks/${parkId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load park details.");
        }

        return (await response.json()) as ParkDetail;
      })
      .then((park) => {
        detailCacheRef.current.set(park.id, park);

        return park;
      })
      .finally(() => {
        detailRequestCacheRef.current.delete(parkId);
      });

    detailRequestCacheRef.current.set(parkId, request);

    return request;
  }

  async function drawRoute(
    map: mapboxgl.Map,
    park: ParkDetail,
    button: HTMLButtonElement
  ) {
    button.textContent = "Loading...";
    button.disabled = true;

    try {
      if (!userLocationRef.current) {
        setShowLocationDialog(true);
        button.textContent = "Directions";
        button.disabled = false;
        return;
      }

      const [userLon, userLat] = userLocationRef.current;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${userLon},${userLat};${park.lon},${park.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (!response.ok) {
        throw new Error("Directions request failed.");
      }

      const data = await response.json();
      const route = data.routes?.[0]?.geometry;

      if (!route) {
        button.textContent = "No route";
        button.disabled = false;
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

      route.coordinates.forEach((coordinate: [number, number]) => {
        bounds.extend(coordinate);
      });

      map.fitBounds(bounds, {
        padding: 80,
        duration: 1500,
      });

      button.textContent = "Route ready";
    } catch {
      button.textContent = "Retry directions";
      button.disabled = false;
    }
  }

  function setPopupMarkup(
    popup: mapboxgl.Popup,
    map: mapboxgl.Map,
    parkId: number,
    parkPreview: ParkSummary | undefined,
    options: PopupRenderOptions
  ) {
    popup.setHTML(renderPopupMarkup(options));

    window.requestAnimationFrame(() => {
      if (popupRef.current !== popup) {
        return;
      }

      const popupElement = popup.getElement();

      if (!popupElement) {
        return;
      }

      const directionsButton = popupElement.querySelector<HTMLButtonElement>(
        '[data-popup-action="directions"]'
      );
      const showMoreButton = popupElement.querySelector<HTMLButtonElement>(
        '[data-popup-action="show-more"]'
      );
      const retryButton = popupElement.querySelector<HTMLButtonElement>(
        '[data-popup-action="retry"]'
      );

      if (directionsButton && options.park && "equipment" in options.park) {
        directionsButton.addEventListener("click", () => {
          void drawRoute(map, options.park as ParkDetail, directionsButton);
        });
      }

      if (showMoreButton && options.park && "equipment" in options.park) {
        showMoreButton.addEventListener("click", () => {
          setPopupMarkup(popup, map, parkId, parkPreview, {
            park: options.park as ParkDetail,
            expanded: true,
          });
        });
      }

      if (retryButton) {
        retryButton.addEventListener("click", () => {
          setPopupMarkup(popup, map, parkId, parkPreview, {
            park: parkPreview,
            loading: true,
          });
          void loadPopupDetails(popup, map, parkId, parkPreview);
        });
      }
    });
  }

  async function loadPopupDetails(
    popup: mapboxgl.Popup,
    map: mapboxgl.Map,
    parkId: number,
    parkPreview?: ParkSummary
  ) {
    try {
      const park = await fetchParkDetail(parkId);

      if (popupRef.current !== popup) {
        return;
      }

      popup.setLngLat([park.lon, park.lat]);
      setPopupMarkup(popup, map, parkId, parkPreview, {
        park,
      });
    } catch {
      if (popupRef.current !== popup) {
        return;
      }

      setPopupMarkup(popup, map, parkId, parkPreview, {
        park: parkPreview,
        error: "Could not load this park. Please try again.",
      });
    }
  }

  function openParkPopup(
    map: mapboxgl.Map,
    parkId: number,
    coordinates: [number, number],
    parkPreview?: ParkSummary
  ) {
    popupRef.current?.remove();

    const popup = new mapboxgl.Popup({
      closeButton: false,
      offset: 25,
    })
      .setLngLat(coordinates)
      .addTo(map);

    popup.on("close", () => {
      if (popupRef.current === popup) {
        popupRef.current = null;
      }
    });

    popupRef.current = popup;
    setPopupMarkup(popup, map, parkId, parkPreview, {
      park: parkPreview,
      loading: true,
    });
    void loadPopupDetails(popup, map, parkId, parkPreview);
  }
  const openParkPopupRef = useRef(openParkPopup);

  async function requestViewportParks({
    force = false,
  }: { force?: boolean } = {}) {
    if (viewportCacheRef.current.has("ALL_PARKS")) {
      const parks = viewportCacheRef.current.get("ALL_PARKS")!;

      parksRef.current = parks;
      onViewportParksChange(parks);

      return;
    }

    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      return;
    }

    const key = "ALL_PARKS";

    const zoom = map.getZoom();

    if (!key) {
      return;
    }

    if (!force && key === lastViewportKeyRef.current) {
      return;
    }

    const cachedParks = viewportCacheRef.current.get(key);

    if (cachedParks) {
      lastViewportKeyRef.current = key;
      setViewportError(null);
      onViewportParksChange(cachedParks);
      setViewportLoading(false);
      return;
    }

    if (viewportRequestRef.current?.key === key) {
      return viewportRequestRef.current.promise;
    }

    viewportRequestRef.current?.controller.abort();

    const controller = new AbortController();
    const bounds = map.getBounds();

    if (!bounds) {
      return;
    }
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const params = new URLSearchParams();
    setViewportLoading(true);
    setViewportError(null);

    console.time("fetch-parks");

    const promise = fetch(`/api/parks?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load parks.");
        }

        const data = (await response.json()) as ParkSummary[];

        console.timeEnd("fetch-parks");
        console.log("parks loaded", data.length);

        return data;
      })
      .then((nextParks) => {
        console.time("geojson");

        const geojson = buildGeoJson(nextParks);

        console.timeEnd("geojson");

        console.time("setData");

        const source = mapRef.current?.getSource("parks") as
          | mapboxgl.GeoJSONSource
          | undefined;

        if (source) {
          source.setData(geojson);
        }

        console.timeEnd("setData");

        viewportCacheRef.current.set(key, nextParks);
        lastViewportKeyRef.current = key;
        parksRef.current = nextParks;
        onViewportParksChange(nextParks);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") {
          return;
        }

        setViewportError("Unable to load parks for this area.");
      })
      .finally(() => {
        if (viewportRequestRef.current?.key === key) {
          viewportRequestRef.current = null;
        }

        setViewportLoading(false);
      });

    viewportRequestRef.current = {
      key,
      controller,
      promise,
    };
    console.log("FETCHING", {
      zoom: map.getZoom(),
      key,
    });

    return promise;
  }

  function scheduleViewportLoad({ force = false }: { force?: boolean } = {}) {
    if (viewportDebounceRef.current) {
      window.clearTimeout(viewportDebounceRef.current);
    }

    viewportDebounceRef.current = window.setTimeout(() => {
      void requestViewportParks({ force });
    }, VIEWPORT_DEBOUNCE_MS);
  }
  const requestViewportParksRef = useRef(requestViewportParks);
  const scheduleViewportLoadRef = useRef(scheduleViewportLoad);

  useEffect(() => {
    openParkPopupRef.current = openParkPopup;
    requestViewportParksRef.current = requestViewportParks;
    scheduleViewportLoadRef.current = scheduleViewportLoad;
  });

  useEffect(() => {
    parksRef.current = parks;

    const source = mapRef.current?.getSource("parks") as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!source) {
      return;
    }

    source.setData(buildGeoJson(parks));
  }, [parks]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const initialLightPreset = getInitialLightPreset();
    const initialMarkerColor =
      initialLightPreset === "day" || initialLightPreset === "dawn"
        ? "#22d3ee"
        : "#ef4444";

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      config: {
        basemap: {
          lightPreset: initialLightPreset,
          theme: "default",
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
      center: initialCenterRef.current,
      zoom: 12,
      pitch: 0,
      bearing: -20,
      attributionControl: false,
    });

    mapRef.current = map;

    const handleMapLoad = () => {
      mapLoadedRef.current = true;
      setIsMapInitializing(false);

      map.addSource("parks", {
        type: "geojson",
        data: buildGeoJson([]),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 80,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "parks",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": initialMarkerColor,
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
          "circle-color": initialMarkerColor,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-emissive-strength": 1,
        },
      });

      map.on("click", "clusters", (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["clusters"],
        });

        const clusterId = features[0]?.properties?.cluster_id;

        if (!clusterId) {
          return;
        }

        const source = map.getSource("parks") as mapboxgl.GeoJSONSource;

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) {
            return;
          }

          const coordinates = (features[0].geometry as GeoJSON.Point)
            .coordinates as [number, number];

          map.easeTo({
            center: coordinates,
            zoom: zoom ?? 12,
            duration: 1200,
            essential: true,
          });
        });
      });

      map.on("click", "unclustered-point", (event) => {
        const feature = event.features?.[0];

        if (!feature) {
          return;
        }

        const parkId = Number(feature.properties?.id);
        const parkPreview = parksRef.current.find((park) => park.id === parkId);

        if (!parkPreview) {
          return;
        }

        openParkPopupRef.current(
          map,
          parkId,
          [parkPreview.lon, parkPreview.lat],
          parkPreview
        );
      });

      map.on("moveend", () => {
        scheduleViewportLoadRef.current();
      });

      if (localStorage.getItem("location-allowed") === "true") {
        window.setTimeout(() => {
          geolocateRef.current?.trigger();
        }, 500);
      }

      void requestViewportParksRef.current({ force: true });
    };

    map.on("load", handleMapLoad);
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });

    geolocateRef.current = geolocate;

    geolocate.on("geolocate", (event) => {
      const location: [number, number] = [
        event.coords.longitude,
        event.coords.latitude,
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
    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    return () => {
      if (viewportDebounceRef.current) {
        window.clearTimeout(viewportDebounceRef.current);
      }

      viewportRequestRef.current?.controller.abort();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapLoadedRef.current) {
      return;
    }

    map.setConfigProperty("basemap", "lightPreset", lightPreset);
    map.setConfigProperty("basemap", "theme", theme);
    map.setPaintProperty("clusters", "circle-color", markerColor);
    map.setPaintProperty("unclustered-point", "circle-color", markerColor);

    const source = map.getSource("parks") as mapboxgl.GeoJSONSource | undefined;

    if (source) {
      source.setData(buildGeoJson(parksRef.current));
    }
  }, [lightPreset, markerColor, theme]);

  useEffect(() => {
    const map = mapRef.current;

    if (!selectedPark || !map || !mapLoadedRef.current) {
      return;
    }

    map.flyTo({
      center: [selectedPark.lon, selectedPark.lat],
      zoom: 17,
      duration: 1500,
    });

    const showSelectedPark = () => {
      openParkPopupRef.current(
        map,
        selectedPark.id,
        [selectedPark.lon, selectedPark.lat],
        selectedPark
      );
    };

    map.once("moveend", showSelectedPark);

    return () => {
      map.off("moveend", showSelectedPark);
    };
  }, [selectedPark]);

  const enableLocation = () => {
    setShowLocationDialog(false);
    geolocateRef.current?.trigger();
  };

  const maybeLater = () => {
    setShowLocationDialog(false);
    localStorage.removeItem("location-allowed");
  };

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

          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={maybeLater}>
              Maybe Later
            </Button>

            <Button onClick={enableLocation}>Allow Location</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex flex-wrap gap-2">
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

      <div className="relative">
        <div
          ref={mapContainer}
          className="h-[600px] w-full overflow-hidden rounded-lg"
        />

        {isMapInitializing ? (
          <div className="pointer-events-none absolute inset-0 rounded-lg border bg-muted/50 p-6">
            <div className="h-full animate-pulse rounded-lg bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200" />
          </div>
        ) : null}

        {/* {!isMapInitializing && isViewportLoading ? (
          <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background/90 px-3 py-2 text-sm shadow-sm">
            Loading parks...
          </div>
        ) : null} */}

        {viewportError ? (
          <div className="absolute bottom-4 left-4 rounded-md bg-background/95 p-3 shadow-sm">
            <p className="text-sm text-muted-foreground">{viewportError}</p>
            <Button
              className="mt-2"
              size="sm"
              onClick={() => {
                void requestViewportParksRef.current({ force: true });
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
