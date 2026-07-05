"use client";

import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CoordinatePicker } from "@/components/CoordinatePicker";
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
import type { ParkFormErrors, ParkFormValues } from "@/types/park";

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
};

type UploadedPhoto = {
  photoUrl: string;
  key: string;
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

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;

    return {
      message: payload.error || "Request failed.",
      errors: getParkFormErrors(payload.fieldErrors),
    };
  } catch {
    return {
      message: "Request failed.",
      errors: {},
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
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  async function handleSubmit() {
    const validationResult = validateParkMutation(formValues);

    if (!validationResult.success) {
      setFormErrors(validationResult.errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const uploadedPhotos: UploadedPhoto[] = [];

      for (const selectedPhoto of photos) {
        const uploadedPhoto = await uploadParkPhoto(selectedPhoto);
        uploadedPhotos.push(uploadedPhoto);
      }

      const response =
        mode === "create"
          ? await fetch("/api/user/parks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...validationResult.data,
                photoUrl: uploadedPhotos[0]?.photoUrl ?? null,
                photoKey: uploadedPhotos[0]?.key ?? null,
              }),
            })
          : await fetch(`/api/user/parks/${parkId}/edits`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...validationResult.data,
                photoUrls: uploadedPhotos.map((photo) => photo.photoUrl),
                photoKeys: uploadedPhotos.map((photo) => photo.key),
              }),
            });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        setFormErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      toast.success(
        mode === "create"
          ? "Park submitted for admin review."
          : "Park edit submitted for admin review."
      );

      router.push(mode === "create" ? "/my-parks" : "/");
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
      setIsSubmitting(false);
    }
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
          <label htmlFor="park-photo" className="text-sm font-medium">
            {mode === "create" ? "Camera photo" : "Photos"}
          </label>
          <Input
            id="park-photo"
            type="file"
            accept="image/*"
            capture={mode === "create" ? "environment" : undefined}
            multiple={mode === "suggest-edit"}
            onChange={(event) => {
              const selectedPhotos = Array.from(event.target.files ?? []);

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

              setPhotos(selectedPhotos);
              clearFieldError("photo");
            }}
            aria-invalid={formErrors.photo ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">
            {mode === "create"
              ? "Uses the device camera when supported. Some browsers may still allow gallery selection."
              : "Upload one or more photos to help the admin review this edit."}
          </p>
          {formErrors.photo ? (
            <p className="text-xs text-destructive">{formErrors.photo}</p>
          ) : null}
        </div>

        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Submitting..."
              : "Saving..."
            : mode === "create"
            ? "Submit for Review"
            : "Submit Edit for Review"}
        </Button>
      </CardContent>
    </Card>
  );
}
