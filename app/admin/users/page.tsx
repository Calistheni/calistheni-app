import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { adminUserFilters, getAdminUsers, type AdminUserFilter } from "@/lib/admin-user-insights";

export const metadata: Metadata = { title: "Admin Users", robots: { index: false, follow: false } };

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(value)) : "Not recorded"; }
function label(filter: AdminUserFilter) { return filter.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; cursor?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const params = await searchParams;
  const filter = (adminUserFilters as readonly string[]).includes(params.filter ?? "") ? params.filter as AdminUserFilter : "ALL";
  const data = await getAdminUsers({ search: params.q ?? "", filter, cursor: params.cursor ?? null });
  return <main className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Users</h1><p className="text-sm text-muted-foreground">Support-focused account activity from persisted product data.</p></div><Button asChild variant="outline"><Link href="/admin">Back to Admin</Link></Button></div>
    <form className="flex flex-col gap-2 sm:flex-row" action="/admin/users"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search name, email, or user ID" aria-label="Search users" /><input type="hidden" name="filter" value={filter} /><Button type="submit">Search</Button></form>
    <div className="flex flex-wrap gap-2">{adminUserFilters.map((value) => <Button key={value} asChild size="sm" variant={value === filter ? "default" : "outline"}><Link href={`/admin/users?filter=${value}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}>{label(value)}</Link></Button>)}</div>
    <Card><CardContent className="p-0"><div className="hidden grid-cols-[minmax(15rem,1.6fr)_minmax(11rem,1fr)_8rem_8rem_8rem_8rem] gap-3 border-b px-4 py-3 text-xs font-medium text-muted-foreground md:grid"><span>User</span><span>Last active</span><span>Plan</span><span>Workouts</span><span>Nutrition</span><span>Contributions</span></div><div className="divide-y">{data.users.map((user) => <Link key={user.id} href={`/admin/users/${user.id}`} className="block p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="grid gap-3 md:grid-cols-[minmax(15rem,1.6fr)_minmax(11rem,1fr)_8rem_8rem_8rem_8rem] md:items-center"><div className="flex min-w-0 gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>{(user.name ?? user.username ?? user.email ?? "U").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold">{user.name ?? user.username ?? "Unnamed user"}</p><p className="truncate text-sm text-muted-foreground">{user.email ?? "No email"}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{user.id}</p></div></div><p className="text-sm text-muted-foreground">{formatDate(user.lastActiveAt)}</p><div><Badge variant={user.plan === "FREE" ? "secondary" : "default"}>{user.plan === "LIFETIME" ? "Lifetime" : user.plan === "PRO" ? "Pro" : "Free"}</Badge></div><p className="text-sm">{user.workoutsCount}</p><p className="text-sm">{user.nutritionEntriesCount}</p><p className="text-sm">Parks {user.parksCount} · Foods {user.foodContributionsCount}{user.pendingFoodContributionsCount ? ` (${user.pendingFoodContributionsCount} pending)` : ""}</p></div></Link>)}{data.users.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No users match this filter.</p> : null}</div></CardContent></Card>
    {data.nextCursor ? <Button asChild variant="outline"><Link href={`/admin/users?filter=${filter}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}&cursor=${data.nextCursor}`}>Load more</Link></Button> : null}
  </main>;
}
