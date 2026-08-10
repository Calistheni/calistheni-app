"use client";

import Link from "next/link";
import { ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AdminParksMap } from "@/components/admin/AdminParksMap";
import { ParkQrStatusBadge } from "@/components/admin/ParkQrStatusBadge";
import { ParkQrStatusControl } from "@/components/admin/ParkQrStatusControl";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NoteTextarea } from "@/components/ui/note-textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  PARK_DUPLICATE_WARNING_RADIUS_METERS,
} from "@/lib/park-distance";
import { isParkArchivedForAdminMap } from "@/lib/park-map-query";
import { PARK_QR_STATUS_OPTIONS } from "@/lib/park-qr";
import {
  getParkFormErrors,
  validateParkMutation,
} from "@/lib/validation/parks";
import {
  PARK_PHOTO_ACCEPT,
  PARK_PHOTO_MAX_COUNT,
  validateParkPhotoMetadata,
} from "@/lib/park-photo-file";
import {
  formatPhotoLocationDistance,
  type PhotoLocationSource,
  type PhotoLocationStatus,
  type StoredPhotoLocationVerification,
} from "@/lib/photo-location-verification";
import type {
  AdminParkDetail,
  AdminParkMapSummary,
  AdminParkQrCounts,
  ParkDetail,
  ParkArchiveStatus,
  ParkFormErrors,
  ParkFormValues,
  ParkMutationPayload,
  ParkQrStatus,
  ParkSummary,
} from "@/types/park";

type Equipment = {
  id: number;
  name: string;
};

