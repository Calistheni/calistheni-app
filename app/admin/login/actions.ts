"use server";

import { redirect } from "next/navigation";
import { createAdminSession, validateAdminCredentials } from "@/lib/admin-auth";

export type LoginActionState = {
  error: string | null;
};
export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const username = formData.get("username");
  const password = formData.get("password");

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !validateAdminCredentials(username, password)
  ) {
    return {
      error: "Invalid username or password. Please try again.",
    };
  }

  await createAdminSession();

  redirect("/admin");
}
