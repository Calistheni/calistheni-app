import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Profile",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">
            {session.user.email ?? session.user.name ?? "Signed in user"}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/submit-park">Submit Park</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/my-parks">My Parks</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Open Map</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
