"use client";

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
  mode: "create" | "edit";
  parkId?: number;
  initialValues?: ParkFormValues;
};

type ApiErrorPayload = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
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
  const [photo, setPhoto] = useState<File | null>(null);
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
  async function uploadParkPhoto(photo: File) {
    const formData = new FormData();
    formData.set("file", photo);

    const response = await fetch("/api/uploads/park-photo", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      throw new Error(payload?.error || "Unable to upload photo.");
    }

    return (await response.json()) as {
      photoUrl: string;
      key: string;
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
      let photoUrl: string | null = null;

      if (mode === "create" && photo) {
        const uploadedPhoto = await uploadParkPhoto(photo);
        photoUrl = uploadedPhoto.photoUrl;
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
                photoUrl,
              }),
            })
          : await fetch(`/api/user/parks/${parkId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(validationResult.data),
            });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        setFormErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      toast.success(
        mode === "create"
          ? "Park submitted for admin review."
          : "Park updated and sent back for review."
      );

      router.push("/my-parks");
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          mode === "create"
            ? "Unable to submit this park."
            : "Unable to update this park."
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
          {mode === "create" ? "Submit a Park" : "Edit Submitted Park"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "create"
            ? "Submissions are reviewed by an admin before they appear publicly."
            : "Saving changes sends the park back to admin review."}
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

        {mode === "create" ? (
          <div className="space-y-2">
            <label htmlFor="park-photo" className="text-sm font-medium">
              Camera photo
            </label>
            <Input
              id="park-photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                setPhoto(event.target.files?.[0] ?? null);
                clearFieldError("photo");
              }}
              aria-invalid={formErrors.photo ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Uses the device camera when supported. Some browsers may still
              allow gallery selection.
            </p>
            {formErrors.photo ? (
              <p className="text-xs text-destructive">{formErrors.photo}</p>
            ) : null}
          </div>
        ) : null}

        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Submitting..."
              : "Saving..."
            : mode === "create"
            ? "Submit for Review"
            : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
