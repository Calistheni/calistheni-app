"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type CoordinatePickerProps = {
  lat: string;
  lon: string;
  onChange: (lat: number, lon: number) => void;
};

export function CoordinatePicker({
  lat,
  lon,
  onChange,
}: CoordinatePickerProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialCoordinatesRef = useRef({ lat, lon });
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const handleCoordinateChange = useEffectEvent(
    (nextLat: number, nextLon: number) => {
      onChange(nextLat, nextLon);
    }
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }
    const initialLng = initialCoordinatesRef.current.lon
      ? Number(initialCoordinatesRef.current.lon)
      : 23.3219;
    const initialLat = initialCoordinatesRef.current.lat
      ? Number(initialCoordinatesRef.current.lat)
      : 42.6977;

    let map: mapboxgl.Map;

    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: [initialLng, initialLat],
        zoom: 12,
      });
    } catch {
      // A native lifecycle or Mapbox initialization failure must not take down
      // the submission route. The form's manual coordinate fields remain the
      // fully supported fallback.
      const failureTimeout = window.setTimeout(() => setMapUnavailable(true), 0);
      return () => window.clearTimeout(failureTimeout);
    }
    map.on("load", () => {
      map.resize();
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });
    map.addControl(geolocate, "top-right");

    geolocate.on("geolocate", (event) => {
      const latitude = event.coords.latitude;
      const longitude = event.coords.longitude;

      markerRef.current?.setLngLat([longitude, latitude]);

      handleCoordinateChange(latitude, longitude);
    });

    markerRef.current = new mapboxgl.Marker({ draggable: true })
      .setLngLat([initialLng, initialLat])
      .addTo(map);

    markerRef.current.on("dragend", () => {
      const position = markerRef.current?.getLngLat();

      if (position) {
        handleCoordinateChange(position.lat, position.lng);
      }
    });

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;

      markerRef.current?.setLngLat([lng, lat]);

      handleCoordinateChange(lat, lng);
    });

    return () => {
      map.remove();

      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) {
      return;
    }

    if (!lat || !lon) {
      return;
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return;
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return;
    }

    markerRef.current.setLngLat([longitude, latitude]);

    mapRef.current.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 500,
    });
  }, [lat, lon]);

  if (mapUnavailable) {
    return (
      <div
        role="status"
        className="flex h-[320px] w-full items-center justify-center rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground sm:h-[420px] lg:h-[600px]"
      >
        The map is unavailable right now. Enter coordinates manually below to
        continue your submission.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-label="Coordinate picker map"
      className="h-[320px] w-full overflow-hidden rounded-lg border sm:h-[420px] lg:h-[600px]"
    />
  );
}
