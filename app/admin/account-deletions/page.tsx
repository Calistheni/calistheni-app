import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDeletionReviews } from "@/components/admin/AccountDeletionReviews";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Account Deletion Reviews",
  robots: { index: false, follow: false },
};

export default async function AccountDeletionReviewsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <AccountDeletionReviews />;
}
