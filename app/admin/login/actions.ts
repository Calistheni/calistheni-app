"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createAdminSession,
  authorizeAdminLogin,
} from "@/lib/admin-auth";

export type LoginActionState = {
  error: string | null;
};

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const adminName = formData.get("adminName");
  if (
    typeof adminName !== "string" ||
    adminName.trim().length < 2 ||
    adminName.trim().length > 80
  ) {
    return {
      error: "Enter your name so deployment changes can be attributed.",
    };
  }

  const request = new Request("https://localhost", { headers: await headers() });
  if (!(await authorizeAdminLogin(request, formData.get("password")))) {
    return { error: "Unable to sign in. Please try again." };
  }

  await createAdminSession(adminName.trim());

  redirect("/admin");
}
