"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import mapboxgl from "mapbox-gl";
import { LoaderCircle, LocateFixed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMapUserFocus } from "@/components/parks/useMapUserFocus";
import type {
  ParkClusterPlaceholder,
  ParkDetail,
  ParksMapResponse,
  ParkSummary,
} from "@/types/park";
import {
  clearLegacyGlobalParkCache,
  loadParkArea,
  loadParkDetail,
  saveParkArea,
  saveParkDetail,
} from "@/lib/cache";

const MapLocationSearch = dynamic(
  () =>
    import("@/components/parks/MapLocationSearch").then(
      (module) => module.MapLocationSearch
    ),
  { ssr: false }
);

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

const PARK_AREA_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const PLACEHOLDER_MAX_ZOOM = 8;
const MEANINGFUL_CENTER_SHIFT_RATIO = 0.18;
const MEANINGFUL_ZOOM_DELTA = 0.5;
const LIGHT_MAP_MARKER_COLOR = "#2563eb";
const DARK_MAP_MARKER_COLOR = "#ef4444";

export type MapLightPreset = "dawn" | "day" | "dusk" | "night";
export type MapTheme = "default" | "faded" | "monochrome";

function getParkMarkerColor(lightPreset: MapLightPreset) {
  return lightPreset === "day" || lightPreset === "dawn"
    ? LIGHT_MAP_MARKER_COLOR
    : DARK_MAP_MARKER_COLOR;
}

type ParksMapProps = {
  parks: ParkSummary[];
  selectedPark: ParkSummary | null;
  lightPreset: MapLightPreset;
  theme: MapTheme;
  searchControlVariant?: "authenticated" | "guest";
  onViewportParksChange: (parks: ParkSummary[]) => void;
  onViewportLoadingChange?: (isLoading: boolean) => void;
  onLocationStatusChange?: (status: ParksLocationStatus) => void;
};

export type ParksLocationStatus =
  | "idle"
  | "loading"
  | "success"
  | "denied"
  | "unavailable";

export type ParksMapHandle = {
  requestUserLocation: () => boolean;
};

type PopupRenderOptions = {
  park?: Pick<ParkSummary, "id" | "name" | "address" | "photoUrl"> | ParkDetail;
  loading?: boolean;
  error?: string;
  expanded?: boolean;
};

type SearchFeature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    feature_type?: string;
    bbox?: [number, number, number, number];
  }
>;

function readStoredUserLocation(): [number, number] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedLocation = localStorage.getItem("user-location");
    if (!storedLocation) {
      return null;
    }

    const coordinates = JSON.parse(storedLocation) as unknown;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !coordinates.every((coordinate) => Number.isFinite(coordinate))
    ) {
      return null;
    }

    return [Number(coordinates[0]), Number(coordinates[1])];
  } catch {
    return null;
  }
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

type ViewportArea = {
  areaKey: string;
  center: [number, number];
  east: number;
  latitudeSpan: number;
  longitudeSpan: number;
  north: number;
  params: URLSearchParams;
  south: number;
  west: number;
  zoom: number;
};

function getViewportArea(map: mapboxgl.Map): ViewportArea {
  const bounds = map.getBounds()!;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());
  const rawWest = bounds.getWest();
  const rawEast = bounds.getEast();
  const west = normalizeLongitude(rawWest);
  const east = normalizeLongitude(rawEast);
  const longitudeSpan = Math.min(360, Math.abs(rawEast - rawWest));
  const params = new URLSearchParams({
    west: west.toFixed(6),
    south: south.toFixed(6),
    east: east.toFixed(6),
    north: north.toFixed(6),
    zoom: zoom.toFixed(2),
  });

  return {
    areaKey: [
      Math.floor(zoom),
      west.toFixed(3),
      south.toFixed(3),
      east.toFixed(3),
      north.toFixed(3),
    ].join(":"),
    center: [normalizeLongitude(center.lng), center.lat],
    east,
    latitudeSpan: north - south,
    longitudeSpan,
    north,
    params,
    south,
    west,
    zoom,
  };
}

