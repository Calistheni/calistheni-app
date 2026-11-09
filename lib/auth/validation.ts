import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);
export const passwordSchema = z.string().min(12).max(1024);

export const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(1024),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().max(1024),
  redirectTo: z.string().optional(),
});
