"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const initialLng = lon ? Number(lon) : 23.3219;
    const initialLat = lat ? Number(lat) : 42.6977;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [initialLng, initialLat],
      zoom: 12,
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

      onChange(latitude, longitude);
    });

    markerRef.current = new mapboxgl.Marker()
      .setLngLat([initialLng, initialLat])
      .addTo(map);

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;

      markerRef.current?.setLngLat([lng, lat]);

      onChange(lat, lng);
    });

    return () => {
      map.remove();
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

    markerRef.current.setLngLat([longitude, latitude]);

    mapRef.current.flyTo({
      center: [longitude, latitude],
      duration: 500,
    });
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      className="h-150 w-full overflow-hidden rounded-lg border"
    />
  );
}
