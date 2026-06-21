"use client";

import { useState } from "react";
import ParksMap from "@/components/ParksMap";
import type { ParkSummary } from "@/types/park";

export default function Home() {
  const [parks, setParks] = useState<ParkSummary[]>([]);

  return (
    <main className="h-screen overflow-hidden">
      <ParksMap
        parks={parks}
        selectedPark={null}
        onViewportParksChange={setParks}
      />
    </main>
  );
}
