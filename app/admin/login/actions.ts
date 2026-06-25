"use server";

import { redirect } from "next/navigation";
import {
  clearFailedAdminLoginAttempts,
  createAdminSession,
  getAdminLoginRateLimitStatus,
  recordFailedAdminLoginAttempt,
  validateAdminPassword,
} from "@/lib/admin-auth";

export type LoginActionState = {
  error: string | null;
};

function formatRetryMessage(retryAfterMs: number) {
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));

  return `Too many login attempts. Please wait about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"} and try again.`;
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const rateLimitStatus = await getAdminLoginRateLimitStatus();

  if (rateLimitStatus.limited) {
    return {
      error: formatRetryMessage(rateLimitStatus.retryAfterMs),
    };
  }

  const password = formData.get("password");

  if (typeof password !== "string" || !validateAdminPassword(password)) {
    await recordFailedAdminLoginAttempt();
    return {
      error: "Invalid password. Please try again.",
    };
  }

  await clearFailedAdminLoginAttempts();
  await createAdminSession();

  redirect("/admin");
}
