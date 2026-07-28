"use client";

import { useState } from "react";
import ParksMap, {
  getInitialLightPreset,
  type MapParkSummary,
} from "@/components/ParksMap";
import { Badge } from "@/components/ui/badge";
import type {
  AdminParkDetail,
  ParkArchiveStatus,
  ParkQrStatus,
} from "@/types/park";

export function AdminParksMap({
  refreshToken,
  qrStatusFilter,
  parkStatusFilter,
  onParkUpdated,
  selectedPark,
  onParkSelected,
  onParkPlacement,
  placementResetToken,
}: {
  refreshToken: number;
  qrStatusFilter: ParkQrStatus | "ALL";
  parkStatusFilter: ParkArchiveStatus;
  onParkUpdated: (park: AdminParkDetail) => void;
  selectedPark: AdminParkDetail | null;
  onParkSelected: (park: AdminParkDetail) => void;
  onParkPlacement: (coordinates: { lat: number; lon: number }) => void;
  placementResetToken: number;
}) {
  const [parks, setParks] = useState<MapParkSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <section aria-labelledby="admin-parks-map-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="admin-parks-map-title" className="text-xl font-semibold">
            Park management map
          </h2>
          <p className="text-sm text-muted-foreground">
            Move the map, then search the visible area. Only real viewport
            parks are loaded.
          </p>
        </div>
        <Badge variant="secondary" aria-live="polite">
          {isLoading
            ? "Loading area…"
            : `${parks.length.toLocaleString()} in loaded areas`}
        </Badge>
      </div>

      <div className="h-[32rem] min-h-[24rem] overflow-hidden rounded-xl border sm:h-[38rem]">
        <ParksMap
          mode="admin"
          parks={parks}
          selectedPark={selectedPark}
          lightPreset={getInitialLightPreset()}
          theme="default"
          qrStatusFilter={qrStatusFilter}
          parkStatusFilter={parkStatusFilter}
          adminRefreshToken={refreshToken}
          onAdminParkUpdated={onParkUpdated}
          onAdminParkSelected={onParkSelected}
          onAdminParkPlacement={onParkPlacement}
          placementResetToken={placementResetToken}
          searchControlVariant="authenticated"
          onViewportParksChange={setParks}
          onViewportLoadingChange={setIsLoading}
        />
      </div>
    </section>
  );
}
