"use client";

import { useState } from "react";
import ParkCard from "@/components/ParkCard";
import ParksMap from "@/components/ParksMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import type { ParkSummary } from "@/types/park";

export default function Home() {
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [isViewportLoading, setIsViewportLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPark, setSelectedPark] = useState<ParkSummary | null>(null);

  const filteredParks = parks.filter((park) =>
    `${park.name} ${park.address}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="p-8">
      <ParksMap
        parks={parks}
        selectedPark={
          selectedPark && parks.some((park) => park.id === selectedPark.id)
            ? selectedPark
            : null
        }
        onViewportParksChange={setParks}
        onViewportLoadingChange={setIsViewportLoading}
      />
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {isViewportLoading
                ? "Loading parks in view..."
                : `${parks.length.toLocaleString()} Parks In View`}
            </CardTitle>

            <ThemeSwitcher />
          </div>
        </CardHeader>

        <CardContent>
          <Input
            type="text"
            placeholder="Search countries, cities, equipment"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <ul className="mt-6 space-y-2">
        {!isViewportLoading && filteredParks.length === 0 ? (
          <li className="rounded border border-dashed p-4 text-sm text-muted-foreground">
            No parks found in the current viewport.
          </li>
        ) : null}

        {filteredParks.slice(0, 100).map((park) => (
          <li key={park.id}>
            <button
              className="w-full text-left hover:cursor-pointer"
              onClick={() => setSelectedPark(park)}
            >
              <ParkCard park={park} />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
