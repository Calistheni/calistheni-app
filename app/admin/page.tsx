"use client";

import { useEffect, useMemo, useState } from "react";
import { CoordinatePicker } from "@/components/CoordinatePicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { loadAdminParks, saveAdminParks } from "@/lib/cache";
import {
  getParkFormErrors,
  validateParkMutation,
} from "@/lib/validation/parks";
import type {
  ParkDetail,
  ParkFormErrors,
  ParkFormValues,
  ParkMutationPayload,
  ParkSummary,
} from "@/types/park";

type Equipment = {
  id: number;
  name: string;
};

type DuplicateCandidate = {
  existingPark: ParkSummary;
  distanceMeters: number;
  payload: ParkMutationPayload;
};

type ApiErrorPayload = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const DUPLICATE_DISTANCE_THRESHOLD_METERS = 100;
const EARTH_RADIUS_METERS = 6_371_000;

const EMPTY_FORM_VALUES: ParkFormValues = {
  name: "",
  title: "",
  address: "",
  lat: "",
  lon: "",
  equipmentIds: [],
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(
  sourceLat: number,
  sourceLon: number,
  targetLat: number,
  targetLon: number
) {
  const deltaLat = toRadians(targetLat - sourceLat);
  const deltaLon = toRadians(targetLon - sourceLon);
  const sourceLatRadians = toRadians(sourceLat);
  const targetLatRadians = toRadians(targetLat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(sourceLatRadians) *
      Math.cos(targetLatRadians) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function findDuplicatePark(parks: ParkSummary[], payload: ParkMutationPayload) {
  let closestCandidate: DuplicateCandidate | null = null;

  for (const park of parks) {
    const distanceMeters = calculateDistanceMeters(
      payload.lat,
      payload.lon,
      park.lat,
      park.lon
    );

    if (distanceMeters > DUPLICATE_DISTANCE_THRESHOLD_METERS) {
      continue;
    }

    if (!closestCandidate || distanceMeters < closestCandidate.distanceMeters) {
      closestCandidate = {
        existingPark: park,
        distanceMeters,
        payload,
      };
    }
  }

  return closestCandidate;
}

function toParkSummary(park: ParkDetail): ParkSummary {
  return {
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    updatedAt: park.updatedAt,
    deletedAt: park.deletedAt ?? null,
  };
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

async function parseApiError(response: Response) {
  let payload: ApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  const message = payload?.error || "Request failed.";

  return {
    message,
    errors: getParkFormErrors(payload?.fieldErrors),
  };
}

export default function AdminPage() {
  const [formValues, setFormValues] =
    useState<ParkFormValues>(EMPTY_FORM_VALUES);
  const [formErrors, setFormErrors] = useState<ParkFormErrors>({});
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [editingParkId, setEditingParkId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPark, setSelectedPark] = useState<ParkDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ParkDetail | null>(
    null
  );
  const [duplicateCandidate, setDuplicateCandidate] =
    useState<DuplicateCandidate | null>(null);
  const [isDuplicateCreatePending, setIsDuplicateCreatePending] =
    useState(false);

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
        setParks(cached.data);

        try {
          const response = await fetch("/api/parks/sync");
          const { lastUpdated } = (await response.json()) as {
            lastUpdated: string;
          };

          if (lastUpdated === cached.lastUpdated) {
            return;
          }
        } catch (error) {
          console.error(error);
          return;
        }
      }

      const parksResponse = await fetch("/api/parks");
      const freshParks = (await parksResponse.json()) as ParkSummary[];

      const syncResponse = await fetch("/api/parks/sync");
      const { lastUpdated } = (await syncResponse.json()) as {
        lastUpdated: string;
      };

      setParks(freshParks);
      await saveAdminParks(freshParks, lastUpdated);
    }

    void load();
  }, []);

  useEffect(() => {
    fetch("/api/parks/equipment")
      .then((response) => response.json())
      .then((items: Equipment[]) => {
        setEquipment(items);
      });
  }, []);

  function resetForm() {
    setFormValues(EMPTY_FORM_VALUES);
    setFormErrors({});
    setEditingParkId(null);
  }

  function clearFieldError(field: keyof ParkFormErrors) {
    setFormErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }

  function updateTextField(
    field: Exclude<keyof ParkFormValues, "equipmentIds">,
    value: string
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));

    if (field === "name" || field === "lat" || field === "lon") {
      clearFieldError(field);
    }
  }

  function updateEquipmentSelection(equipmentId: number, checked: boolean) {
    setFormValues((current) => ({
      ...current,
      equipmentIds: checked
        ? [...current.equipmentIds, equipmentId]
        : current.equipmentIds.filter((id) => id !== equipmentId),
    }));
    clearFieldError("equipmentIds");
  }

  async function persistParks(nextParks: ParkSummary[]) {
    const syncResponse = await fetch("/api/parks/sync");
    const { lastUpdated } = (await syncResponse.json()) as {
      lastUpdated: string;
    };

    await saveAdminParks(nextParks, lastUpdated);
  }

  async function submitCreate(payload: ParkMutationPayload) {
    const duplicate = findDuplicatePark(parks, payload);

    if (duplicate) {
      setDuplicateCandidate(duplicate);
      return;
    }

    await createPark(payload);
  }

  async function createPark(payload: ParkMutationPayload) {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/parks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        setFormErrors(apiError.errors);
        throw new Error(apiError.message || "Unable to create this park.");
      }

      const createdPark = (await response.json()) as ParkDetail;
      const nextParks = [
        toParkSummary(createdPark),
        ...parks.filter((park) => park.id !== createdPark.id),
      ];

      setParks(nextParks);
      setSelectedPark(createdPark);
      resetForm();
      void persistParks(nextParks).catch((error) => {
        console.error(error);
      });
      toast.success("Park created successfully");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create this park."));
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updatePark(payload: ParkMutationPayload) {
    if (!editingParkId) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/parks/${editingParkId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        setFormErrors(apiError.errors);
        throw new Error(apiError.message || "Unable to update this park.");
      }

      const updatedPark = (await response.json()) as ParkDetail;
      const nextParks = parks.map((park) =>
        park.id === editingParkId ? toParkSummary(updatedPark) : park
      );

      setParks(nextParks);
      setSelectedPark(updatedPark);
      resetForm();
      void persistParks(nextParks).catch((error) => {
        console.error(error);
      });
      toast.success("Park updated successfully");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update this park."));
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitDelete() {
    if (!deleteCandidate) {
      return;
    }

    setIsDeletePending(true);

    try {
      const response = await fetch(`/api/parks/${deleteCandidate.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        throw new Error(apiError.message || "Unable to delete this park.");
      }

      const nextParks = parks.filter((park) => park.id !== deleteCandidate.id);

      setParks(nextParks);

      if (selectedPark?.id === deleteCandidate.id) {
        setSelectedPark(null);
      }

      if (editingParkId === deleteCandidate.id) {
        resetForm();
      }

      setDeleteCandidate(null);
      void persistParks(nextParks).catch((error) => {
        console.error(error);
      });
      toast.success("Park deleted successfully");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete this park."));
    } finally {
      setIsDeletePending(false);
    }
  }

  function handleSubmit() {
    const validationResult = validateParkMutation(formValues);

    if (!validationResult.success) {
      setFormErrors(validationResult.errors);
      return;
    }

    setFormErrors({});

    if (editingParkId) {
      void updatePark(validationResult.data);
      return;
    }

    void submitCreate(validationResult.data);
  }

  async function startEditing(park: ParkSummary) {
    const response = await fetch(`/api/parks/${park.id}`);

    if (!response.ok) {
      toast.error("Unable to load this park for editing.");
      return;
    }

    const fullPark = (await response.json()) as ParkDetail;

    setSelectedPark(fullPark);
    setEditingParkId(fullPark.id);
    setFormValues({
      name: fullPark.name,
      title: fullPark.title ?? "",
      address: fullPark.address ?? "",
      lat: String(fullPark.lat),
      lon: String(fullPark.lon),
      equipmentIds: equipment
        .filter((item) => fullPark.equipment.includes(item.name))
        .map((item) => item.id),
    });
    setFormErrors({});
  }

  async function confirmDuplicateCreate() {
    if (!duplicateCandidate) {
      return;
    }

    setIsDuplicateCreatePending(true);

    try {
      await createPark(duplicateCandidate.payload);
      setDuplicateCandidate(null);
    } finally {
      setIsDuplicateCreatePending(false);
    }
  }

  const submitButtonLabel = isSubmitting
    ? editingParkId
      ? "Saving..."
      : "Creating..."
    : editingParkId
    ? "Update Park"
    : "Create Park";

  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Admin</h1>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">
            {editingParkId ? "Edit Park" : "Create Park"}
          </h2>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Name"
              value={formValues.name}
              onChange={(event) => updateTextField("name", event.target.value)}
              aria-invalid={formErrors.name ? true : undefined}
            />
            {formErrors.name ? (
              <p className="text-xs text-destructive">{formErrors.name}</p>
            ) : null}
          </div>

          <Input
            placeholder="Title"
            value={formValues.title}
            onChange={(event) => updateTextField("title", event.target.value)}
          />

          <Input
            placeholder="Address"
            value={formValues.address}
            onChange={(event) => updateTextField("address", event.target.value)}
          />

          <Card>
            <CardHeader>
              <h3 className="font-semibold">Location</h3>
            </CardHeader>

            <CardContent className="space-y-4">
              <CoordinatePicker
                lat={formValues.lat}
                lon={formValues.lon}
                onChange={(newLat, newLon) => {
                  updateTextField("lat", String(newLat));
                  updateTextField("lon", String(newLon));
                }}
              />

              <div className="rounded-lg border p-3 text-sm">
                <div>
                  <strong>Latitude:</strong>{" "}
                  {formValues.lat || "Click on the map"}
                </div>

                <div>
                  <strong>Longitude:</strong>{" "}
                  {formValues.lon || "Click on the map"}
                </div>
              </div>

              {formErrors.lat ? (
                <p className="text-xs text-destructive">{formErrors.lat}</p>
              ) : null}
              {formErrors.lon ? (
                <p className="text-xs text-destructive">{formErrors.lon}</p>
              ) : null}

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline">Manual Coordinates</Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Latitude"
                      value={formValues.lat}
                      onChange={(event) =>
                        updateTextField("lat", event.target.value)
                      }
                      aria-invalid={formErrors.lat ? true : undefined}
                    />

                    <Input
                      placeholder="Longitude"
                      value={formValues.lon}
                      onChange={(event) =>
                        updateTextField("lon", event.target.value)
                      }
                      aria-invalid={formErrors.lon ? true : undefined}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {equipment.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={formValues.equipmentIds.includes(item.id)}
                    onCheckedChange={(checked) => {
                      updateEquipmentSelection(item.id, checked === true);
                    }}
                    aria-invalid={formErrors.equipmentIds ? true : undefined}
                  />
                  {item.name}
                </label>
              ))}
            </div>

            {formErrors.equipmentIds ? (
              <p className="text-xs text-destructive">
                {formErrors.equipmentIds}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {selectedPark ? (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-2xl font-bold">{selectedPark.name}</h2>

            {selectedPark.address ? (
              <p className="text-muted-foreground">{selectedPark.address}</p>
            ) : null}
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
                  {selectedPark.equipment.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {editingParkId === selectedPark.id ? (
                  <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                ) : null}

                <Button
                  variant="destructive"
                  onClick={() => setDeleteCandidate(selectedPark)}
                  disabled={isDeletePending}
                >
                  Delete Park
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 flex gap-2">
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {submitButtonLabel}
        </Button>

        {editingParkId ? (
          <Button
            variant="secondary"
            onClick={resetForm}
            disabled={isSubmitting || isDeletePending}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <Input
        className="mb-4 w-full border p-2"
        placeholder="Search park..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
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
                onClick={() => void startEditing(park)}
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

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !isDeletePending) {
            setDeleteCandidate(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Park</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this park?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletePending}
              onClick={(event) => {
                event.preventDefault();
                void submitDelete();
              }}
            >
              {isDeletePending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(duplicateCandidate)}
        onOpenChange={(open) => {
          if (!open && !isDuplicateCreatePending) {
            setDuplicateCandidate(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Possible Duplicate Park</AlertDialogTitle>
            <AlertDialogDescription>
              A park already exists very close to this location.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {duplicateCandidate ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <p>
                <span className="font-medium">Existing Park:</span>{" "}
                {duplicateCandidate.existingPark.name}
              </p>
              <p>
                <span className="font-medium">Distance:</span>{" "}
                {Math.round(duplicateCandidate.distanceMeters)} meters
              </p>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDuplicateCreatePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDuplicateCreatePending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDuplicateCreate();
              }}
            >
              {isDuplicateCreatePending ? "Creating..." : "Create Anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
