export const MODERATION_REPORT_TARGETS = [
  "WORKOUT",
  "COMMENT",
  "USER",
  "PARK",
  "PARK_PHOTO",
] as const;

export type ModerationReportTarget = (typeof MODERATION_REPORT_TARGETS)[number];

export const MODERATION_REPORT_REASONS = [
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE_SPEECH", label: "Hate speech or discrimination" },
  { value: "SEXUAL_CONTENT", label: "Sexual or inappropriate content" },
  { value: "VIOLENCE", label: "Violence or threats" },
  { value: "SPAM", label: "Spam or misleading content" },
  { value: "PRIVACY", label: "Privacy or personal information" },
  { value: "DANGEROUS_ACTIVITY", label: "Dangerous activity" },
  { value: "OTHER", label: "Something else" },
] as const;

export type ModerationReportReason = (typeof MODERATION_REPORT_REASONS)[number]["value"];

export const PARK_REPORT_REASONS = [
  { value: "SPAM", label: "Incorrect or misleading park information" },
  { value: "DANGEROUS_ACTIVITY", label: "Safety concern" },
  { value: "PRIVACY", label: "Privacy or personal information" },
  { value: "OTHER", label: "Something else" },
] as const satisfies readonly { value: ModerationReportReason; label: string }[];

export const MODERATION_REPORT_REASON_VALUES = MODERATION_REPORT_REASONS.map(
  ({ value }) => value
) as [ModerationReportReason, ...ModerationReportReason[]];
