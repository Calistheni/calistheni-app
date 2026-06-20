"use client";

import { useEffect, useState } from "react";
import type { ParkSummary } from "@/types/park";
import { useMemo } from "react";
import { loadAdminParks, saveAdminParks } from "@/lib/cache";
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

  const filteredParks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (normalizedSearch.length < 2) {
      return [];
    }

    return parks.filter(
      (park) =>
        park.name.toLowerCase().includes(normalizedSearch) ||
        park.address?.toLowerCase().includes(normalizedSearch)
    );
  }, [parks, search]);

  useEffect(() => {
    async function load() {
      const cached = await loadAdminParks();

      if (cached) {
        console.log(`[CACHE] Using ${cached.data.length} parks from IndexedDB`);

        console.log("[CACHE] Full cache object:", cached);

        setParks(cached.data);

        try {
          const response = await fetch("/api/parks/sync");
          const { lastUpdated } = await response.json();

          if (lastUpdated === cached.lastUpdated) {
            console.log("[SYNC] No changes found");
            return;
          }

          console.log("[SYNC] Changes detected");
        } catch (error) {
          console.error(error);
          return;
        }
      }

      console.log("[NETWORK] Fetching parks from API...");

      const parksResponse = await fetch("/api/parks");
      const freshParks = await parksResponse.json();

      const syncResponse = await fetch("/api/parks/sync");
      const { lastUpdated } = await syncResponse.json();

      setParks(freshParks);

      await saveAdminParks(freshParks, lastUpdated);

      console.log(`[CACHE] Saved ${freshParks.length} parks to IndexedDB`);
    }

    load();
  }, []);

  useEffect(() => {
    fetch("/api/parks/equipment")
      .then((r) => r.json())
      .then(setEquipment);
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

    const syncResponse = await fetch("/api/parks/sync");
    const { lastUpdated } = await syncResponse.json();

    setParks((prev) => {
      const updated = [park, ...prev];

      void saveAdminParks(updated, lastUpdated);

      return updated;
    });
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

    const syncResponse = await fetch("/api/parks/sync");
    const { lastUpdated } = await syncResponse.json();

    setParks((prev) => {
      const updated = prev.map((park) =>
        park.id === editingParkId ? updatedPark : park
      );

      void saveAdminParks(updated, lastUpdated);

      return updated;
    });

    setEditingParkId(null);

    setName("");
    setTitle("");
    setAddress("");
    setLat("");
    setLon("");
    setEquipmentIds([]);
  }
  async function startEditing(park: ParkSummary) {
    const response = await fetch(`/api/parks/${park.id}`);
    const fullPark = await response.json();

    setEditingParkId(fullPark.id);

    setName(fullPark.name);
    setTitle(fullPark.title ?? "");
    setAddress(fullPark.address ?? "");
    setLat(String(fullPark.lat));
    setLon(String(fullPark.lon));

    const selectedIds = equipment
      .filter((item) => fullPark.equipment.includes(item.name))
      .map((item) => item.id);

    setEquipmentIds(selectedIds);
  }
  async function deletePark(id: number) {
    await fetch(`/api/parks/${id}`, {
      method: "DELETE",
    });

    const syncResponse = await fetch("/api/parks/sync");
    const { lastUpdated } = await syncResponse.json();

    setParks((prev) => {
      const updated = prev.filter((park) => park.id !== id);

      void saveAdminParks(updated, lastUpdated);

      return updated;
    });
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
        }}
      />

      <p className="mb-4 text-sm text-gray-500">
        {filteredParks.length.toLocaleString()} matches
      </p>

      <p className="mb-4 text-sm text-gray-500">
        {parks.length.toLocaleString()} parks cached locally
      </p>

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
          {search.trim().length < 2 ? (
            <tr>
              <td colSpan={4} className="p-4 text-center text-gray-500">
                Type at least 2 characters to search
              </td>
            </tr>
          ) : (
            filteredParks.slice(0, 100).map((park) => (
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
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
