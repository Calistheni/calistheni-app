"use client";

import * as exifr from "exifr";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { toast } from "sonner";
import {
  getParkFormErrors,
  validateParkMutation,
} from "@/lib/validation/parks";
import {
  PARK_PHOTO_ACCEPT,
  validateParkPhotoMetadata,
} from "@/lib/park-photo-file";
import {
  formatPhotoLocationDistance,
  verifyPhotoLocation,
  type PhotoLocationSource,
  type PhotoLocationStatus,
  type PhotoLocationVerificationDraft,
} from "@/lib/photo-location-verification";
import type {
  ParkFormErrors,
  ParkFormValues,
  ParkMutationPayload,
} from "@/types/park";

type Equipment = {
  id: number;
  name: string;
};

type ParkSubmissionFormProps = {
  equipment: Equipment[];
  mode: "create" | "suggest-edit";
  parkId?: number;
  initialValues?: ParkFormValues;
};

type ApiErrorPayload = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  nearbyParks?: NearbyPark[];
};

type UploadedPhoto = {
  photoUrl: string;
  key: string;
  locationVerification: PhotoLocationVerificationDraft;
};

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  isLocationVerified: boolean;
  locationVerification: PhotoLocationVerificationDraft;
};

type LocationWarning = {
  data: ParkMutationPayload;
  photos: SelectedPhoto[];
  allowNearbyPark?: boolean;
};

type NearbyPark = {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  distanceMeters: number;
};

type NearbyParkWarning = {
  data: ParkMutationPayload;
  nearbyParks: NearbyPark[];
};

type GpsCoordinates = {
  latitude: number;
  longitude: number;
};

const EMPTY_FORM_VALUES: ParkFormValues = {
  name: "",
  title: "",
  address: "",
  lat: "",
  lon: "",
  equipmentIds: [],
};
function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function getCompressedFileName(file: File) {
  const name = file.name.replace(/\.[^.]+$/, "");

  return `${name || "park-photo"}.jpg`;
}