function viewportContainsCoordinate(
  viewport: ViewportArea,
  longitude: number,
  latitude: number
) {
  const placeholderCellPadding = 1;
  const longitudeDelta = Math.min(
    Math.abs(longitude - viewport.center[0]),
    360 - Math.abs(longitude - viewport.center[0])
  );
  const isWithinLatitude =
    Math.abs(latitude - viewport.center[1]) <=
    viewport.latitudeSpan / 2 + placeholderCellPadding;
  const isWithinLongitude =
    longitudeDelta <=
    viewport.longitudeSpan / 2 + placeholderCellPadding;

  return isWithinLatitude && isWithinLongitude;
}

function hasMeaningfulViewportChange(
  current: ViewportArea,
  searched: ViewportArea
) {
  if (Math.abs(current.zoom - searched.zoom) >= MEANINGFUL_ZOOM_DELTA) {
    return true;
  }

  const latitudeThreshold = Math.max(
    searched.latitudeSpan * MEANINGFUL_CENTER_SHIFT_RATIO,
    0.002
  );
  const longitudeThreshold = Math.max(
    searched.longitudeSpan * MEANINGFUL_CENTER_SHIFT_RATIO,
    0.002
  );
  const longitudeDelta = Math.min(
    Math.abs(current.center[0] - searched.center[0]),
    360 - Math.abs(current.center[0] - searched.center[0])
  );

  return (
    Math.abs(current.center[1] - searched.center[1]) >= latitudeThreshold ||
    longitudeDelta >= longitudeThreshold
  );
}

function buildPlaceholderGeoJson(
  clusters: ParkClusterPlaceholder[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: clusters.map((cluster, index) => ({
      type: "Feature",
      properties: { id: index, count: cluster.count },
      geometry: {
        type: "Point",
        coordinates: [cluster.lon, cluster.lat],
      },
    })),
  };
}

function getSearchResultZoom(featureType: string | undefined) {
  switch (featureType) {
    case "country":
      return 5;
    case "region":
      return 7;
    case "district":
      return 9;
    case "place":
      return 11;
    case "postcode":
    case "locality":
    case "neighborhood":
      return 13;
    case "street":
      return 15;
    case "address":
    case "block":
    case "poi":
      return 16;
    default:
      return 14;
  }
}

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

