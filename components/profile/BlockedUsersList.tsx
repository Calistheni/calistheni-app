"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BlockedUsersList({ initialUsers }: { initialUsers: Array<{ id: string; label: string }> }) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  async function unblock(id: string) {
    if (pendingId) return;
    setPendingId(id);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(id)}/block`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to unblock user.");
      setUsers((current) => current.filter((user) => user.id !== id));
      toast.success("User unblocked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to unblock user.");
    } finally {
      setPendingId(null);
    }
  }
  return users.length ? <div className="divide-y rounded-xl border">{users.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{user.label}</p><p className="text-xs text-muted-foreground">Blocked user</p></div><Button variant="outline" disabled={pendingId === user.id} onClick={() => void unblock(user.id)}>{pendingId === user.id ? "Unblocking…" : "Unblock"}</Button></div>)}</div> : <p className="rounded-xl border p-5 text-sm text-muted-foreground">You have not blocked anyone.</p>;
}