type DuplicateCandidate = {
  existingPark: {
    id: number;
    name: string;
  };
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
  photoLocationVerifications: StoredPhotoLocationVerification[];
  nearbyParkWarning: boolean;
  closestNearbyPark: {
    id: number;
    name: string;
    title: string | null;
  } | null;
  closestNearbyParkDistanceMeters: number | null;
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

type AdminParkPhoto = {
  id: number;
  url: string;
  isPrimary: boolean;
  isHidden: boolean;
  hiddenAt: string | null;
  createdAt: string;
  uploadedBy: {
    name: string | null;
    email: string | null;
  } | null;
};

type AdminParkPhotosResponse = {
  photos: AdminParkPhoto[];
  park?: AdminParkDetail | null;
};

type AdminParkPhotoUpdateResponse = {
  park: ParkDetail | null;
  photos: AdminParkPhoto[];
};

type PendingAdminParkPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const EMPTY_FORM_VALUES: ParkFormValues = {
  name: "",
  title: "",
  address: "",
  lat: "",
  lon: "",
  equipmentIds: [],
  qrStatus: "NOT_INSTALLED",
  qrCodeNote: "",
};

function getPhotoLocationBadgeLabel(
  status: PhotoLocationStatus,
  source: PhotoLocationSource
) {
  if (status === "MATCHED") {
    return source === "BROWSER_GEOLOCATION"
      ? "Device location match"
      : "Photo GPS match";
  }

  if (status === "MISMATCH") {
    return source === "BROWSER_GEOLOCATION"
      ? "Device location mismatch"
      : "Photo GPS mismatch";
  }

  return "No GPS metadata";
}

function getPhotoLocationBadgeVariant(status: PhotoLocationStatus) {
  if (status === "MISMATCH") {
    return "destructive";
  }

  if (status === "NO_GPS_DATA") {
    return "outline";
  }

  return "default";
}

function toParkSummary(park: AdminParkDetail): AdminParkMapSummary {
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
    qrStatus: park.qrStatus,
    equipmentCount: park.equipment.length,
    submissionStatus: park.submissionStatus,
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
    : payload?.error || "Something went wrong. Please try again in a moment.";

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
  const [parks, setParks] = useState<AdminParkMapSummary[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [editingParkId, setEditingParkId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPark, setSelectedPark] =
    useState<AdminParkDetail | null>(null);
  const [selectedParkPreview, setSelectedParkPreview] =
    useState<AdminParkMapSummary | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const [parkPhotos, setParkPhotos] = useState<AdminParkPhoto[]>([]);
  const [isParkPhotosLoading, setIsParkPhotosLoading] = useState(false);
  const [updatingPhotoId, setUpdatingPhotoId] = useState<number | null>(null);
  const [pendingParkPhotos, setPendingParkPhotos] = useState<
    PendingAdminParkPhoto[]
  >([]);
  const pendingParkPhotoUrlsRef = useRef(new Set<string>());
  const [photoDeleteCandidate, setPhotoDeleteCandidate] =
    useState<AdminParkPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminPhoto, setAdminPhoto] = useState<File | null>(null);
  const [adminPhotoPreview, setAdminPhotoPreview] = useState<string | null>(null);
  const adminPhotoPreviewRef = useRef<string | null>(null);
  const initialParkQueryHandledRef = useRef(false);
  const reviewingSubmissionRef = useRef(new Set<string>());
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminParkDetail | null>(
    null
  );
  const [qrStatusFilter, setQrStatusFilter] =
    useState<ParkQrStatus | "ALL">("ALL");
  const [parkStatusFilter, setParkStatusFilter] =
    useState<ParkArchiveStatus>("ACTIVE");
  const [qrCounts, setQrCounts] = useState<AdminParkQrCounts | null>(null);
  const [nextParkCursor, setNextParkCursor] = useState<number | null>(null);
  const [isParkSearchLoading, setIsParkSearchLoading] = useState(false);
  const [mapRefreshVersion, setMapRefreshVersion] = useState(0);
  const [placementResetToken, setPlacementResetToken] = useState(0);
  const [isMapPlacementDraft, setIsMapPlacementDraft] = useState(false);
  const parkSearchRequestRef = useRef(0);
  const adminSelectionRequestRef = useRef(0);

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

  async function loadQrCounts() {
    try {
      const params = new URLSearchParams({
        qrStatus: qrStatusFilter,
        parkStatus: parkStatusFilter,
      });
      const response = await fetch(`/api/admin/parks/summary?${params}`);
      if (!response.ok) throw new Error("Unable to load QR counts.");
      setQrCounts((await response.json()) as AdminParkQrCounts);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadParkPage({
    cursor = null,
    append = false,
  }: {
    cursor?: number | null;
    append?: boolean;
  } = {}) {
    const requestId = ++parkSearchRequestRef.current;
    setIsParkSearchLoading(true);
    setInitialLoadError(null);

    const params = new URLSearchParams({
      qrStatus: qrStatusFilter,
      parkStatus: parkStatusFilter,
    });
    const normalizedSearch = search.trim();
    if (normalizedSearch.length >= 2) params.set("q", normalizedSearch);
    if (cursor) params.set("cursor", String(cursor));

    try {
      const response = await fetch(`/api/admin/parks?${params.toString()}`);
      if (!response.ok) {
        const apiError = await parseApiError(response);
        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }
        throw new Error(apiError.message);
      }
      const payload = (await response.json()) as {
        parks: AdminParkMapSummary[];
        nextCursor: number | null;
      };
      if (requestId !== parkSearchRequestRef.current) return;

      setParks((current) =>
        append
          ? [
              ...current,
              ...payload.parks.filter(
                (park) => !current.some((item) => item.id === park.id)
              ),
            ]
          : payload.parks
      );
      setNextParkCursor(payload.nextCursor);
    } catch (error) {
      if (requestId !== parkSearchRequestRef.current) return;
      console.error(error);
      setInitialLoadError("We couldn't load parks right now.");
      toast.error("We couldn't load parks right now. Please try again.");
    } finally {
      if (requestId === parkSearchRequestRef.current) {
        setIsParkSearchLoading(false);
        setIsInitialLoading(false);
        setIsRetryingInitialLoad(false);
      }
    }
  }

  useEffect(() => {
    return () => {
      if (adminPhotoPreviewRef.current) {
        URL.revokeObjectURL(adminPhotoPreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const value = new URLSearchParams(window.location.search).get("qrStatus");
      if (
        value === "NOT_INSTALLED" ||
        value === "INSTALLED" ||
        value === "NEEDS_REPLACEMENT"
      ) {
        setQrStatusFilter(value);
      }
      const parkStatus = new URLSearchParams(window.location.search).get(
        "parkStatus"
      );
      if (
        parkStatus === "ACTIVE" ||
        parkStatus === "ARCHIVED" ||
        parkStatus === "ALL"
      ) {
        setParkStatusFilter(parkStatus);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (search.trim().length === 1) {
      parkSearchRequestRef.current += 1;
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadParkPage();
    }, search.trim().length >= 2 ? 250 : 0);

    return () => window.clearTimeout(timeout);
    // loadParkPage intentionally reads the latest search/filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkStatusFilter, qrStatusFilter, search]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadQrCounts();
    });
    return () => window.cancelAnimationFrame(frame);
    // loadQrCounts intentionally reads the latest selected filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkStatusFilter, qrStatusFilter]);

  useEffect(() => {
    if (isEquipmentLoading || initialParkQueryHandledRef.current) return;
    initialParkQueryHandledRef.current = true;

    const rawParkId = new URLSearchParams(window.location.search).get("park");
    const parkId = rawParkId ? Number.parseInt(rawParkId, 10) : null;
    if (parkId && Number.isInteger(parkId) && parkId > 0) {
      void startEditing({ id: parkId });
    }
    // startEditing is a function declaration and reads current equipment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEquipmentLoading]);

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
        toast.error("We couldn't load equipment options. Please try again.");
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
        toast.error("We couldn't load pending submissions. Please try again.");
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
    setAdminPhoto(null);
    if (adminPhotoPreviewRef.current) {
      URL.revokeObjectURL(adminPhotoPreviewRef.current);
      adminPhotoPreviewRef.current = null;
    }
    setAdminPhotoPreview(null);
    pendingParkPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pendingParkPhotoUrlsRef.current.clear();
    setPendingParkPhotos([]);
    setIsMapPlacementDraft(false);
    setPlacementResetToken((current) => current + 1);
  }

  function beginMapParkCreate({ lat, lon }: { lat: number; lon: number }) {
    setEditingParkId(null);
    setSelectedPark(null);
    setSelectedParkPreview(null);
    setParkPhotos([]);
    setFormErrors({});
    setFormValues({
      ...EMPTY_FORM_VALUES,
      lat: String(lat),
      lon: String(lon),
    });
    setIsMapPlacementDraft(true);
    window.requestAnimationFrame(() => {
      document.getElementById("park-create-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      document.getElementById("park-name")?.focus();
    });
  }

  function updateAdminPhoto(file: File | null) {
    if (adminPhotoPreviewRef.current) {
      URL.revokeObjectURL(adminPhotoPreviewRef.current);
      adminPhotoPreviewRef.current = null;
    }

    if (!file) {
      setAdminPhoto(null);
      setAdminPhotoPreview(null);
      clearFieldError("photo");
      return;
    }

    const validation = validateParkPhotoMetadata(file);
    if (!validation.success) {
      setAdminPhoto(null);
      setAdminPhotoPreview(null);
      setFormErrors((current) => ({ ...current, photo: validation.error }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    adminPhotoPreviewRef.current = previewUrl;
    setAdminPhoto(file);
    setAdminPhotoPreview(previewUrl);
    clearFieldError("photo");
  }

  function addPendingParkPhotos(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    for (const file of files) {
      const validation = validateParkPhotoMetadata(file);
      if (!validation.success) {
        toast.error(validation.error);
        return;
      }
    }

    const existingNames = new Set(
      pendingParkPhotos.map((photo) => `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`)
    );
    const uniqueFiles = files.filter((file) => {
      const signature = `${file.name}:${file.size}:${file.lastModified}`;
      if (existingNames.has(signature)) return false;
      existingNames.add(signature);
      return true;
    });
    if (parkPhotos.length + pendingParkPhotos.length + uniqueFiles.length > PARK_PHOTO_MAX_COUNT) {
      toast.error(`A park can have no more than ${PARK_PHOTO_MAX_COUNT} photos.`);
      return;
    }

    setPendingParkPhotos((current) => [
      ...current,
      ...uniqueFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        pendingParkPhotoUrlsRef.current.add(previewUrl);
        return { id: crypto.randomUUID(), file, previewUrl };
      }),
    ]);
  }

  function removePendingParkPhoto(id: string) {
    setPendingParkPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
        pendingParkPhotoUrlsRef.current.delete(photo.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  async function uploadPendingParkPhotos(parkId: number) {
    if (!pendingParkPhotos.length) return 0;

    const formData = new FormData();
    pendingParkPhotos.forEach((photo) => formData.append("photos", photo.file));
    const response = await fetch(`/api/admin/parks/${parkId}/photos`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const apiError = await parseApiError(response);
      if (apiError.unauthorized) {
        toast.error(apiError.message);
        redirectToLogin();
      }
      throw new Error(apiError.message || "Unable to upload park photos.");
    }
    const payload = (await response.json()) as AdminParkPhotosResponse;
    setParkPhotos(payload.photos);
    if (payload.park) applyUpdatedPark(payload.park);
    const uploadedCount = pendingParkPhotos.length;
    pendingParkPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pendingParkPhotoUrlsRef.current.clear();
    setPendingParkPhotos([]);
    return uploadedCount;
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

  function applyUpdatedPark(updatedPark: AdminParkDetail) {
    setParks((current) => {
      if (
        qrStatusFilter !== "ALL" &&
        updatedPark.qrStatus !== qrStatusFilter
      ) {
        return current.filter((park) => park.id !== updatedPark.id);
      }
      if (
        (parkStatusFilter === "ACTIVE" && updatedPark.deletedAt) ||
        (parkStatusFilter === "ARCHIVED" && !updatedPark.deletedAt)
      ) {
        return current.filter((park) => park.id !== updatedPark.id);
      }
      return current.map((park) =>
        park.id === updatedPark.id ? toParkSummary(updatedPark) : park
      );
    });
    setSelectedPark(updatedPark);
  }

  async function loadParkPhotos(parkId: number) {
    setIsParkPhotosLoading(true);
    setParkPhotos([]);

    try {
      const response = await fetch(`/api/admin/parks/${parkId}/photos`);

      if (!response.ok) {
        const apiError = await parseApiError(response);

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as AdminParkPhotosResponse;
      setParkPhotos(payload.photos);
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to load park photos."));
    } finally {
      setIsParkPhotosLoading(false);
    }
  }

  async function updateParkPhoto(
    photoId: number,
    action: "SET_PRIMARY" | "HIDE" | "RESTORE" | "DELETE"
  ) {
    if (!selectedPark) {
      return;
    }

    setUpdatingPhotoId(photoId);

    try {
      const response = await fetch(
        `/api/admin/parks/${selectedPark.id}/photos/${photoId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      if (!response.ok) {
        const apiError = await parseApiError(response);

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as AdminParkPhotoUpdateResponse;
      setParkPhotos(payload.photos);

      if (payload.park && selectedPark) {
        applyUpdatedPark({
          ...selectedPark,
          ...payload.park,
        });
      }

      setMapRefreshVersion((current) => current + 1);

      toast.success(action === "DELETE" ? "Park photo removed." : "Park photo updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update this photo."));
    } finally {
      setUpdatingPhotoId(null);
    }
  }

  async function deleteSelectedParkPhoto() {
    if (!photoDeleteCandidate) return;
    await updateParkPhoto(photoDeleteCandidate.id, "DELETE");
    setPhotoDeleteCandidate(null);
  }

  async function submitCreate(payload: ParkMutationPayload) {
    try {
      const params = new URLSearchParams({
        lat: String(payload.lat),
        lon: String(payload.lon),
        radius: String(PARK_DUPLICATE_WARNING_RADIUS_METERS),
      });
      const response = await fetch(`/api/parks/nearby-check?${params}`);
      if (response.ok) {
        const result = (await response.json()) as {
          nearbyParks: Array<{
            id: number;
            name: string;
            distanceMeters: number;
          }>;
        };
        const duplicate = result.nearbyParks[0];
        if (duplicate) {
          setDuplicateCandidate({
            existingPark: duplicate,
            distanceMeters: duplicate.distanceMeters,
            payload,
          });
          return;
        }
      }
    } catch (error) {
      console.error("Unable to check nearby parks.", error);
    }

    await createPark(payload);
  }

  async function createPark(payload: ParkMutationPayload) {
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      if (adminPhoto) {
        formData.set("photo", adminPhoto);
      }

      const response = await fetch("/api/parks", {
        method: "POST",
        body: formData,
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

      const createdPublicPark = (await response.json()) as ParkDetail;
      const detailResponse = await fetch(
        `/api/admin/parks/${createdPublicPark.id}`
      );
      if (!detailResponse.ok) {
        throw new Error(
          "Park was created, but its admin details could not load."
        );
      }
      const createdPark = (await detailResponse.json()) as AdminParkDetail;
      const nextParks = [
        toParkSummary(createdPark),
        ...parks.filter((park) => park.id !== createdPark.id),
      ];

	      setParks(nextParks);
	      setSelectedPark(createdPark);
	      setParkPhotos([]);
      resetForm();
      setMapRefreshVersion((current) => current + 1);
      void loadParkPhotos(createdPark.id);
      void loadQrCounts();
      toast.success("Park created successfully.");
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

      await response.json();
      const detailResponse = await fetch(`/api/admin/parks/${editingParkId}`);
      if (!detailResponse.ok) {
        throw new Error(
          "Park was updated, but its admin details could not load."
        );
      }
      const updatedPark = (await detailResponse.json()) as AdminParkDetail;
      const nextParks = parks.map((park) =>
        park.id === editingParkId ? toParkSummary(updatedPark) : park
      );

      setParks(nextParks);
      setSelectedPark(updatedPark);
      let uploadedCount = 0;
      try {
        uploadedCount = await uploadPendingParkPhotos(editingParkId);
      } catch (photoError) {
        // The park details have been saved. Keep the queued files and form
        // values available so an administrator can retry without re-entering.
        toast.error(
          getErrorMessage(
            photoError,
            "Park details saved, but one or more photos could not be uploaded. Please retry."
          )
        );
        return;
      }
      resetForm();
      setMapRefreshVersion((current) => current + 1);
      toast.success(
        uploadedCount
          ? `Park updated and ${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded.`
          : "Park updated successfully."
      );
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
	        setSelectedParkPreview(null);
	        setParkPhotos([]);
	      }

      if (editingParkId === deleteCandidate.id) {
        resetForm();
      }

      setDeleteCandidate(null);
      void loadQrCounts();
      toast.success("Park deleted successfully.");
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

  async function startEditing(
    park: Pick<ParkSummary, "id"> & Partial<AdminParkMapSummary>
  ) {
    const selectionRequestId = ++adminSelectionRequestRef.current;
    // `selectedPark` holds the previous full detail response. Clear it before
    // publishing the new list preview so the map can focus this park once,
    // rather than continuing to receive the prior park until this fetch ends.
    setSelectedPark(null);

    if (
      typeof park.lat === "number" &&
      typeof park.lon === "number" &&
      typeof park.updatedAt === "string" &&
      typeof park.qrStatus === "string" &&
      typeof park.equipmentCount === "number" &&
      typeof park.submissionStatus === "string"
    ) {
      setSelectedParkPreview(park as AdminParkMapSummary);
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    setParkPhotos([]);
    try {
      const response = await fetch(`/api/admin/parks/${park.id}`);

      if (!response.ok) {
        const apiError = await parseApiError(response);

        if (apiError.unauthorized) {
          toast.error(apiError.message);
          redirectToLogin();
          return;
        }

        throw new Error(apiError.message);
      }

      const fullPark = (await response.json()) as AdminParkDetail;

      // A later list/map selection owns the current detail panel. Do not let
      // a stale authenticated-admin response replace its marker or camera.
      if (selectionRequestId !== adminSelectionRequestRef.current) return;

      setSelectedPark(fullPark);
      setSelectedParkPreview(toParkSummary(fullPark));
      void loadParkPhotos(fullPark.id);
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
        qrStatus: fullPark.qrStatus,
        qrCodeNote: fullPark.qrCodeNote ?? "",
      });
      setFormErrors({});
    } catch (error) {
      if (selectionRequestId !== adminSelectionRequestRef.current) return;
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
    if (reviewingSubmissionRef.current.has(reviewId)) {
      return;
    }

    reviewingSubmissionRef.current.add(reviewId);
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
      reviewingSubmissionRef.current.delete(reviewId);
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
  const selectedParkIsArchived =
    selectedPark !== null && isParkArchivedForAdminMap(selectedPark);
  const selectedParkIsFilteredOut =
    selectedPark !== null &&
    ((parkStatusFilter === "ACTIVE" && selectedParkIsArchived) ||
      (parkStatusFilter === "ARCHIVED" && !selectedParkIsArchived) ||
      (qrStatusFilter !== "ALL" && selectedPark.qrStatus !== qrStatusFilter));
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Manage parks and keep the public map data up to date.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/analytics">Analytics</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/rewards">Manage Rewards</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/exercises">Classify Exercises</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/nutrition/foods">Food Contributions</Link>
          </Button>
          <form action="/admin/logout" method="post">
            <Button type="submit" variant="outline">
              Logout
            </Button>
          </form>
        </div>
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

      <section className="mb-6 space-y-4" aria-labelledby="qr-deployment-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="qr-deployment-title" className="text-xl font-semibold">
              QR deployment
            </h2>
            <p className="text-sm text-muted-foreground">
              Track sticker installation and replacement across parks.
            </p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="admin-qr-filter" className="text-sm font-medium">
              QR status
            </label>
            <Select
              value={qrStatusFilter}
              onValueChange={(value) => {
                const nextStatus = value as ParkQrStatus | "ALL";
                setQrStatusFilter(nextStatus);
                const url = new URL(window.location.href);
                if (nextStatus === "ALL") {
                  url.searchParams.delete("qrStatus");
                } else {
                  url.searchParams.set("qrStatus", nextStatus);
                }
                window.history.replaceState(null, "", url);
              }}
            >
              <SelectTrigger id="admin-qr-filter" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All parks</SelectItem>
                <SelectItem value="INSTALLED">Has QR</SelectItem>
                <SelectItem value="NOT_INSTALLED">No QR</SelectItem>
                <SelectItem value="NEEDS_REPLACEMENT">
                  Needs replacement
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="admin-park-status-filter" className="text-sm font-medium">
              Park status
            </label>
            <Select
              value={parkStatusFilter}
              onValueChange={(value) => {
                const nextStatus = value as ParkArchiveStatus;
                setParkStatusFilter(nextStatus);
                const url = new URL(window.location.href);
                if (nextStatus === "ACTIVE") {
                  url.searchParams.delete("parkStatus");
                } else {
                  url.searchParams.set("parkStatus", nextStatus);
                }
                window.history.replaceState(null, "", url);
              }}
            >
              <SelectTrigger id="admin-park-status-filter" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active parks</SelectItem>
                <SelectItem value="ARCHIVED">Archived parks</SelectItem>
                <SelectItem value="ALL">All parks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total parks", qrCounts?.total],
            ["QR installed", qrCounts?.installed],
            ["No QR", qrCounts?.notInstalled],
            ["Needs replacement", qrCounts?.needsReplacement],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <p className="text-xs leading-tight text-muted-foreground sm:text-sm">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {typeof value === "number" ? value.toLocaleString() : "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div ref={mapSectionRef} className="scroll-mt-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            {selectedParkIsFilteredOut && selectedPark ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <span>
                  {selectedPark.name} is outside the current map filters.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setParkStatusFilter(selectedParkIsArchived ? "ARCHIVED" : "ACTIVE");
                    setQrStatusFilter("ALL");
                  }}
                >
                  {selectedParkIsArchived ? "Show Archived" : "Show Active"}
                </Button>
              </div>
            ) : null}
            <AdminParksMap
              refreshToken={mapRefreshVersion}
              qrStatusFilter={qrStatusFilter}
              parkStatusFilter={parkStatusFilter}
              onParkUpdated={(updatedPark) => {
                applyUpdatedPark(updatedPark);
                void loadQrCounts();
              }}
              selectedPark={selectedPark ?? selectedParkPreview}
              onParkSelected={(park) => {
                if (
                  selectedPark?.id !== park.id &&
                  selectedParkPreview?.id !== park.id
                ) {
                  void startEditing(park);
                }
              }}
              onParkPlacement={beginMapParkCreate}
              placementResetToken={placementResetToken}
            />
          </CardContent>
        </Card>
        </div>
      </section>

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
                    {submission.nearbyParkWarning &&
                    submission.closestNearbyPark ? (
                      <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                        <Badge variant="destructive">
                          Potential duplicate park
                        </Badge>
                        <p>
                          <span className="font-medium">
                            Closest existing park:
                          </span>{" "}
                          <Link
                            href={`/parks/${submission.closestNearbyPark.id}`}
                            target="_blank"
                            className="underline underline-offset-4"
                          >
                            {submission.closestNearbyPark.name}
                          </Link>
                        </p>
                        <p className="text-muted-foreground">
                          Distance:{" "}
                          {Math.round(
                            submission.closestNearbyParkDistanceMeters ?? 0
                          )}{" "}
                          m
                        </p>
                      </div>
                    ) : null}
                    {submission.photoUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {submission.photoUrls.map((photoUrl, index) => {
                          const verification =
                            submission.photoLocationVerifications[index] ?? {
                              locationStatus: "NO_GPS_DATA" as const,
                              locationDistanceMeters: null,
                              locationSource: "NONE" as const,
                            };

                          return (
                            <div
                              key={photoUrl}
                              className="w-full max-w-sm overflow-hidden rounded-lg border"
                            >
                              <a
                                href={photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block aspect-video bg-muted bg-cover bg-center"
                                style={{ backgroundImage: `url("${photoUrl}")` }}
                                aria-label={`Open submitted park photo ${index + 1}`}
                              />
                              <div className="space-y-2 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={photoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium underline underline-offset-4"
                                >
                                  View photo {index + 1}
                                </a>
                                <Badge
                                  variant={getPhotoLocationBadgeVariant(
                                    verification.locationStatus
                                  )}
                                >
                                  {getPhotoLocationBadgeLabel(
                                    verification.locationStatus,
                                    verification.locationSource
                                  )}
                                </Badge>
                                </div>
                              </div>
                              {verification.locationSource ===
                              "BROWSER_GEOLOCATION" ? (
                                <p className="text-xs text-muted-foreground">
                                  Photo GPS was unavailable, so this used the
                                  submitter&apos;s browser location at submission
                                  time.
                                </p>
                              ) : null}
                              {verification.locationStatus === "MISMATCH" ? (
                                <p className="text-xs text-destructive">
                                  Location signal is approximately{" "}
                                  {formatPhotoLocationDistance(
                                    verification.locationDistanceMeters
                                  )}{" "}
                                  from the selected park.
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
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

      <Card id="park-create-form" className="mb-6">
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
              <p className="text-sm text-muted-foreground">
                Use the park management map above to verify the location, then
                enter the coordinates here. This keeps one canonical map for
                searching, editing, and deployment work.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="park-latitude" className="text-sm font-medium">
                    Latitude
                  </label>
                  <Input
                    id="park-latitude"
                    placeholder="Latitude"
                    value={formValues.lat}
                    onChange={(event) => updateTextField("lat", event.target.value)}
                    aria-invalid={formErrors.lat ? true : undefined}
                  />
                  {formErrors.lat ? <p className="text-xs text-destructive">{formErrors.lat}</p> : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="park-longitude" className="text-sm font-medium">
                    Longitude
                  </label>
                  <Input
                    id="park-longitude"
                    placeholder="Longitude"
                    value={formValues.lon}
                    onChange={(event) => updateTextField("lon", event.target.value)}
                    aria-invalid={formErrors.lon ? true : undefined}
                  />
                  {formErrors.lon ? <p className="text-xs text-destructive">{formErrors.lon}</p> : null}
                </div>
              </div>
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

          {!editingParkId ? (
            <fieldset className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">
                QR Deployment
              </legend>
              <div className="grid gap-2">
                <label htmlFor="park-qr-status" className="text-sm font-medium">
                  Status
                </label>
                <Select
                  value={formValues.qrStatus ?? "NOT_INSTALLED"}
                  onValueChange={(value) =>
                    updateTextField("qrStatus", value)
                  }
                >
                  <SelectTrigger id="park-qr-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARK_QR_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="park-qr-note" className="text-sm font-medium">
                  Deployment note <span className="text-muted-foreground">(optional)</span>
                </label>
                <NoteTextarea
                  id="park-qr-note"
                  value={formValues.qrCodeNote ?? ""}
                  onChange={(event) => updateTextField("qrCodeNote", event.target.value)}
                  placeholder="Sticker placement or replacement note"
                  aria-invalid={formErrors.qrCodeNote ? true : undefined}
                />
                {formErrors.qrCodeNote ? (
                  <p className="text-xs text-destructive">{formErrors.qrCodeNote}</p>
                ) : null}
              </div>
            </fieldset>
          ) : null}

          {!editingParkId ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Park photo</p>
                <p className="text-xs text-muted-foreground">
                  Admin-created parks publish this photo immediately after the
                  park is saved.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor="admin-park-photo"
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
                >
                  <ImagePlus className="size-4" aria-hidden />
                  {adminPhoto ? "Replace photo" : "Choose photo"}
                </label>
                <Input
                  id="admin-park-photo"
                  type="file"
                  accept={PARK_PHOTO_ACCEPT}
                  className="sr-only"
                  onChange={(event) =>
                    updateAdminPhoto(event.target.files?.[0] ?? null)
                  }
                  aria-invalid={formErrors.photo ? true : undefined}
                />
                {adminPhoto ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateAdminPhoto(null)}
                  >
                    <X aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>

              {formErrors.photo ? (
                <p className="text-xs text-destructive" role="alert">
                  {formErrors.photo}
                </p>
              ) : null}

              {adminPhotoPreview && adminPhoto ? (
                <div className="max-w-md overflow-hidden rounded-lg border">
                  <div
                    className="aspect-video bg-muted bg-cover bg-center"
                    style={{
                      backgroundImage: `url("${adminPhotoPreview}")`,
                    }}
                    role="img"
                    aria-label={`Preview of ${adminPhoto.name}`}
                  />
                  <p className="truncate p-3 text-xs text-muted-foreground">
                    {adminPhoto.name}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
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

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Submission</p>
                  {selectedPark.submission.submitter ? (
                    <dl className="mt-3 space-y-2 text-sm">
                      <div><dt className="text-muted-foreground">Submitted by</dt><dd className="font-medium">{selectedPark.submission.submitter.name ?? selectedPark.submission.submitter.email ?? "Unknown user"}</dd></div>
                      {selectedPark.submission.submitter.email ? <div><dt className="text-muted-foreground">Email</dt><dd>{selectedPark.submission.submitter.email}</dd></div> : null}
                      <div><dt className="text-muted-foreground">User ID</dt><dd className="break-all text-xs text-muted-foreground">{selectedPark.submission.submitter.id}</dd></div>
                    </dl>
                  ) : <p className="mt-3 text-sm text-muted-foreground">{selectedPark.submission.source === "UNKNOWN_LEGACY_SOURCE" ? "Unknown legacy source" : "Imported park"}</p>}
                  <dl className="mt-3 space-y-2 text-sm"><div><dt className="text-muted-foreground">Submitted</dt><dd>{new Date(selectedPark.submission.submittedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{selectedPark.submissionStatus}</Badge></dd></div></dl>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Photo GPS verification</p>
                  <p className="mt-3 text-sm text-muted-foreground">Pinned coordinates: {selectedPark.gpsVerification.pinned.lat}, {selectedPark.gpsVerification.pinned.lon}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={getPhotoLocationBadgeVariant(selectedPark.gpsVerification.status)}>{getPhotoLocationBadgeLabel(selectedPark.gpsVerification.status, "PHOTO_EXIF")}</Badge><span className="text-sm text-muted-foreground">{selectedPark.gpsVerification.gpsPhotoCount} photo{selectedPark.gpsVerification.gpsPhotoCount === 1 ? "" : "s"} with GPS metadata</span></div>
                  {selectedPark.gpsVerification.metadata ? <p className="mt-3 text-sm">Photo {selectedPark.gpsVerification.metadata.photoIndex}: {selectedPark.gpsVerification.metadata.lat}, {selectedPark.gpsVerification.metadata.lon} · {formatPhotoLocationDistance(selectedPark.gpsVerification.distanceMeters)}</p> : <p className="mt-3 text-sm text-muted-foreground">No GPS coordinates found in uploaded photos.</p>}
                  {selectedPark.gpsVerification.photos.filter((photo) => photo.locationSource === "PHOTO_EXIF").length > 1 ? <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Photo GPS details</summary><ul className="mt-2 space-y-1 text-muted-foreground">{selectedPark.gpsVerification.photos.filter((photo) => photo.locationSource === "PHOTO_EXIF").map((photo) => <li key={photo.photoIndex}>Photo {photo.photoIndex}: {photo.photoLatitude}, {photo.photoLongitude} · {getPhotoLocationBadgeLabel(photo.locationStatus, photo.locationSource)} · {formatPhotoLocationDistance(photo.locationDistanceMeters)}</li>)}</ul></details> : null}
                </div>
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

              <ParkQrStatusControl
                park={selectedPark}
                onUpdated={(updatedPark) => {
                  applyUpdatedPark(updatedPark);
                  setMapRefreshVersion((current) => current + 1);
                  void loadQrCounts();
                }}
              />

	              <div className="space-y-3">
	                <div>
	                  <p className="text-sm font-medium">Park photos</p>
	                  <p className="text-sm text-muted-foreground">
	                    Add, remove, and choose the main public photo. The same
	                    JPEG, PNG, WebP, HEIC, and HEIF validation used for park
	                    submissions applies here.
	                  </p>
	                </div>

                  {editingParkId === selectedPark.id ? (
                    <div className="space-y-3 rounded-lg border border-dashed p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="admin-edit-park-photos"
                          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
                        >
                          <ImagePlus className="size-4" aria-hidden />
                          Add photos
                        </label>
                        <Input
                          id="admin-edit-park-photos"
                          type="file"
                          multiple
                          accept={PARK_PHOTO_ACCEPT}
                          className="sr-only"
                          onChange={(event) => {
                            addPendingParkPhotos(event.target.files);
                            event.currentTarget.value = "";
                          }}
                          disabled={isSubmitting}
                        />
                        <p className="text-xs text-muted-foreground">
                          Up to {PARK_PHOTO_MAX_COUNT} photos total. New photos upload when you save changes.
                        </p>
                      </div>

                      {pendingParkPhotos.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
                          {pendingParkPhotos.map((photo) => (
                            <div key={photo.id} className="overflow-hidden rounded-lg border bg-muted/30">
                              <div
                                className="h-32 bg-muted bg-cover bg-center"
                                role="img"
                                aria-label={`Preview of ${photo.file.name}`}
                                style={{ backgroundImage: `url("${photo.previewUrl}")` }}
                              />
                              <div className="flex items-center justify-between gap-2 p-2">
                                <p className="min-w-0 truncate text-xs" title={photo.file.name}>{photo.file.name}</p>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removePendingParkPhoto(photo.id)}
                                  disabled={isSubmitting}
                                  aria-label={`Remove pending photo ${photo.file.name}`}
                                >
                                  <X className="size-4" aria-hidden />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

	                {isParkPhotosLoading ? (
	                  <p className="text-sm text-muted-foreground">
	                    Loading park photos...
	                  </p>
	                ) : parkPhotos.length === 0 ? (
	                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
	                    No approved photos have been assigned to this park yet.
	                  </p>
	                ) : (
	                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	                    {parkPhotos.map((photo) => {
	                      const isUpdating = updatingPhotoId === photo.id;

	                      return (
	                        <div
	                          key={photo.id}
	                          className="overflow-hidden rounded-lg border bg-card"
	                        >
	                          <div
	                            aria-label={`Park photo ${photo.id}`}
	                            className="h-36 bg-muted bg-cover bg-center"
	                            role="img"
	                            style={{
	                              backgroundImage: `url("${photo.url}")`,
	                            }}
	                          />

	                          <div className="space-y-3 p-3">
	                            <div className="flex flex-wrap gap-2">
	                              {photo.isPrimary ? (
	                                <Badge>Main</Badge>
	                              ) : null}
	                              {photo.isHidden ? (
	                                <Badge variant="secondary">Hidden</Badge>
	                              ) : (
	                                <Badge variant="outline">Visible</Badge>
	                              )}
	                            </div>

	                            <p className="text-xs text-muted-foreground">
	                              Added{" "}
	                              {new Date(photo.createdAt).toLocaleDateString()}
	                            </p>

	                            {photo.uploadedBy?.email ||
	                            photo.uploadedBy?.name ? (
	                              <p className="text-xs text-muted-foreground">
	                                Uploaded by{" "}
	                                {photo.uploadedBy.email ??
	                                  photo.uploadedBy.name}
	                              </p>
	                            ) : null}

	                            <div className="flex flex-wrap gap-2">
	                              <Button asChild size="sm" variant="outline">
	                                <a
	                                  href={photo.url}
	                                  rel="noreferrer"
	                                  target="_blank"
	                                >
	                                  Open
	                                </a>
	                              </Button>

	                              {!photo.isPrimary || photo.isHidden ? (
	                                <Button
	                                  size="sm"
	                                  onClick={() =>
	                                    void updateParkPhoto(
	                                      photo.id,
	                                      "SET_PRIMARY"
	                                    )
	                                  }
	                                  disabled={Boolean(updatingPhotoId)}
	                                >
	                                  {isUpdating ? "Saving..." : "Set main"}
	                                </Button>
	                              ) : null}

	                              {photo.isHidden ? (
	                                <Button
	                                  size="sm"
	                                  variant="outline"
	                                  onClick={() =>
	                                    void updateParkPhoto(photo.id, "RESTORE")
	                                  }
	                                  disabled={Boolean(updatingPhotoId)}
	                                >
	                                  {isUpdating ? "Saving..." : "Restore"}
	                                </Button>
	                              ) : (
	                                <Button
	                                  size="sm"
	                                  variant="outline"
	                                  onClick={() => setPhotoDeleteCandidate(photo)}
	                                  disabled={Boolean(updatingPhotoId)}
	                                >
	                                  <Trash2 className="size-4" aria-hidden />
	                                  {isUpdating ? "Removing..." : "Remove"}
	                                </Button>
	                              )}
	                            </div>
	                          </div>
	                        </div>
	                      );
	                    })}
	                  </div>
	                )}
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

        {editingParkId || isMapPlacementDraft ? (
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
        {isParkSearchLoading
          ? "Loading parks…"
          : `${parks.length.toLocaleString()} loaded result${
              parks.length === 1 ? "" : "s"
            }`}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="hidden sm:table-header-group">
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>QR status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {search.trim().length === 1 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  Enter at least 2 characters to search parks.
                </TableCell>
              </TableRow>
            ) : !isParkSearchLoading && parks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No parks matched your search.
                </TableCell>
              </TableRow>
            ) : (
              parks.map((park) => (
                <TableRow
                  key={park.id}
                  onClick={() => void startEditing(park)}
                  className={`cursor-pointer border-l-2 hover:bg-muted/50 ${
                    selectedParkPreview?.id === park.id
                      ? "border-l-primary bg-primary/5"
                      : "border-l-transparent"
                  } ${
                    isParkArchivedForAdminMap(park)
                      ? "bg-muted/40 text-muted-foreground"
                      : ""
                  }`}
                >
                  <TableCell className="hidden w-16 py-2 text-xs tabular-nums sm:table-cell">
                    {park.id}
                  </TableCell>
                  <TableCell className="min-w-0 py-2 pl-3 sm:pl-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-5">
                          {park.name}
                        </p>
                        <p className="truncate text-xs leading-4 text-muted-foreground sm:hidden">
                          {park.address || "No address"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isParkArchivedForAdminMap(park) ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-4">
                            Archived
                          </Badge>
                        ) : null}
                        {park.submissionStatus === "REJECTED" ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-4">
                            Rejected
                          </Badge>
                        ) : null}
                        <span className="sm:hidden">
                          <ParkQrStatusBadge status={park.qrStatus} compact />
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-64 py-2 text-sm sm:table-cell">
                    <span className="block truncate">{park.address || "—"}</span>
                  </TableCell>
                  <TableCell className="hidden py-2 sm:table-cell">
                    <ParkQrStatusBadge status={park.qrStatus} compact />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {nextParkCursor ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            disabled={isParkSearchLoading}
            onClick={() =>
              void loadParkPage({ cursor: nextParkCursor, append: true })
            }
          >
            {isParkSearchLoading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(photoDeleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !updatingPhotoId) setPhotoDeleteCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove park photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the photo from this park. If no other park photo
              references the same R2 object, its stored image is removed after
              the database update succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(updatingPhotoId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(updatingPhotoId)}
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedParkPhoto();
              }}
            >
              {updatingPhotoId ? "Removing..." : "Remove photo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
