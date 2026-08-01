import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { CommunityTabs } from "@/components/community/CommunityTabs";
import { Card, CardContent } from "@/components/ui/card";
import { displayUsername, relativeTime } from "@/lib/community";
import { prisma } from "@/lib/prisma";

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const notifications = await prisma.workoutNotification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { id: true, name: true, username: true, image: true } }, workout: { select: { id: true, title: true } }, comment: { select: { content: true } } } });
  await prisma.workoutNotification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  return <main className="mx-auto w-full max-w-3xl p-4 sm:p-6"><BackButton fallbackHref="/feed" /><div className="mb-5"><h1 className="text-3xl font-bold">Activity</h1><p className="text-sm text-muted-foreground">Likes and comments on your public workouts.</p></div><CommunityTabs active="activity" />{notifications.length ? <div className="space-y-2">{notifications.map((notification) => <Link key={notification.id} href={`/workouts/${notification.workout.id}`}><Card className={!notification.readAt ? "border-primary/40 bg-primary/5" : ""}><CardContent className="flex items-center gap-3 p-3"><>{notification.actor.image ? <Image src={notification.actor.image} alt="" width={44} height={44} unoptimized className="size-11 rounded-full object-cover" /> : <span className="flex size-11 items-center justify-center rounded-full bg-muted font-bold">{(notification.actor.name ?? "U").slice(0, 1)}</span>}</><p className="min-w-0 flex-1 text-sm"><strong>{notification.actor.name ?? "Calistheni athlete"}</strong> <span className="text-muted-foreground">{displayUsername(notification.actor)}</span> {notification.type === "WORKOUT_LIKED" ? "liked your workout" : <>commented: “{notification.comment?.content ?? "Great session!"}”</>}<span className="block text-xs text-muted-foreground">{notification.workout.title ?? "Workout"} · {relativeTime(notification.createdAt)}</span></p></CardContent></Card></Link>)}</div> : <Card><CardContent className="p-6 text-sm text-muted-foreground">No activity yet. When people engage with your public workouts, it will appear here.</CardContent></Card>}</main>;
}
