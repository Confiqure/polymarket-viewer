export function extractSlug(u: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("event");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}
