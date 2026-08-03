import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { SupplementTracker } from "@/components/profile/SupplementTracker";
export default async function SupplementsPage() { const session = await auth(); if (!session?.user) redirect("/login"); return <main className="mx-auto w-full max-w-3xl p-4 pb-24 sm:p-6"><BackButton fallbackHref="/profile" /><div className="mb-6"><h1 className="text-3xl font-bold">Supplements</h1><p className="text-sm text-muted-foreground">Track your routine privately.</p></div><SupplementTracker /></main>; }
