export function parseDurationInput(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  const [hours, minutes, seconds] = parts.length === 3 ? values : [0, values[0], values[1]];
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDurationInput(durationSeconds: number | null) {
  if (durationSeconds === null || durationSeconds < 0) return "00:00";
  const seconds = Math.round(durationSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const short = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${short}` : short;
}
