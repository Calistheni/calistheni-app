"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParkDetail, ParkSummary } from "@/types/park";
import {
  deleteParkDetails,
  loadParkDetail,
  saveParkDetail,
  loadParks,
  saveParks,
  mergeParks,
} from "@/lib/cache";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const VIEWPORT_DEBOUNCE_MS = 100;

export type MapLightPreset = "dawn" | "day" | "dusk" | "night";
export type MapTheme = "default" | "faded" | "monochrome";

type ParksMapProps = {
  parks: ParkSummary[];
  selectedPark: ParkSummary | null;
  lightPreset: MapLightPreset;
  theme: MapTheme;
  onViewportParksChange: (parks: ParkSummary[]) => void;
  onViewportLoadingChange?: (isLoading: boolean) => void;
};

type ParksChangesResponse = {
  version: string | null;
  updated: ParkSummary[];
  deleted: number[];
};

type PopupRenderOptions = {
  park?: Pick<ParkSummary, "id" | "name" | "address" | "photoUrl"> | ParkDetail;
  loading?: boolean;
  error?: string;
  expanded?: boolean;
};

export function getInitialLightPreset(): MapLightPreset {
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

async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string
) {
  try {
    const payload = (await response.json()) as { error?: string };

    if (payload.error) {
      return payload.error;
    }
  } catch {}

  return fallbackMessage;
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
      <div style="width:100%;">
        <h3 style="font-size:16px;font-weight:600;margin:0 0 8px 0;">
           "Loading park"
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
      <div style="width:100%;">
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
   <div style="width:100%;">
   ${
     park?.photoUrl
       ? `
        <img
  src="${escapeHtml(park.photoUrl)}"
  alt="${escapeHtml(`${park.name} photo`)}"
  style="
    display:block;
    width:100%;
    height:150px;
    object-fit:cover;
    object-position:center;
    border-radius:10px;
    margin-bottom:12px;
  "
/>
      `
       : ""
   }

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
        park
          ? `
            <a
              href="/parks/${park.id}/edit"
              style="
                display:inline-block;
                background:#f3f4f6;
                color:#111827;
                border:none;
                border-radius:6px;
                padding:6px 10px;
                cursor:pointer;
                font-size:12px;
                margin-top:10px;
                margin-left:6px;
                text-decoration:none;
              "
            >
              Suggest Edit
            </a>
          `
          : ""
      }

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
  lightPreset,
  theme,
  onViewportParksChange,
  onViewportLoadingChange,
}: ParksMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const popupParkIdRef = useRef<number | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const parksRef = useRef(parks);
  const userLocationRef = useRef<[number, number] | null>(null);
  const viewportCacheRef = useRef(new Map<string, ParkSummary[]>());
  const detailCacheRef = useRef(new Map<number, ParkDetail>());
  const detailRequestCacheRef = useRef(new Map<number, Promise<ParkDetail>>());
  const lastViewportKeyRef = useRef<string | null>(null);
  const viewportRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const viewportDebounceRef = useRef<number | null>(null);
  const mapLoadedRef = useRef(false);
  const onViewportParksChangeRef = useRef(onViewportParksChange);
  const [showLocationDialog, setShowLocationDialog] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return !localStorage.getItem("location-allowed");
  });
  const [isMapInitializing, setIsMapInitializing] = useState(true);
  const [, setIsViewportLoading] = useState(true);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [activeRoute, setActiveRoute] = useState<{
    parkId: number;
    name: string;
  } | null>(null);
  const [showLoadingDialog, setShowLoadingDialog] = useState(() => {
    if (typeof window === "undefined") return false;

    return localStorage.getItem("parks-initial-load-complete") !== "true";
  });
  const progressIntervalRef = useRef<number | null>(null);

  function startSmoothProgress() {
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = window.setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) return prev;

        return prev + (95 - prev) * 0.08;
      });
    }, 100);
  }

  function stopSmoothProgress() {
    if (!progressIntervalRef.current) {
      return;
    }

    window.clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }

  const [loadingProgress, setLoadingProgress] = useState(0);
  // const [setMapReady] = useState(false);

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
    lightPreset === "day" || lightPreset === "dawn" ? "#2563eb" : "#ef4444";

  function clearRoute() {
    const map = mapRef.current;

    if (!map) return;

    if (map.getLayer("route")) {
      map.removeLayer("route");
    }

    if (map.getSource("route")) {
      map.removeSource("route");
    }

    localStorage.removeItem("active-route");
    setActiveRoute(null);
  }

  function restoreRoute(routeData: { geometry: GeoJSON.LineString }) {
    const map = mapRef.current;

    if (!map) return;

    if (map.getSource("route")) {
      (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: routeData.geometry,
      });

      return;
    }

    map.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: routeData.geometry,
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

  function setViewportLoading(nextValue: boolean) {
    setIsViewportLoading(nextValue);
    onViewportLoadingChange?.(nextValue);
  }

  function updateViewportParks(nextParks: ParkSummary[]) {
    onViewportParksChangeRef.current(nextParks);
  }

  function hasCurrentSummaryPhoto(
    parkDetail: ParkDetail,
    parkPreview?: ParkSummary
  ) {
    return (
      !parkPreview?.photoUrl || parkDetail.photoUrl === parkPreview.photoUrl
    );
  }

  async function fetchParkDetail(parkId: number, parkPreview?: ParkSummary) {
    const memoryCache = detailCacheRef.current.get(parkId);

    if (
      memoryCache &&
      (!parkPreview || memoryCache.updatedAt === parkPreview.updatedAt) &&
      hasCurrentSummaryPhoto(memoryCache, parkPreview)
    ) {
      return memoryCache;
    }

    const indexedDbPark = await loadParkDetail(parkId);

    if (
      indexedDbPark &&
      (!parkPreview || indexedDbPark.updatedAt === parkPreview.updatedAt) &&
      hasCurrentSummaryPhoto(indexedDbPark, parkPreview)
    ) {
      detailCacheRef.current.set(parkId, indexedDbPark);

      return indexedDbPark;
    }

    const inFlightRequest = detailRequestCacheRef.current.get(parkId);

    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = fetch(`/api/parks/${parkId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(
              response,
              "Failed to load park details."
            )
          );
        }

        const park = (await response.json()) as ParkDetail;

        return park;
      })
      .then(async (park) => {
        detailCacheRef.current.set(park.id, park);

        try {
          await saveParkDetail(park);
        } catch (error) {
          console.error(error);
        }

        return park;
      })
      .finally(() => {
        detailRequestCacheRef.current.delete(parkId);
      });
    detailRequestCacheRef.current.set(parkId, request);

    return request;
  }

  async function checkForParkUpdates() {
    try {
      const cached = await loadParks();

      if (!cached?.version) {
        viewportCacheRef.current.clear();
        lastViewportKeyRef.current = null;

        await requestViewportParksRef.current({ force: true });
        return;
      }

      const response = await fetch("/api/parks/version");
      if (!response.ok) {
        throw new Error(
          await getResponseErrorMessage(
            response,
            "Unable to refresh park updates right now."
          )
        );
      }

      const { version } = await response.json();

      if (version !== cached.version) {
        const response = await fetch(
          `/api/parks/changes?since=${encodeURIComponent(cached.version)}`
        );
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(
              response,
              "Unable to refresh park updates right now."
            )
          );
        }

        const changes: ParksChangesResponse = await response.json();

        const merged = await mergeParks(
          changes.updated,
          changes.deleted,
          changes.version
        );

	        if (!merged) {
	          return;
	        }

	        changes.deleted.forEach((parkId) => {
	          detailCacheRef.current.delete(parkId);
	          detailRequestCacheRef.current.delete(parkId);
	        });
	        await deleteParkDetails(changes.deleted).catch((error) => {
	          console.error(error);
	        });

	        if (
	          popupParkIdRef.current !== null &&
	          changes.deleted.includes(popupParkIdRef.current)
	        ) {
	          popupRef.current?.remove();
	          popupRef.current = null;
	          popupParkIdRef.current = null;
	        }
	
	        parksRef.current = merged;

        viewportCacheRef.current.set("ALL_PARKS", merged);

        updateViewportParks(merged);

        const source = mapRef.current?.getSource("parks") as
          | mapboxgl.GeoJSONSource
          | undefined;

        source?.setData(buildGeoJson(merged));
      }
    } catch (error) {
      console.error(error);
    }
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

      localStorage.setItem(
        "active-route",
        JSON.stringify({
          parkId: park.id,
          name: park.name,
          lat: park.lat,
          lon: park.lon,
          geometry: route,
        })
      );

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
      button.textContent = "Route ready";

      setActiveRoute({
        parkId: park.id,
        name: park.name,
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
      const park = await fetchParkDetail(parkId, parkPreview);
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
        popupParkIdRef.current = null;
      }
    });

    popupRef.current = popup;
    popupParkIdRef.current = parkId;
    setPopupMarkup(popup, map, parkId, parkPreview, {
      park: parkPreview,
    });
    void loadPopupDetails(popup, map, parkId, parkPreview);
  }
  const openParkPopupRef = useRef(openParkPopup);

  async function requestViewportParks({
    force = false,
  }: { force?: boolean } = {}) {
    if (!force && viewportCacheRef.current.has("ALL_PARKS")) {
      const parks = viewportCacheRef.current.get("ALL_PARKS")!;

      parksRef.current = parks;
      updateViewportParks(parks);

      return;
    }

    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      return;
    }

    const key = "ALL_PARKS";

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
      updateViewportParks(cachedParks);
      setViewportLoading(false);
      return;
    }

    if (viewportRequestRef.current?.key === key) {
      return viewportRequestRef.current.promise;
    }

    viewportRequestRef.current?.controller.abort();

    const controller = new AbortController();
    setViewportLoading(true);
    setViewportError(null);
    setLoadingProgress(60);
    startSmoothProgress();
    const promise = fetch("/api/parks", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, "Failed to load parks.")
          );
        }

        return (await response.json()) as ParkSummary[];
      })
      .then(async (nextParks) => {
        try {
          const versionResponse = await fetch("/api/parks/version");
          if (!versionResponse.ok) {
            throw new Error(
              await getResponseErrorMessage(
                versionResponse,
                "Unable to update cached park data."
              )
            );
          }

          const { version } = await versionResponse.json();
          await saveParks(nextParks, version);
        } catch (error) {
          console.error(error);
        }

        const geojson = buildGeoJson(nextParks);

        const source = mapRef.current?.getSource("parks") as
          | mapboxgl.GeoJSONSource
          | undefined;

        if (source) {
          source.setData(geojson);
        }

        setTimeout(() => {
          const features = map.queryRenderedFeatures({
            layers: ["unclustered-point"],
          });

          features.slice(0, 20).forEach((feature) => {
            const parkId = Number(feature.properties?.id);

            if (
              !detailCacheRef.current.has(parkId) &&
              !detailRequestCacheRef.current.has(parkId)
            ) {
              void fetchParkDetail(parkId);
            }
          });
        }, 500);

        viewportCacheRef.current.set(key, nextParks);
        lastViewportKeyRef.current = key;
        parksRef.current = nextParks;
        updateViewportParks(nextParks);
        setLoadingProgress(100);
        setLoadingComplete(true);
        stopSmoothProgress();

        if (showLoadingDialog) {
          localStorage.setItem("parks-initial-load-complete", "true");
        }
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") {
          return;
        }

        setViewportError("Unable to load parks for this area.");

        setShowLoadingDialog(false);
        setIsMapInitializing(false);
      })
      .finally(() => {
        if (viewportRequestRef.current?.key === key) {
          viewportRequestRef.current = null;
        }

        stopSmoothProgress();
        setViewportLoading(false);
      });

    viewportRequestRef.current = {
      key,
      controller,
      promise,
    };

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
  const checkForParkUpdatesRef = useRef(checkForParkUpdates);
  const fetchParkDetailRef = useRef(fetchParkDetail);
  useEffect(() => {
    onViewportParksChangeRef.current = onViewportParksChange;
    openParkPopupRef.current = openParkPopup;
    requestViewportParksRef.current = requestViewportParks;
    scheduleViewportLoadRef.current = scheduleViewportLoad;
    checkForParkUpdatesRef.current = checkForParkUpdates;
    fetchParkDetailRef.current = fetchParkDetail;
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
    const savedRoute = localStorage.getItem("active-route");

    if (!savedRoute) return;

    try {
      const route = JSON.parse(savedRoute);

      setTimeout(() => {
        setActiveRoute({
          parkId: route.parkId,
          name: route.name,
        });
      }, 0);
    } catch {}
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const initialLightPreset = getInitialLightPreset();
    const initialMarkerColor =
      initialLightPreset === "day" || initialLightPreset === "dawn"
        ? "#2563eb"
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

    const handleMapLoad = async () => {
      mapLoadedRef.current = true;
      setLoadingProgress(25);
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

      const savedRoute = localStorage.getItem("active-route");

      if (savedRoute) {
        try {
          const routeData = JSON.parse(savedRoute);

          if (routeData.geometry) {
            restoreRoute(routeData);
          }
        } catch (error) {
          console.error(error);
        }
      }

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
          "circle-radius": 10,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-emissive-strength": 1,
        },
      });
      setLoadingProgress(50);

      map.on("click", "clusters", (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["clusters"],
        });

        const feature = features[0];

        if (!feature) {
          return;
        }

        const clusterId = feature.properties?.cluster_id;
        const pointCount = feature.properties?.point_count;

        if (!clusterId) {
          return;
        }

        const source = map.getSource("parks") as mapboxgl.GeoJSONSource;

        // Prefetch small clusters
        if (pointCount <= 10) {
          source.getClusterLeaves(clusterId, pointCount, 0, (error, leaves) => {
            if (error || !leaves) {
              return;
            }

            leaves.forEach((leaf) => {
              const parkId = Number(leaf.properties?.id);

              if (
                !detailCacheRef.current.has(parkId) &&
                !detailRequestCacheRef.current.has(parkId)
              ) {
                void fetchParkDetailRef.current(parkId);
              }
            });
          });
        }

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) {
            return;
          }

          const coordinates = (feature.geometry as GeoJSON.Point)
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

      map.on("idle", () => {
        const source = map.getSource("parks") as mapboxgl.GeoJSONSource;

        // Prefetch visible markers
        const markers = map.queryRenderedFeatures({
          layers: ["unclustered-point"],
        });

        markers.slice(0, 5).forEach((feature) => {
          const parkId = Number(feature.properties?.id);

          if (
            !detailCacheRef.current.has(parkId) &&
            !detailRequestCacheRef.current.has(parkId)
          ) {
            void fetchParkDetailRef.current(parkId);
          }
        });

        // Prefetch small visible clusters
        const clusters = map.queryRenderedFeatures({
          layers: ["clusters"],
        });

        clusters.forEach((feature) => {
          const clusterId = feature.properties?.cluster_id;
          const pointCount = feature.properties?.point_count;

          if (!clusterId || pointCount > 5) {
            return;
          }

          source.getClusterLeaves(clusterId, pointCount, 0, (error, leaves) => {
            if (error || !leaves) {
              return;
            }

            leaves.forEach((leaf) => {
              const parkId = Number(leaf.properties?.id);

              if (
                !detailCacheRef.current.has(parkId) &&
                !detailRequestCacheRef.current.has(parkId)
              ) {
                void fetchParkDetailRef.current(parkId);
              }
            });
          });
        });
      });

      if (localStorage.getItem("location-allowed") === "true") {
        window.setTimeout(() => {
          geolocateRef.current?.trigger();
        }, 500);
      }
      const cached = await loadParks();
      const source = map.getSource("parks") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (cached) {
        setShowLoadingDialog(false);
        setIsMapInitializing(false);
        parksRef.current = cached.data;
        updateViewportParks(cached.data);

        viewportCacheRef.current.set("ALL_PARKS", cached.data);
        lastViewportKeyRef.current = "ALL_PARKS";

        source?.setData(buildGeoJson(cached.data));
        void checkForParkUpdatesRef.current();
        return;
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
      showUserHeading: true,
    });

    geolocateRef.current = geolocate;

    geolocate.on("geolocate", (event) => {
      const location: [number, number] = [
        event.coords.longitude,
        event.coords.latitude,
      ];

      const hadLocation = Boolean(userLocationRef.current);

      userLocationRef.current = location;

      localStorage.setItem("location-allowed", "true");
      localStorage.setItem("user-location", JSON.stringify(location));

      if (!hadLocation) {
        map.flyTo({
          center: location,
          zoom: 14,
          duration: 1000,
        });
      }
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

      stopSmoothProgress();
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

  const handleContinue = () => {
    setShowLoadingDialog(false);
    setIsMapInitializing(false);
    stopSmoothProgress();

    if (!localStorage.getItem("location-allowed")) {
      setShowLocationDialog(true);
    }
  };

  return (
    <>
      <Dialog
        open={showLocationDialog && !showLoadingDialog}
        onOpenChange={setShowLocationDialog}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enable Location</DialogTitle>
            <DialogDescription className="sr-only">
              Allow access to your location to get walking directions to nearby
              calisthenics parks.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Allow access to your location to get walking directions to nearby
            calisthenics parks.
            <br />
            <br />
            Your location is only used while using the app and can be disabled
            at any time from your browser settings.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={maybeLater}>
              Maybe Later
            </Button>

            <Button onClick={enableLocation}>Allow Location</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showLoadingDialog}>
        <DialogContent
          className="max-w-[calc(100vw-2rem)] sm:max-w-sm"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {loadingComplete ? "Ready!" : "Loading Parks"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {loadingComplete
                ? "Parks have loaded successfully and the map is ready."
                : "Preparing the map and loading nearby parks."}
            </DialogDescription>
          </DialogHeader>

          {!loadingComplete ? (
            <>
              <p className="text-sm text-muted-foreground">
                Preparing map and nearby parks...
              </p>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>

              <p className="text-center text-sm">
                {Math.round(loadingProgress)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Parks loaded successfully.
              </p>

              <Button onClick={handleContinue}>Continue</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {activeRoute && (
        <div className="fixed right-4 bottom-4 left-4 z-50 sm:right-auto sm:bottom-6 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-lg sm:flex-row sm:items-center">
            <span className="text-sm break-words">
              Navigating to {activeRoute.name}
            </span>

            <Button variant="destructive" size="sm" onClick={clearRoute}>
              Cancel Route
            </Button>
          </div>
        </div>
      )}
      <div className="relative">
        <div className="fixed inset-0">
          <div ref={mapContainer} className="h-full w-full" />

          {isMapInitializing && (
            <div className="pointer-events-none absolute inset-0 z-10 bg-black/20" />
          )}
        </div>

        {viewportError ? (
          <div className="fixed right-4 bottom-4 left-4 z-50 rounded-md border border-border bg-popover p-3 shadow-lg sm:right-auto sm:max-w-sm">
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