const ParksMap = forwardRef<ParksMapHandle, ParksMapProps>(function ParksMap(
  {
    parks,
    selectedPark,
    lightPreset,
    theme,
    searchControlVariant = "authenticated",
    onViewportParksChange,
    onViewportLoadingChange,
    onLocationStatusChange,
  },
  ref
) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const popupParkIdRef = useRef<number | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const storedUserLocationRef = useRef<[number, number] | null>(null);
  const parksRef = useRef(parks);
  const userLocationRef = useRef<[number, number] | null>(null);
  const focusOnNextGeolocateRef = useRef(false);
  const recenterInProgressRef = useRef(false);
  const trackingActiveRef = useRef(false);
  const viewportCacheRef = useRef(new Map<string, ParkSummary[]>());
  const areaCacheTimestampRef = useRef(new Map<string, number>());
  const areaTruncatedRef = useRef(new Map<string, boolean>());
  const areaParkIdsRef = useRef(new Map<string, Set<number>>());
  const parkAreaMembershipRef = useRef(new Map<number, Set<string>>());
  const loadedParksRef = useRef(new Map<number, ParkSummary>());
  const placeholderClustersRef = useRef<ParkClusterPlaceholder[]>([]);
  const searchedViewportsRef = useRef<ViewportArea[]>([]);
  const lastSearchedViewportRef = useRef<ViewportArea | null>(null);
  const areaSearchPendingRef = useRef(false);
  const loadAfterLocationMoveRef = useRef(false);
  const areaLoadFallbackRef = useRef<number | null>(null);
  const detailCacheRef = useRef(new Map<number, ParkDetail>());
  const detailRequestCacheRef = useRef(new Map<number, Promise<ParkDetail>>());
  const lastViewportKeyRef = useRef<string | null>(null);
  const viewportRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const mapLoadedRef = useRef(false);
  const onViewportParksChangeRef = useRef(onViewportParksChange);
  const onLocationStatusChangeRef = useRef(onLocationStatusChange);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [isRecentering, setIsRecentering] = useState(false);
  const [searchProximity, setSearchProximity] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [searchClearRequest, setSearchClearRequest] = useState(0);
  const [isMapInitializing, setIsMapInitializing] = useState(true);
  const [isViewportLoading, setIsViewportLoading] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [showSearchThisArea, setShowSearchThisArea] = useState(false);
  const [isAreaTruncated, setIsAreaTruncated] = useState(false);
  const [activeRoute, setActiveRoute] = useState<{
    parkId: number;
    name: string;
  } | null>(null);
  const initialCenterRef = useRef<[number, number]>([
    -73.924958109856, 40.731742625495,
  ]);
  const {
    beginAwayMove,
    beginTrackingMove,
    beginUserMove,
    finishCameraMove,
    isFocused,
    isFocusedRef,
    markManualInteraction,
    setFocused,
    userLocationZoom,
  } = useMapUserFocus({
    initiallyFocused: false,
  });
  const beginAwayFromUser = useCallback(() => {
    geolocateRef.current?.setFollowUserLocation(false);
    areaSearchPendingRef.current = true;
    beginAwayMove();
  }, [beginAwayMove]);
  const markManualCameraInteraction = useCallback(() => {
    areaSearchPendingRef.current = true;
    if (recenterInProgressRef.current) {
      recenterInProgressRef.current = false;
      setIsRecentering(false);
    }
    markManualInteraction();
  }, [markManualInteraction]);

  const markerColor = getParkMarkerColor(lightPreset);

  function clearSearchLocation() {
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
  }

  function queueViewportLoadAfterLocationMove() {
    loadAfterLocationMoveRef.current = true;
    if (areaLoadFallbackRef.current) {
      window.clearTimeout(areaLoadFallbackRef.current);
    }
    areaLoadFallbackRef.current = window.setTimeout(() => {
      const map = mapRef.current;
      if (!loadAfterLocationMoveRef.current || map?.isMoving()) return;

      loadAfterLocationMoveRef.current = false;
      void requestViewportParksRef.current();
    }, 1_200);
  }

  function recenterToUser({ source }: { source: "custom" | "mapbox" }) {
    const map = mapRef.current;
    const location = userLocationRef.current;

    if (!map || !location || recenterInProgressRef.current) {
      return false;
    }

    map.stop();
    clearSearchLocation();
    setSearchClearRequest((current) => current + 1);
    recenterInProgressRef.current = true;
    setIsRecentering(true);
    beginUserMove();
    queueViewportLoadAfterLocationMove();
    map.easeTo({
      center: location,
      zoom: userLocationZoom,
      bearing: 0,
      pitch: 0,
      duration: source === "mapbox" ? 850 : 700,
      essential: true,
    });
    onLocationStatusChangeRef.current?.("success");
    return true;
  }

  function requestUserLocation() {
    const geolocate = geolocateRef.current;

    if (userLocationRef.current) {
      return recenterToUser({ source: "custom" });
    }

    if (!mapRef.current || !geolocate) {
      onLocationStatusChangeRef.current?.("unavailable");
      return false;
    }

    onLocationStatusChangeRef.current?.("loading");
    focusOnNextGeolocateRef.current = true;
    const triggered = geolocate.trigger();

    if (!triggered) {
      onLocationStatusChangeRef.current?.("unavailable");
    }

    return triggered;
  }

  function handleLocationSearchRetrieve(feature: SearchFeature) {
    const map = mapRef.current;
    const coordinates = feature.geometry.coordinates;

    if (
      !map ||
      coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      return;
    }

    const location: [number, number] = [coordinates[0], coordinates[1]];
    const resultZoom = getSearchResultZoom(feature.properties.feature_type);

    popupRef.current?.remove();
    clearSearchLocation();
    beginAwayFromUser();

    searchMarkerRef.current = new mapboxgl.Marker({
      color: "#f59e0b",
      scale: 0.85,
    })
      .setLngLat(location)
      .addTo(map);

    if (feature.properties.bbox) {
      map.fitBounds(feature.properties.bbox, {
        padding: 64,
        maxZoom: resultZoom,
        duration: 1000,
        essential: true,
      });
      return;
    }

    map.flyTo({
      center: location,
      zoom: resultZoom,
      bearing: 0,
      pitch: 0,
      duration: 1000,
      essential: true,
    });
  }

  const requestUserLocationLatestRef = useRef(requestUserLocation);
  requestUserLocationLatestRef.current = requestUserLocation;

  useImperativeHandle(
    ref,
    () => ({
      requestUserLocation: () => requestUserLocationLatestRef.current(),
    }),
    []
  );

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

  async function drawRoute(
    map: mapboxgl.Map,
    park: ParkDetail,
    button: HTMLButtonElement
  ) {
    button.textContent = "Loading...";
    button.disabled = true;

    try {
      if (!userLocationRef.current) {
        requestUserLocation();
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

  function updatePlaceholderSource() {
    const source = mapRef.current?.getSource(
      "park-placeholders"
    ) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const visibleClusters = placeholderClustersRef.current.filter(
      (cluster) =>
        !searchedViewportsRef.current.some((viewport) =>
          viewportContainsCoordinate(viewport, cluster.lon, cluster.lat)
        )
    );
    source.setData(buildPlaceholderGeoJson(visibleClusters));
  }

  function recordSearchedViewport(viewport: ViewportArea) {
    if (
      !searchedViewportsRef.current.some(
        (searchedViewport) => searchedViewport.areaKey === viewport.areaKey
      )
    ) {
      searchedViewportsRef.current.push(viewport);
    }
    updatePlaceholderSource();
  }

  function applyAreaParks(
    areaKey: string,
    areaParks: ParkSummary[],
    viewport: ViewportArea
  ) {
    const nextIds = new Set(areaParks.map((park) => park.id));
    const previousIds = areaParkIdsRef.current.get(areaKey) ?? new Set<number>();

    previousIds.forEach((parkId) => {
      if (nextIds.has(parkId)) return;

      const memberships = parkAreaMembershipRef.current.get(parkId);
      memberships?.delete(areaKey);
      if (!memberships?.size) {
        parkAreaMembershipRef.current.delete(parkId);
        loadedParksRef.current.delete(parkId);
      }
    });

    areaParks.forEach((park) => {
      loadedParksRef.current.set(park.id, park);
      const memberships =
        parkAreaMembershipRef.current.get(park.id) ?? new Set<string>();
      memberships.add(areaKey);
      parkAreaMembershipRef.current.set(park.id, memberships);
    });
    areaParkIdsRef.current.set(areaKey, nextIds);

    const mergedParks = [...loadedParksRef.current.values()];
    recordSearchedViewport(viewport);
    parksRef.current = mergedParks;
    updateViewportParks(mergedParks);

    const source = mapRef.current?.getSource("parks") as
      | mapboxgl.GeoJSONSource
      | undefined;
    source?.setData(buildGeoJson(mergedParks));
  }

  async function requestViewportParks({
    force = false,
    cacheOnly = false,
  }: { force?: boolean; cacheOnly?: boolean } = {}) {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      return;
    }

    const viewport = getViewportArea(map);
    const key = viewport.areaKey;

    if (viewport.zoom < PLACEHOLDER_MAX_ZOOM) {
      lastSearchedViewportRef.current = null;
      setShowSearchThisArea(false);
      setIsAreaTruncated(false);
      return;
    }

    if (!force && key === lastViewportKeyRef.current) {
      setShowSearchThisArea(false);
      return;
    }

    const cachedParks = viewportCacheRef.current.get(key);
    const cachedTimestamp = areaCacheTimestampRef.current.get(key) ?? 0;
    if (
      !force &&
      cachedParks &&
      Date.now() - cachedTimestamp < PARK_AREA_CACHE_MAX_AGE_MS
    ) {
      lastViewportKeyRef.current = key;
      lastSearchedViewportRef.current = viewport;
      setViewportError(null);
      setIsAreaTruncated(areaTruncatedRef.current.get(key) ?? false);
      setShowSearchThisArea(false);
      applyAreaParks(key, cachedParks, viewport);
      return;
    }

    if (!force) {
      try {
        const cachedArea = await loadParkArea(key);
        if (cachedArea) {
          viewportCacheRef.current.set(key, cachedArea.data);
          areaCacheTimestampRef.current.set(key, cachedArea.timestamp);
          areaTruncatedRef.current.set(key, cachedArea.truncated);
          lastViewportKeyRef.current = key;
          lastSearchedViewportRef.current = viewport;
          setIsAreaTruncated(cachedArea.truncated);
          setViewportError(null);
          setShowSearchThisArea(false);
          applyAreaParks(key, cachedArea.data, viewport);

          if (
            cacheOnly ||
            Date.now() - cachedArea.timestamp < PARK_AREA_CACHE_MAX_AGE_MS
          ) {
            return;
          }
        } else if (cacheOnly) {
          return;
        }
      } catch (error) {
        console.error("Unable to read the cached park area.", error);
        if (cacheOnly) return;
      }
    }

    if (viewportRequestRef.current?.key === key) {
      return viewportRequestRef.current.promise;
    }

    viewportRequestRef.current?.controller.abort();

    const controller = new AbortController();
    setViewportLoading(true);
    setViewportError(null);
    const promise = fetch(`/api/parks/map?${viewport.params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, "Failed to load parks.")
          );
        }

        return (await response.json()) as ParksMapResponse;
      })
      .then(async (result) => {
        const nextParks = result.parks;
        try {
          await saveParkArea(
            result.areaKey,
            nextParks,
            result.version,
            result.truncated
          );
        } catch (error) {
          console.error("Unable to cache the park area.", error);
        }

        viewportCacheRef.current.set(result.areaKey, nextParks);
        areaCacheTimestampRef.current.set(result.areaKey, Date.now());
        areaTruncatedRef.current.set(result.areaKey, result.truncated);
        lastViewportKeyRef.current = result.areaKey;
        lastSearchedViewportRef.current = viewport;
        setIsAreaTruncated(result.truncated);
        setShowSearchThisArea(false);
        applyAreaParks(result.areaKey, nextParks, viewport);

        window.setTimeout(() => {
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

    return promise;
  }

  const requestViewportParksRef = useRef(requestViewportParks);
  const fetchParkDetailRef = useRef(fetchParkDetail);
  useEffect(() => {
    onViewportParksChangeRef.current = onViewportParksChange;
    onLocationStatusChangeRef.current = onLocationStatusChange;
    openParkPopupRef.current = openParkPopup;
    requestViewportParksRef.current = requestViewportParks;
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

    const storedLocation = readStoredUserLocation();
    storedUserLocationRef.current = storedLocation;
    userLocationRef.current = storedLocation;

    if (storedLocation) {
      initialCenterRef.current = storedLocation;
    }

    const hydrationFrame = window.requestAnimationFrame(() => {
      setHasHydrated(true);
      setHasUserLocation(Boolean(storedLocation));
      setSearchProximity(
        storedLocation
          ? { lng: storedLocation[0], lat: storedLocation[1] }
          : null
      );
      setFocused(Boolean(storedLocation));
    });

    const initialLightPreset = getInitialLightPreset();
    const initialMarkerColor = getParkMarkerColor(initialLightPreset);

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
      zoom: storedUserLocationRef.current ? userLocationZoom : 2,
      pitch: 0,
      bearing: storedUserLocationRef.current ? 0 : -20,
      attributionControl: false,
    });

    mapRef.current = map;

    const handleManualCameraStart = (event: unknown) => {
      if ((event as { originalEvent?: Event }).originalEvent) {
        markManualCameraInteraction();
      }
    };
    const handleCameraMoveEnd = () => {
      const center = map.getCenter();

      const focusResult = finishCameraMove({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        userLocation: userLocationRef.current,
      });

      if (recenterInProgressRef.current && focusResult !== null) {
        recenterInProgressRef.current = false;
        setIsRecentering(false);
      }

      if (!userLocationRef.current) {
        setSearchProximity({ lng: center.lng, lat: center.lat });
      }

      if (loadAfterLocationMoveRef.current) {
        loadAfterLocationMoveRef.current = false;
        if (areaLoadFallbackRef.current) {
          window.clearTimeout(areaLoadFallbackRef.current);
          areaLoadFallbackRef.current = null;
        }
        void requestViewportParksRef.current();
        return;
      }

      if (areaSearchPendingRef.current) {
        areaSearchPendingRef.current = false;
        const currentViewport = getViewportArea(map);
        const lastSearchedViewport = lastSearchedViewportRef.current;
        setShowSearchThisArea(
          currentViewport.zoom >= PLACEHOLDER_MAX_ZOOM &&
            (!lastSearchedViewport ||
              hasMeaningfulViewportChange(
                currentViewport,
                lastSearchedViewport
              ))
        );
      }
    };

    map.on("dragstart", markManualCameraInteraction);
    map.on("zoomstart", handleManualCameraStart);
    map.on("rotatestart", handleManualCameraStart);
    map.on("pitchstart", handleManualCameraStart);
    map.on("moveend", handleCameraMoveEnd);

    const handleMapLoad = async () => {
      mapLoadedRef.current = true;
      if (!storedUserLocationRef.current) {
        const center = map.getCenter();
        setSearchProximity({ lng: center.lng, lat: center.lat });
      }
      map.addSource("parks", {
        type: "geojson",
        data: buildGeoJson([]),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 80,
      });

      map.addSource("park-placeholders", {
        type: "geojson",
        data: buildPlaceholderGeoJson([]),
        cluster: true,
        clusterRadius: 100,
        clusterMaxZoom: PLACEHOLDER_MAX_ZOOM,
        clusterProperties: {
          park_count: ["+", ["get", "count"]],
        },
      });

      map.addLayer({
        id: "park-placeholder-circles",
        type: "circle",
        source: "park-placeholders",
        maxzoom: PLACEHOLDER_MAX_ZOOM,
        paint: {
          "circle-color": initialMarkerColor,
          "circle-opacity": 1,
          "circle-radius": [
            "step",
            ["coalesce", ["get", "park_count"], ["get", "count"]],
            12,
            50,
            17,
            500,
            21,
            5000,
            26,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-emissive-strength": 1,
        },
      });

      map.addLayer({
        id: "park-placeholder-counts",
        type: "symbol",
        source: "park-placeholders",
        maxzoom: PLACEHOLDER_MAX_ZOOM,
        layout: {
          "text-field": [
            "to-string",
            ["coalesce", ["get", "park_count"], ["get", "count"]],
          ],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
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
        minzoom: 12,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": initialMarkerColor,
          "circle-radius": 10,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-emissive-strength": 1,
        },
      });
      void fetch("/api/parks/map/clusters")
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load park overview.");
          return (await response.json()) as ParkClusterPlaceholder[];
        })
        .then((clusters) => {
          placeholderClustersRef.current = clusters;
          updatePlaceholderSource();
        })
        .catch((error) => console.error(error));

      map.on("click", "park-placeholder-circles", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const coordinates = (feature.geometry as GeoJSON.Point)
          .coordinates as [number, number];
        const clusterId = feature.properties?.cluster_id;
        beginAwayFromUser();

        if (clusterId !== undefined) {
          const source = map.getSource(
            "park-placeholders"
          ) as mapboxgl.GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error) return;

            map.easeTo({
              center: coordinates,
              zoom: zoom ?? PLACEHOLDER_MAX_ZOOM,
              duration: 900,
              essential: true,
            });
          });
          return;
        }

        map.easeTo({
          center: coordinates,
          zoom: PLACEHOLDER_MAX_ZOOM,
          duration: 900,
          essential: true,
        });
      });

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

        if (clusterId === undefined) {
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

          beginAwayFromUser();
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
          focusOnNextGeolocateRef.current = true;
          geolocateRef.current?.trigger();
        }, 500);
      }
      void clearLegacyGlobalParkCache().catch((error) => {
        console.error("Unable to remove the legacy global park cache.", error);
      });
      await requestViewportParksRef.current({ cacheOnly: true });
      setIsMapInitializing(false);
    };

    map.on("load", handleMapLoad);
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    const navigationButtons = Array.from(
      mapContainer.current?.querySelectorAll(
        ".mapboxgl-ctrl-zoom-in, .mapboxgl-ctrl-zoom-out, .mapboxgl-ctrl-compass"
      ) ?? []
    );
    navigationButtons.forEach((control) => {
      control.addEventListener("pointerdown", markManualCameraInteraction);
    });

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      fitBoundsOptions: {
        maxZoom: userLocationZoom,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showUserLocation: true,
    });

    geolocateRef.current = geolocate;

    geolocate.on("trackuserlocationstart", () => {
      trackingActiveRef.current = true;
      beginTrackingMove();
      setFocused(true);
      queueViewportLoadAfterLocationMove();
    });

    geolocate.on("trackuserlocationend", () => {
      trackingActiveRef.current = false;
    });

    geolocate.on("geolocate", (event) => {
      const location: [number, number] = [
        event.coords.longitude,
        event.coords.latitude,
      ];

      const shouldFocusUser =
        focusOnNextGeolocateRef.current || !userLocationRef.current;

      userLocationRef.current = location;
      setHasUserLocation(true);
      setSearchProximity({ lng: location[0], lat: location[1] });

      localStorage.setItem("location-allowed", "true");
      localStorage.setItem("user-location", JSON.stringify(location));
      onLocationStatusChangeRef.current?.("success");

      if (shouldFocusUser) {
        focusOnNextGeolocateRef.current = false;
        beginTrackingMove();
        setFocused(true);
        queueViewportLoadAfterLocationMove();
      } else if (trackingActiveRef.current) {
        beginTrackingMove();
        setFocused(true);
      } else if (isFocusedRef.current) {
        setFocused(true);
      }
    });

    geolocate.on("error", (error) => {
      focusOnNextGeolocateRef.current = false;
      localStorage.removeItem("location-allowed");
      localStorage.removeItem("user-location");
      trackingActiveRef.current = false;
      setHasUserLocation(false);
      if (recenterInProgressRef.current) {
        recenterInProgressRef.current = false;
        setIsRecentering(false);
      }
      setFocused(false);
      onLocationStatusChangeRef.current?.(
        error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"
      );
    });

    map.addControl(geolocate, "top-right");
    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      resizeObserver.disconnect();
      navigationButtons.forEach((control) => {
        control.removeEventListener("pointerdown", markManualCameraInteraction);
      });

      if (areaLoadFallbackRef.current) {
        window.clearTimeout(areaLoadFallbackRef.current);
      }

      viewportRequestRef.current?.controller.abort();
      popupRef.current?.remove();
      searchMarkerRef.current?.remove();
      map.remove();
      geolocateRef.current = null;
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [
    beginAwayFromUser,
    beginTrackingMove,
    beginUserMove,
    finishCameraMove,
    isFocusedRef,
    markManualCameraInteraction,
    setFocused,
    userLocationZoom,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapLoadedRef.current) {
      return;
    }

    map.setConfigProperty("basemap", "lightPreset", lightPreset);
    map.setConfigProperty("basemap", "theme", theme);
    map.setPaintProperty("clusters", "circle-color", markerColor);
    map.setPaintProperty("unclustered-point", "circle-color", markerColor);
    map.setPaintProperty(
      "park-placeholder-circles",
      "circle-color",
      markerColor
    );

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

    beginAwayFromUser();
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
  }, [beginAwayFromUser, selectedPark]);

  const shouldShowRecenter =
    hasHydrated && hasUserLocation && !isFocused;

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden"
      data-parks-map
    >
      {activeRoute && (
        <div className="absolute right-4 bottom-4 left-4 z-30 sm:right-auto sm:bottom-6 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
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
      <div className="absolute inset-0">
        <div className="absolute inset-0">
          <div ref={mapContainer} className="h-full w-full" />

          {isMapInitializing && (
            <div className="pointer-events-none absolute inset-0 z-10 bg-black/20" />
          )}
        </div>

        {viewportError ? (
          <div
            className="absolute right-4 bottom-4 left-4 z-30 rounded-md border border-border bg-popover p-3 shadow-lg sm:right-auto sm:max-w-sm"
          >
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

      <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+7.25rem)] left-1/2 z-30 -translate-x-1/2 sm:top-[calc(env(safe-area-inset-top)+4.5rem)]">
        <Button
          type="button"
          variant="secondary"
          className={`pointer-events-auto h-10 gap-2 rounded-full border border-border px-4 shadow-md transition-[opacity,transform,visibility] duration-200 ${
            showSearchThisArea || isViewportLoading
              ? "visible translate-y-0 opacity-100"
              : "invisible -translate-y-1 opacity-0 pointer-events-none"
          }`}
          aria-hidden={!(showSearchThisArea || isViewportLoading) || undefined}
          tabIndex={showSearchThisArea || isViewportLoading ? 0 : -1}
          disabled={isViewportLoading}
          onClick={() => void requestViewportParksRef.current()}
        >
          {isViewportLoading ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {isViewportLoading ? "Searching…" : "Search this area"}
        </Button>
        {isAreaTruncated && !isViewportLoading ? (
          <p className="mt-2 rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">
            Zoom in to see more parks
          </p>
        ) : null}
      </div>

      <div
        className={`absolute top-[calc(env(safe-area-inset-top)+4rem)] left-4 z-40 flex w-[9.5rem] items-start gap-2 transition-opacity duration-200 sm:top-[calc(env(safe-area-inset-top)+1rem)] ${
          searchControlVariant === "guest"
            ? "sm:left-[15.75rem]"
            : "sm:left-[13.5rem]"
        } ${isMapInitializing ? "pointer-events-none opacity-0" : "opacity-100"}`}
        aria-hidden={isMapInitializing || undefined}
        inert={isMapInitializing || undefined}
      >
        <MapLocationSearch
          accessToken={MAPBOX_ACCESS_TOKEN}
          clearRequest={searchClearRequest}
          proximity={searchProximity}
          onClear={clearSearchLocation}
          onRetrieve={handleLocationSearchRetrieve}
        />
        <Button
          type="button"
          variant="outline"
          size="default"
          className={`h-10 w-[6.5rem] shrink-0 gap-2 rounded-full bg-card px-3 shadow-md transition-[opacity,transform,visibility] duration-200 ease-out ${
            shouldShowRecenter
              ? "visible pointer-events-auto scale-100 opacity-100"
              : "invisible pointer-events-none scale-90 opacity-0"
          }`}
          aria-label="Recenter on my location"
          title="Recenter on my location"
          aria-hidden={!shouldShowRecenter || undefined}
          tabIndex={shouldShowRecenter ? 0 : -1}
          disabled={!hasHydrated || isRecentering || !hasUserLocation}
          onClick={() => recenterToUser({ source: "custom" })}
        >
          <LocateFixed aria-hidden="true" />
          Recenter
        </Button>
      </div>
    </div>
  );
});

export default ParksMap;
