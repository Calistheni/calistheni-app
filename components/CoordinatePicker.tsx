"use client";

import { useEffect, useEffectEvent, useRef } from "react";
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

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [initialLng, initialLat],
      zoom: 12,
    });
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

    markerRef.current = new mapboxgl.Marker()
      .setLngLat([initialLng, initialLat])
      .addTo(map);

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
