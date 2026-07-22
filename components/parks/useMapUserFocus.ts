"use client";

import { useCallback, useRef, useState } from "react";

type Coordinates = [number, number];
type ProgrammaticCameraMove = "user" | "tracking" | "away" | null;

const USER_LOCATION_ZOOM = 14;
const USER_FOCUS_DISTANCE_METERS = 120;

function distanceInMeters(from: Coordinates, to: Coordinates) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLatitude = toRadians(to[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function useMapUserFocus({
  initiallyFocused,
}: {
  initiallyFocused: boolean;
}) {
  const [isFocused, setIsFocused] = useState(initiallyFocused);
  const isFocusedRef = useRef(initiallyFocused);
  const programmaticMoveRef = useRef<ProgrammaticCameraMove>(null);

  const setFocused = useCallback((focused: boolean) => {
    if (isFocusedRef.current === focused) {
      return;
    }

    isFocusedRef.current = focused;
    setIsFocused(focused);
  }, []);

  const beginUserMove = useCallback(() => {
    programmaticMoveRef.current = "user";
  }, []);

  const beginTrackingMove = useCallback(() => {
    programmaticMoveRef.current = "tracking";
  }, []);

  const beginAwayMove = useCallback(() => {
    programmaticMoveRef.current = "away";
    setFocused(false);
  }, [setFocused]);

  const markManualInteraction = useCallback(() => {
    programmaticMoveRef.current = null;
    setFocused(false);
  }, [setFocused]);

  const finishCameraMove = useCallback(
    ({
      center,
      zoom,
      userLocation,
    }: {
      center: Coordinates;
      zoom: number;
      userLocation: Coordinates | null;
    }) => {
      const move = programmaticMoveRef.current;
      programmaticMoveRef.current = null;

      if (move === "away") {
        setFocused(false);
        return false;
      }

      if ((move !== "user" && move !== "tracking") || !userLocation) {
        return null;
      }

      const isNearUser =
        distanceInMeters(center, userLocation) <=
        USER_FOCUS_DISTANCE_METERS;
      const isAtLocationZoom =
        move === "tracking" || Math.abs(zoom - USER_LOCATION_ZOOM) <= 0.5;

      setFocused(isNearUser && isAtLocationZoom);
      return isNearUser && isAtLocationZoom;
    },
    [setFocused]
  );

  return {
    beginAwayMove,
    beginTrackingMove,
    beginUserMove,
    finishCameraMove,
    isFocusedRef,
    isFocused,
    markManualInteraction,
    setFocused,
    userLocationZoom: USER_LOCATION_ZOOM,
  };
}
