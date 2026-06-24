import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(244,244,245,1)_100%)] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_38%),linear-gradient(180deg,_rgba(9,9,11,1)_0%,_rgba(20,20,24,1)_100%)]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col">
        <div className="flex justify-end">
          <ThemeSwitcher />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-md border-border/60 bg-card/95 shadow-2xl backdrop-blur">
            <CardHeader className="space-y-4">
              <Badge variant="secondary" className="w-fit">
                Admin Access
              </Badge>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Calistheni Admin
                </h1>

                <p className="text-sm leading-6 text-muted-foreground">
                  Sign in with the shared admin password to manage parks before
                  launch.
                </p>
              </div>
            </CardHeader>

            <CardContent>
              <AdminLoginForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
