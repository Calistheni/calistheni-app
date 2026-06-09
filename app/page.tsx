"use client";

import { useState } from "react";
import { parks } from "@/lib/parks-data";
import ParkCard from "@/components/ParkCard";
import ParksMap from "@/components/ParksMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import type { Park } from "@/types/park";

export default function Home() {
  const [search, setSearch] = useState("");
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);

  const filteredParks = parks.filter((park) =>
    `${park.name} ${park.address}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="p-8">
      <ParksMap selectedPark={selectedPark} />
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {parks.length.toLocaleString()} Parks Worldwide
            </CardTitle>

            <ThemeSwitcher />
          </div>
        </CardHeader>

        <CardContent>
          <Input
            type="text"
            placeholder="Search parks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <ul className="mt-6 space-y-2">
        {filteredParks.slice(0, 10).map((park) => (
          <li key={park.id}>
            <button
              className="w-full text-left"
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
