"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  partnerInquirySchema,
  type PartnerInquiryInput,
} from "@/lib/partner-inquiries";

type FieldErrors = Partial<Record<keyof PartnerInquiryInput, string>>;

type ApiResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function getFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

export function PartnerInterestForm() {
  const startedAtRef = useRef(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      businessName: getFormValue(formData, "businessName"),
      contactName: getFormValue(formData, "contactName"),
      email: getFormValue(formData, "email"),
      website: getFormValue(formData, "website"),
      proposedReward: getFormValue(formData, "proposedReward"),
      message: getFormValue(formData, "message"),
      companyFax: getFormValue(formData, "companyFax"),
      startedAt: startedAtRef.current,
    };
    const parsed = partnerInquirySchema.safeParse(payload);

    setError(null);
    setIsSuccess(false);

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors(
        Object.fromEntries(
          Object.entries(flattened).flatMap(([key, messages]) =>
            messages?.[0] ? [[key, messages[0]]] : []
          )
        ) as FieldErrors
      );
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/partner-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const responseBody = (await response.json()) as ApiResponse;

      if (!response.ok) {
        if (responseBody.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(responseBody.fieldErrors).flatMap(
                ([key, messages]) =>
                  messages?.[0] ? [[key, messages[0]]] : []
              )
            ) as FieldErrors
          );
        }

        throw new Error(
          responseBody.error ??
            "We couldn't send your request. Please try again."
        );
      }

      form.reset();
      setIsSuccess(true);
      startedAtRef.current = Date.now();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "We couldn't send your request. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-7" noValidate onSubmit={handleSubmit}>
      {isSuccess ? (
        <Alert className="border-primary/40 bg-primary/5">
          <CheckCircle2 className="text-primary" aria-hidden="true" />
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>
            Thank you. We’ll review your idea and contact you using the email
            provided.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Request not sent</AlertTitle>
          <AlertDescription className="text-destructive/90">
            {error}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div className="space-y-2.5">
          <Label htmlFor="partner-contact-name">Name</Label>
          <Input
            className="h-11 px-3"
            id="partner-contact-name"
            name="contactName"
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.contactName)}
            aria-describedby={
              fieldErrors.contactName ? "partner-contact-name-error" : undefined
            }
          />
          <FieldError
            id="partner-contact-name-error"
            message={fieldErrors.contactName}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="partner-business-name">Business or brand name</Label>
          <Input
            className="h-11 px-3"
            id="partner-business-name"
            name="businessName"
            autoComplete="organization"
            aria-invalid={Boolean(fieldErrors.businessName)}
            aria-describedby={
              fieldErrors.businessName ? "partner-business-name-error" : undefined
            }
          />
          <FieldError
            id="partner-business-name-error"
            message={fieldErrors.businessName}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="partner-email">Email</Label>
          <Input
            className="h-11 px-3"
            id="partner-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "partner-email-error" : undefined}
          />
          <FieldError id="partner-email-error" message={fieldErrors.email} />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="partner-website">Website or Instagram</Label>
          <Input
            className="h-11 px-3"
            id="partner-website"
            name="website"
            autoComplete="url"
            placeholder="Website URL or @Instagram"
            aria-invalid={Boolean(fieldErrors.website)}
            aria-describedby={
              fieldErrors.website ? "partner-website-error" : undefined
            }
          />
          <FieldError
            id="partner-website-error"
            message={fieldErrors.website}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="partner-reward-idea">
          Reward or partnership idea
        </Label>
        <Textarea
          id="partner-reward-idea"
          name="proposedReward"
          rows={5}
          className="px-3 py-3"
          placeholder="Tell us what you could offer and who it would help."
          aria-invalid={Boolean(fieldErrors.proposedReward)}
          aria-describedby={
            fieldErrors.proposedReward ? "partner-reward-idea-error" : undefined
          }
        />
        <FieldError
          id="partner-reward-idea-error"
          message={fieldErrors.proposedReward}
        />
      </div>

      <div
        className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <Label htmlFor="partner-company-fax">Company fax</Label>
        <Input
          id="partner-company-fax"
          name="companyFax"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Send aria-hidden="true" />
        )}
        {isSubmitting ? "Sending request…" : "Become a partner"}
      </Button>
    </form>
  );
}
