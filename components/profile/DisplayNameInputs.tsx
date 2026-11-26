"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPLAY_NAME_LIMIT, type DisplayNameErrors, type DisplayNameFields } from "@/lib/display-name";

export function DisplayNameInputs({
  value,
  onChange,
  errors,
  legacyName,
}: {
  value: DisplayNameFields;
  onChange: (field: keyof DisplayNameFields, value: string) => void;
  errors: DisplayNameErrors;
  legacyName?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      {legacyName ? (
        <p className="text-sm text-muted-foreground">
          Your current name was saved as one line. You can leave it together or move part of it into Family name.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["firstName", "First name", "given-name"],
          ["familyName", "Family name", "family-name"],
        ] as const).map(([field, label, autoComplete]) => {
          const inputId = `${id}-${field}`;
          return (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={inputId}>
                {label}{field === "familyName" ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
              </Label>
              <Input
                id={inputId}
                value={value[field]}
                onChange={(event) => onChange(field, event.target.value)}
                autoComplete={autoComplete}
                maxLength={DISPLAY_NAME_LIMIT}
                aria-required={field === "firstName"}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `${inputId}-error` : undefined}
              />
              {errors[field] ? (
                <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">{errors[field]}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
