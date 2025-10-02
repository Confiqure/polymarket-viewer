export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  let s = totalSeconds;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  // Limit granularity: if days exist, show d h; else if hours exist, show h m s; else show m s
  if (d) return parts.slice(0, 2).join(" ");
  if (h) return parts.slice(0, 3).join(" ");
  return parts.slice(Math.max(0, parts.length - 2)).join(" ");
}