function formatFileSize(file: File) {
  return `${(file.size / 1024 / 1024).toFixed(2)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toCoordinate(value: unknown, ref: unknown) {
  const directValue = toFiniteNumber(value);

  if (directValue !== null) {
    return ref === "S" || ref === "W"
      ? Math.abs(directValue) * -1
      : directValue;
  }

  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const degrees = toFiniteNumber(value[0]);
  const minutes = toFiniteNumber(value[1]);
  const seconds = toFiniteNumber(value[2]);

  if (degrees === null || minutes === null || seconds === null) {
    return null;
  }

  const decimalDegrees = Math.abs(degrees) + minutes / 60 + seconds / 3600;

  return ref === "S" || ref === "W" ? decimalDegrees * -1 : decimalDegrees;
}

function getGpsFromMetadata(metadata: unknown): GpsCoordinates | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const latitude =
    toCoordinate(metadata.latitude, null) ??
    toCoordinate(metadata.GPSLatitude, metadata.GPSLatitudeRef);
  const longitude =
    toCoordinate(metadata.longitude, null) ??
    toCoordinate(metadata.GPSLongitude, metadata.GPSLongitudeRef);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function createPhotoId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function getInitialPhotoVerification(): PhotoLocationVerificationDraft {
  return {
    locationStatus: "NO_GPS_DATA",
    locationDistanceMeters: null,
    locationSource: "NONE",
    photoLatitude: null,
    photoLongitude: null,
    deviceLatitude: null,
    deviceLongitude: null,
  };
}

function getPhotoStatusLabel(
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

function getBrowserGeolocation() {
  return new Promise<{ latitude: number; longitude: number } | null>(
    (resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          if (process.env.NODE_ENV === "development") {
            console.info("Unable to read browser geolocation.", error);
          }

          resolve(null);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 10_000,
        }
      );
    }
  );
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;

    return {
      message:
        payload.error || "Something went wrong. Please try again in a moment.",
      errors: getParkFormErrors(payload.fieldErrors),
      nearbyParks: payload.nearbyParks,
    };
  } catch {
    return {
      message: "Something went wrong. Please try again in a moment.",
      errors: {},
      nearbyParks: undefined,
    };
  }
}

export function ParkSubmissionForm({
  equipment,
  mode,
  parkId,
  initialValues = EMPTY_FORM_VALUES,
}: ParkSubmissionFormProps) {
  const router = useRouter();
  const [formValues, setFormValues] = useState<ParkFormValues>(initialValues);
  const [formErrors, setFormErrors] = useState<ParkFormErrors>({});
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const photoPreviewUrlsRef = useRef(new Set<string>());
  const [isCheckingNearbyParks, setIsCheckingNearbyParks] = useState(false);
  const [isVerifyingPhotos, setIsVerifyingPhotos] = useState(false);
  const [locationWarning, setLocationWarning] =
    useState<LocationWarning | null>(null);
  const [nearbyParkWarning, setNearbyParkWarning] =
    useState<NearbyParkWarning | null>(null);

  useEffect(() => {
    const previewUrls = photoPreviewUrlsRef.current;

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    };
  }, []);

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

  async function compressParkPhoto(photo: File) {
    if (process.env.NODE_ENV === "development") {
      console.info("Selected park photo", {
        name: photo.name,
        type: photo.type,
        size: photo.size,
      });
    }

    try {
      const compressedPhoto = await imageCompression(photo, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      const uploadablePhoto = new File(
        [compressedPhoto],
        getCompressedFileName(photo),
        {
          type: compressedPhoto.type || "image/jpeg",
          lastModified: Date.now(),
        }
      );

      if (process.env.NODE_ENV === "development") {
        console.info("Compressed park photo", {
          name: uploadablePhoto.name,
          type: uploadablePhoto.type,
          originalSize: photo.size,
          compressedSize: uploadablePhoto.size,
        });
      }

      return uploadablePhoto;
    } catch (error) {
      console.error("Park photo compression failed.", error);
      throw new Error(
        `Unable to compress ${photo.name || "this photo"}. ${
          photo.type === "image/heic" || photo.type === "image/heif"
            ? "This browser may not support HEIC uploads. Please try JPEG if it keeps failing."
            : "Please try a different image."
        }`
      );
    }
  }

  async function uploadParkPhoto(photo: File) {
    const compressedPhoto = await compressParkPhoto(photo);
    const formData = new FormData();
    formData.set("file", compressedPhoto);

    const response = await fetch("/api/uploads/park-photo", {
      method: "POST",
      body: formData,
    });

    const text = await response.text();

    let payload: { error?: string; photoUrl?: string; key?: string } | null =
      null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        payload?.error ||
          `Upload failed with status ${response.status}: ${
            text || response.statusText
          }`
      );
    }

    if (!payload?.photoUrl || !payload?.key) {
      throw new Error(`Upload response was invalid: ${text}`);
    }

    return {
      photoUrl: payload.photoUrl,
      key: payload.key,
    };
  }

  async function readPhotoGps(photo: File): Promise<GpsCoordinates | null> {
    try {
      const gps = await exifr.gps(photo);

      if (
        typeof gps?.latitude !== "number" ||
        typeof gps?.longitude !== "number"
      ) {
        return null;
      }

      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
      };
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.info("Fast photo GPS parse failed.", {
          name: photo.name,
          type: photo.type,
          error,
        });
      }
    }

    try {
      const metadata = (await exifr.parse(photo, {
        gps: true,
        xmp: true,
        mergeOutput: true,
        reviveValues: true,
        translateKeys: true,
      })) as unknown;
      const gps = getGpsFromMetadata(metadata);

      if (process.env.NODE_ENV === "development") {
        console.info("Fallback photo metadata parse result.", {
          name: photo.name,
          type: photo.type,
          size: photo.size,
          hasGps: Boolean(gps),
          metadataKeys: isRecord(metadata) ? Object.keys(metadata).sort() : [],
        });
      }

      return gps;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.info("Fallback photo metadata parse failed.", {
          name: photo.name,
          type: photo.type,
          error,
        });
      }

      return null;
    }
  }

  async function verifyPhotosForPark(data: ParkMutationPayload) {
    if (!photos.length) {
      return [];
    }

    setIsVerifyingPhotos(true);

    try {
      const photoGpsResults = await Promise.all(
        photos.map((photo) => readPhotoGps(photo.file))
      );
      const deviceGps = photoGpsResults.some((gps) => !gps)
        ? await getBrowserGeolocation()
        : null;

      return photos.map((photo, index) => {
        const gps = photoGpsResults[index] ?? null;
        const locationVerification = gps
          ? {
              ...verifyPhotoLocation({
                photoLatitude: gps.latitude,
                photoLongitude: gps.longitude,
                locationSource: "PHOTO_EXIF",
                parkLatitude: data.lat,
                parkLongitude: data.lon,
              }),
              photoLatitude: gps.latitude,
              photoLongitude: gps.longitude,
              deviceLatitude: null,
              deviceLongitude: null,
            }
          : deviceGps
          ? {
              ...verifyPhotoLocation({
                photoLatitude: deviceGps.latitude,
                photoLongitude: deviceGps.longitude,
                locationSource: "BROWSER_GEOLOCATION",
                parkLatitude: data.lat,
                parkLongitude: data.lon,
              }),
              photoLatitude: null,
              photoLongitude: null,
              deviceLatitude: deviceGps.latitude,
              deviceLongitude: deviceGps.longitude,
            }
          : getInitialPhotoVerification();

        return {
          ...photo,
          isLocationVerified: true,
          locationVerification,
        };
      });
    } finally {
      setIsVerifyingPhotos(false);
    }
  }

  async function submitVerifiedPark(
    data: ParkMutationPayload,
    verifiedPhotos: SelectedPhoto[],
    options: { allowNearbyPark?: boolean } = {}
  ) {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      let response: Response;

      if (mode === "create") {
        const formData = new FormData();
        const selectedPhoto = verifiedPhotos[0] ?? null;
        formData.set(
          "payload",
          JSON.stringify({
                ...data,
                photoLocationVerifications: selectedPhoto
                  ? [selectedPhoto.locationVerification]
                  : [],
                allowNearbyPark: options.allowNearbyPark === true,
          })
        );

        if (selectedPhoto) {
          formData.set("photo", await compressParkPhoto(selectedPhoto.file));
        }

        response = await fetch("/api/user/parks", {
          method: "POST",
          body: formData,
        });
      } else {
        const uploadedPhotos: UploadedPhoto[] = [];
        for (const selectedPhoto of verifiedPhotos) {
          const uploadedPhoto = await uploadParkPhoto(selectedPhoto.file);
          uploadedPhotos.push({
            ...uploadedPhoto,
            locationVerification: selectedPhoto.locationVerification,
          });
        }

        response = await fetch(`/api/user/parks/${parkId}/edits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            photoUrls: uploadedPhotos.map((photo) => photo.photoUrl),
            photoKeys: uploadedPhotos.map((photo) => photo.key),
            photoLocationVerifications: uploadedPhotos.map(
              (photo) => photo.locationVerification
            ),
          }),
        });
      }

      if (!response.ok) {
        const apiError = await parseApiError(response);
        setFormErrors(apiError.errors);

        if (response.status === 409 && apiError.nearbyParks?.length) {
          setNearbyParkWarning({
            data,
            nearbyParks: apiError.nearbyParks,
          });
          return;
        }

        throw new Error(apiError.message);
      }

      toast.success(
        mode === "create"
          ? "Park submitted for admin review."
          : "Park edit submitted for admin review."
      );

      router.push(mode === "create" ? "/my-parks" : "/parks");
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          mode === "create"
            ? "Unable to submit this park."
            : "Unable to submit this park edit."
        )
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    const validationResult = validateParkMutation(formValues);

    if (!validationResult.success) {
      setFormErrors(validationResult.errors);
      return;
    }

    setFormErrors({});

    try {
      if (mode === "create") {
        const nearbyParks = await checkNearbyParks(validationResult.data);

        if (nearbyParks.length) {
          setNearbyParkWarning({
            data: validationResult.data,
            nearbyParks,
          });
          return;
        }
      }

      const verifiedPhotos = await verifyPhotosForPark(validationResult.data);
      setPhotos(verifiedPhotos);

      if (
        verifiedPhotos.some(
          (photo) => photo.locationVerification.locationStatus === "MISMATCH"
        )
      ) {
        setLocationWarning({
          data: validationResult.data,
          photos: verifiedPhotos,
        });
        return;
      }

      await submitVerifiedPark(validationResult.data, verifiedPhotos);
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to check photo location metadata.")
      );
    }
  }

  function submitWithoutMismatchedPhotos() {
    if (!locationWarning) {
      return;
    }

    const remainingPhotos = locationWarning.photos.filter(
      (photo) => photo.locationVerification.locationStatus !== "MISMATCH"
    );

    setPhotos(remainingPhotos);
    setLocationWarning(null);
    void submitVerifiedPark(locationWarning.data, remainingPhotos, {
      allowNearbyPark: locationWarning.allowNearbyPark === true,
    });
  }

  function continueWithMismatchedPhotos() {
    if (!locationWarning) {
      return;
    }

    setLocationWarning(null);
    void submitVerifiedPark(locationWarning.data, locationWarning.photos, {
      allowNearbyPark: locationWarning.allowNearbyPark === true,
    });
  }

  async function checkNearbyParks(data: ParkMutationPayload) {
    setIsCheckingNearbyParks(true);

    try {
      const searchParams = new URLSearchParams({
        lat: String(data.lat),
        lon: String(data.lon),
        radius: "100",
      });
      const response = await fetch(`/api/parks/nearby-check?${searchParams}`);

      if (!response.ok) {
        throw new Error("Unable to check for nearby parks. Please try again.");
      }

      const payload = (await response.json()) as { nearbyParks?: NearbyPark[] };

      return Array.isArray(payload.nearbyParks) ? payload.nearbyParks : [];
    } finally {
      setIsCheckingNearbyParks(false);
    }
  }

  async function continueWithNearbyPark() {
    if (!nearbyParkWarning) {
      return;
    }

    const data = nearbyParkWarning.data;
    setNearbyParkWarning(null);

    try {
      const verifiedPhotos = await verifyPhotosForPark(data);
      setPhotos(verifiedPhotos);

      if (
        verifiedPhotos.some(
          (photo) => photo.locationVerification.locationStatus === "MISMATCH"
        )
      ) {
        setLocationWarning({
          data,
          photos: verifiedPhotos,
          allowNearbyPark: true,
        });
        return;
      }

      await submitVerifiedPark(data, verifiedPhotos, {
        allowNearbyPark: true,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to submit this park."));
    }
  }

  function updateSelectedPhotos(fileList: FileList | null) {
    const selectedPhotos = Array.from(fileList ?? []);

    for (const photo of selectedPhotos) {
      const validation = validateParkPhotoMetadata(photo);
      if (!validation.success) {
        setFormErrors((current) => ({ ...current, photo: validation.error }));
        return;
      }
    }

    const maximumPhotos = mode === "create" ? 1 : 10;
    if (selectedPhotos.length > maximumPhotos) {
      setFormErrors((current) => ({
        ...current,
        photo: `Choose no more than ${maximumPhotos} photo${maximumPhotos === 1 ? "" : "s"}.`,
      }));
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.info(
        "Selected park photos",
        selectedPhotos.map((photo) => ({
          name: photo.name,
          type: photo.type,
          size: photo.size,
          sizeLabel: formatFileSize(photo),
        }))
      );
    }

    photos.forEach((photo) => {
      URL.revokeObjectURL(photo.previewUrl);
      photoPreviewUrlsRef.current.delete(photo.previewUrl);
    });

    setPhotos(
      selectedPhotos.map((photo, index) => {
        const previewUrl = URL.createObjectURL(photo);
        photoPreviewUrlsRef.current.add(previewUrl);

        return {
        id: createPhotoId(photo, index),
        file: photo,
        previewUrl,
        locationVerification: getInitialPhotoVerification(),
        isLocationVerified: false,
        };
      })
    );
    clearFieldError("photo");
  }

  function removeSelectedPhoto(photoId: string) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        photoPreviewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((photo) => photo.id !== photoId);
    });
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "Submit a Park" : "Suggest Park Edit"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "create"
            ? "Submissions are reviewed by an admin before they appear publicly."
            : "Your suggested changes are reviewed before the public park is updated."}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="user-park-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="user-park-name"
            value={formValues.name}
            onChange={(event) => updateTextField("name", event.target.value)}
            aria-invalid={formErrors.name ? true : undefined}
          />
          {formErrors.name ? (
            <p className="text-xs text-destructive">{formErrors.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="user-park-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="user-park-title"
            value={formValues.title}
            onChange={(event) => updateTextField("title", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="user-park-address" className="text-sm font-medium">
            Address
          </label>
          <Input
            id="user-park-address"
            value={formValues.address}
            onChange={(event) => updateTextField("address", event.target.value)}
          />
        </div>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Location</h2>
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
                <Button type="button" variant="outline">
                  Manual Coordinates
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="user-park-latitude"
                    className="text-sm font-medium"
                  >
                    Latitude
                  </label>
                  <Input
                    id="user-park-latitude"
                    value={formValues.lat}
                    onChange={(event) =>
                      updateTextField("lat", event.target.value)
                    }
                    aria-invalid={formErrors.lat ? true : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="user-park-longitude"
                    className="text-sm font-medium"
                  >
                    Longitude
                  </label>
                  <Input
                    id="user-park-longitude"
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

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Equipment</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {equipment.map((item) => (
              <label key={item.id} className="flex items-center gap-2">
                <Checkbox
                  checked={formValues.equipmentIds.includes(item.id)}
                  onCheckedChange={(checked) =>
                    updateEquipmentSelection(item.id, checked === true)
                  }
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
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {mode === "create" ? "Park photo" : "Photos"}
          </p>
          {mode === "create" ? (
            <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold">Use Photo Library for GPS check</p>
                <p>
                  On iPhone, choose <strong>Photo Library</strong>. Avoid{" "}
                  <strong>Take Photo</strong> because Safari may remove GPS
                  metadata from direct camera photos.
                </p>
              </div>
            </div>
          ) : null}
          <div>
            <label
              htmlFor="park-photo-library"
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            >
              Choose from Photos
            </label>
            <Input
              id="park-photo-library"
              className="sr-only"
              type="file"
              accept={PARK_PHOTO_ACCEPT}
              multiple={mode === "suggest-edit"}
              onChange={(event) => updateSelectedPhotos(event.target.files)}
              aria-invalid={formErrors.photo ? true : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "create"
              ? "This picker is configured for saved photo files, but iOS may still show camera options."
              : "Upload one or more photos to help the admin review this edit."}{" "}
            If photo GPS is unavailable, your browser may ask for location
            permission to help verify that you are near the selected park.
          </p>
          {formErrors.photo ? (
            <p className="text-xs text-destructive">{formErrors.photo}</p>
          ) : null}
          {photos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-lg border bg-muted/20"
                >
                  <div className="relative aspect-video bg-muted">
                    <Image
                      src={photo.previewUrl}
                      alt={`Preview of ${photo.file.name}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="absolute right-2 top-2"
                      onClick={() => removeSelectedPhoto(photo.id)}
                      aria-label={`Remove ${photo.file.name}`}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 p-3 text-xs">
                    <span className="min-w-0 truncate">{photo.file.name}</span>
                    <Badge
                      className="shrink-0"
                      variant={
                        photo.isLocationVerified &&
                        photo.locationVerification.locationStatus === "MISMATCH"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {photo.isLocationVerified
                        ? getPhotoStatusLabel(
                            photo.locationVerification.locationStatus,
                            photo.locationVerification.locationSource
                          )
                        : "Checked on submit"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <ImagePlus className="size-5" aria-hidden />
              No photo selected.
            </div>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || isCheckingNearbyParks || isVerifyingPhotos}
        >
          {isCheckingNearbyParks
            ? "Checking nearby parks..."
            : isVerifyingPhotos
            ? "Checking photos..."
            : isSubmitting
            ? mode === "create"
              ? "Submitting..."
              : "Saving..."
            : mode === "create"
            ? "Submit for Review"
            : "Submit Edit for Review"}
        </Button>
      </CardContent>

      <AlertDialog
        open={Boolean(nearbyParkWarning)}
        onOpenChange={(open) => {
          if (!open) {
            setNearbyParkWarning(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>A park already exists nearby</AlertDialogTitle>
            <AlertDialogDescription>
              We found an existing park very close to the location you selected.
              Please check whether you are submitting a duplicate park. If this
              is a different training area, you can continue anyway.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {nearbyParkWarning?.nearbyParks[0] ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <p>
                <span className="font-medium">Existing park:</span>{" "}
                {nearbyParkWarning.nearbyParks[0].name}
              </p>
              <p>
                <span className="font-medium">Distance:</span>{" "}
                {nearbyParkWarning.nearbyParks[0].distanceMeters} m away
              </p>
              {nearbyParkWarning.nearbyParks.length > 1 ? (
                <p className="text-muted-foreground">
                  {nearbyParkWarning.nearbyParks.length} existing parks were
                  found within 100 meters.
                </p>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(event) => {
                event.preventDefault();
                void continueWithNearbyPark();
              }}
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(locationWarning)}
        onOpenChange={(open) => {
          if (!open) {
            setLocationWarning(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Location does not match</AlertDialogTitle>
            <AlertDialogDescription>
              One or more selected photos or location checks appear to be far
              from the selected park location. Submitting unrelated or
              intentionally misleading park photos may result in restrictions or
              a ban from Calistheni.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 text-sm">
            {locationWarning?.photos
              .filter(
                (photo) =>
                  photo.locationVerification.locationStatus === "MISMATCH"
              )
              .map((photo) => (
                <div key={photo.id} className="rounded-lg border p-3">
                  <p className="font-medium">{photo.file.name}</p>
                  <p className="text-muted-foreground">
                    Approximately{" "}
                    {formatPhotoLocationDistance(
                      photo.locationVerification.locationDistanceMeters
                    )}{" "}
                    from the selected park.
                  </p>
                </div>
              ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="outline"
              onClick={submitWithoutMismatchedPhotos}
            >
              Remove Photo
            </AlertDialogAction>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={continueWithMismatchedPhotos}
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
