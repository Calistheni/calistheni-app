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

type ParsedApiError = {
  message: string;
  errors: ParkFormErrors;
  unauthorized: boolean;
};

type AdminSubmission = {
  reviewId: string;
  kind: "NEW_PARK" | "PARK_EDIT";
  id: number;
  parkId: number | null;
  originalParkName: string | null;
  originalParkAddress: string | null;
  name: string;
  title: string | null;
  address: string | null;
  lat: number;
  lon: number;
  photoUrls: string[];
  createdAt: string;
  submittedBy: {
    name: string | null;
    email: string | null;
  } | null;
  equipment: string[];
};

type AdminSubmissionsResponse = {
  count: number;
  submissions: AdminSubmission[];
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
    photoUrl: park.photoUrl,
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

  const unauthorized = response.status === 401;
  const message = unauthorized
    ? "Your admin session expired. Please sign in again."
    : payload?.error || "Request failed.";

  return {
    message,
    errors: getParkFormErrors(payload?.fieldErrors),
    unauthorized,
  } satisfies ParsedApiError;
}

function redirectToLogin() {
  window.location.href = "/admin/login";
}

export default function AdminDashboard() {
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

  const [rejectCandidate, setRejectCandidate] =
    useState<AdminSubmission | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [duplicateCandidate, setDuplicateCandidate] =
    useState<DuplicateCandidate | null>(null);
  const [isDuplicateCreatePending, setIsDuplicateCreatePending] =
    useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRetryingInitialLoad, setIsRetryingInitialLoad] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [isEquipmentLoading, setIsEquipmentLoading] = useState(true);
  const [pendingSubmissions, setPendingSubmissions] = useState<
    AdminSubmission[]
  >([]);
  const [isSubmissionsLoading, setIsSubmissionsLoading] = useState(true);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<
    string | null
  >(null);

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
      setInitialLoadError(null);
      try {
        const cached = await loadAdminParks();

        if (cached) {
          setParks(cached.data);

          try {
            const response = await fetch("/api/parks/sync");
            if (!response.ok) {
              const apiError = await parseApiError(response);

              if (apiError.unauthorized) {
                toast.error(apiError.message);
                redirectToLogin();
                return;
              }

              throw new Error(apiError.message);
            }

            const { lastUpdated } = (await response.json()) as {
              lastUpdated: string;
            };

            if (lastUpdated === cached.lastUpdated) {
              return;
            }
          } catch (error) {
            console.error(error);
            toast.error(
              "Unable to refresh parks. Showing cached data instead."
            );
            return;
          }
        }

        const parksResponse = await fetch("/api/parks");
        if (!parksResponse.ok) {
          const apiError = await parseApiError(parksResponse);

          if (apiError.unauthorized) {
            toast.error(apiError.message);
            redirectToLogin();
            return;
          }

          throw new Error(apiError.message);
        }

        const syncResponse = await fetch("/api/parks/sync");
        if (!syncResponse.ok) {
          const apiError = await parseApiError(syncResponse);

          if (apiError.unauthorized) {
            toast.error(apiError.message);
            redirectToLogin();
            return;
          }

          throw new Error(apiError.message);
        }

        const freshParks = (await parksResponse.json()) as ParkSummary[];
        const { lastUpdated } = (await syncResponse.json()) as {
          lastUpdated: string;
        };

        setParks(freshParks);
        await saveAdminParks(freshParks, lastUpdated);
      } catch (error) {
        console.error(error);
        setInitialLoadError("Unable to load parks right now.");
        toast.error("Unable to load parks right now.");
      } finally {
        setIsInitialLoading(false);
        setIsRetryingInitialLoad(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    async function loadEquipment() {
      setIsEquipmentLoading(true);

      try {
        const response = await fetch("/api/parks/equipment");

        if (!response.ok) {
          const apiError = await parseApiError(response);

          if (apiError.unauthorized) {
            toast.error(apiError.message);
            redirectToLogin();
            return;
          }

          throw new Error(apiError.message);
        }

        const items = (await response.json()) as Equipment[];
        setEquipment(items);
      } catch (error) {
        console.error(error);
        toast.error("Unable to load equipment options.");
      } finally {
        setIsEquipmentLoading(false);
      }
    }

    void loadEquipment();
  }, []);

  useEffect(() => {
    async function loadSubmissions() {
      setIsSubmissionsLoading(true);

      try {
        const response = await fetch("/api/admin/submissions");

        if (!response.ok) {
          const apiError = await parseApiError(response);

          if (apiError.unauthorized) {
            toast.error(apiError.message);
            redirectToLogin();
            return;
          }

          throw new Error(apiError.message);
        }

        const payload = (await response.json()) as AdminSubmissionsResponse;
        setPendingSubmissions(payload.submissions);
      } catch (error) {
        console.error(error);
        toast.error("Unable to load pending submissions.");
      } finally {
        setIsSubmissionsLoading(false);
      }
    }

    void loadSubmissions();
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

    if (!syncResponse.ok) {
      const apiError = await parseApiError(syncResponse);

      if (apiError.unauthorized) {
        redirectToLogin();
      }

      throw new Error(apiError.message);
    }

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

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

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

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

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

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

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
    try {
      const response = await fetch(`/api/parks/${park.id}`);

      if (!response.ok) {
        const apiError = await parseApiError(response);

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

        throw new Error(apiError.message);
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
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to load this park for editing.")
      );
    }
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

  async function reviewSubmission(
    reviewId: string,
    status: "APPROVED" | "REJECTED"
  ) {
    const finalRejectionReason =
      status === "REJECTED" ? rejectionReason.trim() || null : null;
    setReviewingSubmissionId(reviewId);

    try {
      const response = await fetch(`/api/admin/submissions/${reviewId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          rejectionReason: finalRejectionReason,
        }),
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

        throw new Error(apiError.message);
      }

      setPendingSubmissions((current) =>
        current.filter((submission) => submission.reviewId !== reviewId)
      );
      toast.success(
        status === "APPROVED" ? "Submission approved." : "Submission rejected."
      );
      setRejectCandidate(null);
      setRejectionReason("");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to review this submission right now.")
      );
    } finally {
      setReviewingSubmissionId(null);
    }
  }

  const submitButtonLabel = isSubmitting
    ? editingParkId
      ? "Saving..."
      : "Creating..."
    : editingParkId
    ? "Update Park"
    : "Create Park";
  const isSearchActive = search.trim().length >= 2;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Manage parks and keep the public map data up to date.
          </p>
        </div>

        <form action="/admin/logout" method="post">
          <Button type="submit" variant="outline">
            Logout
          </Button>
        </form>
      </div>

      {initialLoadError ? (
        <Card className="mb-6 border-destructive/20">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{initialLoadError}</p>
            <Button
              variant="outline"
              onClick={() => {
                setIsRetryingInitialLoad(true);
                window.location.reload();
              }}
              disabled={isRetryingInitialLoad}
            >
              {isRetryingInitialLoad ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isInitialLoading ? (
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Loading parks and admin data...
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Pending Submissions</h2>
              <p className="text-sm text-muted-foreground">
                Review parks submitted by users before they appear publicly.
              </p>
            </div>
            <Badge variant="secondary">
              {pendingSubmissions.length.toLocaleString()} pending
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isSubmissionsLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading pending submissions...
            </p>
          ) : pendingSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No user submissions are waiting for review.
            </p>
          ) : (
            pendingSubmissions.map((submission) => (
              <div key={submission.reviewId} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {submission.name}
                        </h3>
                        <Badge variant="outline">
                          {submission.kind === "PARK_EDIT"
                            ? "Edit Request"
                            : "New Park"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {submission.address ?? "Address unavailable"}
                      </p>
                    </div>
                    {submission.kind === "PARK_EDIT" ? (
                      <p className="text-sm text-muted-foreground">
                        Editing{" "}
                        <span className="font-medium text-foreground">
                          {submission.originalParkName ?? "existing park"}
                        </span>
                        {submission.originalParkAddress
                          ? ` at ${submission.originalParkAddress}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Submitted by{" "}
                      {submission.submittedBy?.email ??
                        submission.submittedBy?.name ??
                        "Unknown user"}{" "}
                      on {new Date(submission.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-sm">
                      {submission.lat}, {submission.lon}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {submission.equipment.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                    {submission.photoUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {submission.photoUrls.map((photoUrl, index) => (
                          <a
                            key={photoUrl}
                            href={photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium underline underline-offset-4"
                          >
                            View photo {index + 1}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No photos were attached.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void reviewSubmission(submission.reviewId, "APPROVED")
                      }
                      disabled={reviewingSubmissionId === submission.reviewId}
                    >
                      {reviewingSubmissionId === submission.reviewId
                        ? "Reviewing..."
                        : "Approve"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRejectCandidate(submission);
                        setRejectionReason("");
                      }}
                      disabled={reviewingSubmissionId === submission.reviewId}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">
            {editingParkId ? "Edit Park" : "Create Park"}
          </h2>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="park-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="park-name"
              placeholder="Name"
              value={formValues.name}
              onChange={(event) => updateTextField("name", event.target.value)}
              aria-invalid={formErrors.name ? true : undefined}
            />
            {formErrors.name ? (
              <p className="text-xs text-destructive">{formErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="park-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="park-title"
              placeholder="Title"
              value={formValues.title}
              onChange={(event) => updateTextField("title", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="park-address" className="text-sm font-medium">
              Address
            </label>
            <Input
              id="park-address"
              placeholder="Address"
              value={formValues.address}
              onChange={(event) =>
                updateTextField("address", event.target.value)
              }
            />
          </div>

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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="park-latitude"
                        className="text-sm font-medium"
                      >
                        Latitude
                      </label>
                      <Input
                        id="park-latitude"
                        placeholder="Latitude"
                        value={formValues.lat}
                        onChange={(event) =>
                          updateTextField("lat", event.target.value)
                        }
                        aria-invalid={formErrors.lat ? true : undefined}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="park-longitude"
                        className="text-sm font-medium"
                      >
                        Longitude
                      </label>
                      <Input
                        id="park-longitude"
                        placeholder="Longitude"
                        value={formValues.lon}
                        onChange={(event) =>
                          updateTextField("lon", event.target.value)
                        }
                        aria-invalid={formErrors.lon ? true : undefined}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Equipment</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

            {isEquipmentLoading ? (
              <p className="text-xs text-muted-foreground">
                Loading equipment options...
              </p>
            ) : null}

            {!isEquipmentLoading && equipment.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No equipment options are available right now.
              </p>
            ) : null}

            {formErrors.equipmentIds ? (
              <p className="text-xs text-destructive">
                {formErrors.equipmentIds}
              </p>
            ) : null}
          </fieldset>
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

              <div className="flex flex-wrap gap-2">
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

      <div className="mb-4 flex flex-wrap gap-2">
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

      <div className="mb-4 space-y-2">
        <label htmlFor="park-search" className="text-sm font-medium">
          Search parks
        </label>
        <Input
          id="park-search"
          className="w-full"
          placeholder="Search by park name or address"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>

      <p className="mb-4 text-sm text-gray-500">
        {filteredParks.length.toLocaleString()} matches
      </p>

      <p className="mb-4 text-sm text-gray-500">
        {parks.length.toLocaleString()} parks cached locally
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {!isSearchActive ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-24 text-center text-muted-foreground"
                >
                  Enter at least 2 characters to search parks.
                </TableCell>
              </TableRow>
            ) : filteredParks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-24 text-center text-muted-foreground"
                >
                  No parks matched your search.
                </TableCell>
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
      </div>

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
      <AlertDialog
        open={Boolean(rejectCandidate)}
        onOpenChange={(open) => {
          if (!open && reviewingSubmissionId !== rejectCandidate?.reviewId) {
            setRejectCandidate(null);
            setRejectionReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Optionally explain why this park submission is being rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <label htmlFor="rejection-reason" className="text-sm font-medium">
              Rejection reason
            </label>

            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Example: Duplicate park, unclear location, invalid photo..."
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(reviewingSubmissionId)}>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(reviewingSubmissionId) || !rejectCandidate}
              onClick={(event) => {
                event.preventDefault();

                if (!rejectCandidate) {
                  return;
                }

                void reviewSubmission(rejectCandidate.reviewId, "REJECTED");
              }}
            >
              {reviewingSubmissionId === rejectCandidate?.reviewId
                ? "Rejecting..."
                : "Reject Submission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
