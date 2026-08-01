export function displayUsername(user: {
  id: string;
  username?: string | null;
  name?: string | null;
}) {
  if (user.username) return `@${user.username}`;
  const normalizedName = user.name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  return normalizedName ? `@${normalizedName}` : `@athlete${user.id.slice(-5)}`;
}

export function relativeTime(value: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return value.toLocaleDateString();
}
