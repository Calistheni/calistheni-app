"use client";

import { useEffect, useState } from "react";
import type { ParkSummary, ParkDetail } from "@/types/park";
import { useMemo } from "react";
import { loadAdminParks, saveAdminParks } from "@/lib/cache";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  TableHeader,
} from "@/components/ui/table";

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
  const [selectedPark, setSelectedPark] = useState<ParkDetail | null>(null);

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
        equipmentIds,
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

    setSelectedPark(fullPark);

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

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">
            {editingParkId ? "Edit Park" : "Create Park"}
          </h2>
        </CardHeader>

        <CardContent className="space-y-3">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Latitude"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />

            <Input
              placeholder="Longitude"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {equipment.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <Checkbox
              checked={equipmentIds.includes(item.id)}
              onCheckedChange={(checked) => {
                if (checked) {
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
      {selectedPark && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-2xl font-bold">{selectedPark.name}</h2>

            {selectedPark.address && (
              <p className="text-muted-foreground">{selectedPark.address}</p>
            )}
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Coordinates</p>

                <p>
                  {selectedPark.lat}, {selectedPark.lon}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm text-muted-foreground">Equipment</p>

                <div className="flex flex-wrap gap-2">
                  {selectedPark.equipment?.map((item: string) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={updatePark}>Save Changes</Button>

                <Button
                  variant="destructive"
                  onClick={() => deletePark(selectedPark.id)}
                >
                  Delete Park
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="mb-4 flex gap-2">
        <Button onClick={editingParkId ? updatePark : createPark}>
          {editingParkId ? "Update Park" : "Create Park"}
        </Button>

        {editingParkId && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditingParkId(null);

              setName("");
              setTitle("");
              setAddress("");
              setLat("");
              setLon("");
              setEquipmentIds([]);
            }}
          >
            Cancel
          </Button>
        )}
      </div>

      <Input
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {search.trim().length < 2 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="h-24 text-center text-muted-foreground"
              ></TableCell>
            </TableRow>
          ) : (
            filteredParks.slice(0, 100).map((park) => (
              <TableRow
                key={park.id}
                onClick={() => startEditing(park)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>{park.id}</TableCell>
                <TableCell>{park.name}</TableCell>
                <TableCell>{park.address}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </main>
  );
}
