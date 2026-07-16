import { z } from "zod";

export const PARTNER_CATEGORIES = [
  "Supplements and nutrition",
  "Gym or calisthenics facility",
  "Healthy food and hospitality",
  "Physiotherapy and recovery",
  "Sportswear and equipment",
  "Climbing, parkour, or outdoor sports",
  "Fitness creator or service",
  "Other fitness or wellness business",
] as const;

const requiredText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(2, `${label} is required.`)
    .max(maximum, `${label} is too long.`);

export const partnerInquirySchema = z.object({
  businessName: requiredText("Business or brand name", 120),
  contactName: requiredText("Contact name", 100),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254, "Email is too long."),
  website: requiredText("Website or social profile", 300),
  category: z
    .union([
      z.enum(PARTNER_CATEGORIES, {
        error: "Choose a valid business category.",
      }),
      z.literal(""),
    ])
    .default(""),
  cityCountry: z.string().trim().max(120, "City and country is too long.").default(""),
  proposedReward: requiredText("Proposed reward or partnership idea", 1000),
  message: z
    .string()
    .trim()
    .max(2000, "Message is too long.")
    .transform((value) => (value === "" ? null : value)),
  companyFax: z.string().max(0, "Invalid submission."),
  startedAt: z.number().int().positive(),
});

export type PartnerInquiryInput = z.infer<typeof partnerInquirySchema>;
