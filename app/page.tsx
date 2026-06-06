"use client";

import { useState } from "react";
import { parks } from "@/lib/parks-data";
import ParkCard from "@/components/ParkCard";

export default function Home() {
  const [search, setSearch] = useState("");
  const filteredParks = parks.filter((park) =>
    park.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Total parks: {parks.length}</h1>
      <ul className="mt-6 space-y-2">
        <input
          type="text"
          placeholder="Search parks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-md"
        />
        {filteredParks.slice(0, 200).map((park) => (
          <li key={park.id}>
            <ParkCard park={park} />
          </li>
        ))}
      </ul>
    </main>
  );
}
