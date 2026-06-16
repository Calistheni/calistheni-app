"use client";

import { useEffect, useState } from "react";
import type { ParkSummary } from "@/types/park";
type Equipment = {
  id: number;
  name: string;
};

export default function AdminPage() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  useEffect(() => {
    fetch("/api/parks/equipment")
      .then((r) => r.json())
      .then(setEquipment);
  }, []);

  useEffect(() => {
    fetch("/api/parks")
      .then((res) => res.json())
      .then(setParks);
  }, []);

  async function createPark() {
    console.log("equipmentIds", equipmentIds);

    const response = await fetch("/api/parks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        title,
        address,
        lat,
        lon,
        equipmentIds,
      }),
    });

    const park = await response.json();

    console.log(park);
    console.log("equipmentIds", equipmentIds);
    setParks((prev) => [park, ...prev]);
  }

  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Admin</h1>
      <div className="mb-8 flex flex-col gap-2">
        <input
          className="border p-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Longitude"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {equipment.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={equipmentIds.includes(item.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setEquipmentIds([...equipmentIds, item.id]);
                } else {
                  setEquipmentIds(equipmentIds.filter((id) => id !== item.id));
                }
              }}
            />

            {item.name}
          </label>
        ))}
      </div>

      <button
        onClick={createPark}
        className="mb-6 rounded bg-blue-500 px-4 py-2 text-white"
      >
        Create Park
      </button>

      <table className="w-full border">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Address</th>
          </tr>
        </thead>

        <tbody>
          {parks.slice(0, 100).map((park) => (
            <tr key={park.id}>
              <td>{park.id}</td>
              <td>{park.name}</td>
              <td>{park.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
