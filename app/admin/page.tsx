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
  const [editingParkId, setEditingParkId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/parks/equipment")
      .then((r) => r.json())
      .then(setEquipment);
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) {
      return;
    }

    const timeout = setTimeout(() => {
      fetch(`/api/parks/search?q=${encodeURIComponent(search)}&page=${page}`)
        .then((res) => res.json())
        .then(setParks);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, page]);

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

  async function updatePark() {
    if (!editingParkId) return;

    const response = await fetch(`/api/parks/${editingParkId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        title,
        address,
        lat: Number(lat),
        lon: Number(lon),
      }),
    });

    const updatedPark = await response.json();

    setParks((prev) =>
      prev.map((park) => (park.id === editingParkId ? updatedPark : park))
    );

    setEditingParkId(null);

    setName("");
    setTitle("");
    setAddress("");
    setLat("");
    setLon("");
    setEquipmentIds([]);
  }
  function startEditing(park: ParkSummary) {
    setEditingParkId(park.id);

    setName(park.name);
    setTitle(park.title ?? "");
    setAddress(park.address ?? "");
    setLat(String(park.lat));
    setLon(String(park.lon));
  }
  async function deletePark(id: number) {
    await fetch(`/api/parks/${id}`, {
      method: "DELETE",
    });

    setParks((prev) => prev.filter((park) => park.id !== id));
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

      <div className="mb-4 flex gap-2">
        <button
          onClick={editingParkId ? updatePark : createPark}
          className="rounded bg-blue-500 px-4 py-2 text-white cursor-pointer"
        >
          {editingParkId ? "Update Park" : "Create Park"}
        </button>

        {editingParkId && (
          <button
            onClick={() => {
              setEditingParkId(null);

              setName("");
              setTitle("");
              setAddress("");
              setLat("");
              setLon("");
              setEquipmentIds([]);
            }}
            className="rounded bg-gray-500 px-4 py-2 text-white cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      <input
        className="mb-4 w-full border p-2"
        placeholder="Search park..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      <table className="w-full border">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Address</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {parks.map((park) => (
            <tr key={park.id}>
              <td>{park.id}</td>
              <td>{park.name}</td>
              <td>{park.address}</td>

              <td>
                <button
                  onClick={() => startEditing(park)}
                  className="rounded bg-yellow-500 px-2 py-1 text-white cursor-pointer"
                >
                  Edit
                </button>

                <button
                  onClick={() => deletePark(park.id)}
                  className="ml-2 rounded bg-red-500 px-2 py-1 text-white cursor-pointer"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded bg-gray-500 px-4 py-2 text-white disabled:opacity-50"
        >
          Previous
        </button>

        <span className="flex items-center px-2">Page {page}</span>

        <button
          onClick={() => setPage((p) => p + 1)}
          className="rounded bg-blue-500 px-4 py-2 text-white"
        >
          Next
        </button>
      </div>
    </main>
  );
}
