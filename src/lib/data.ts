/**
 * Parses a value that might be an array, a JSON stringified array, or a comma-separated string
 * into an array of strings.
 */
export function parseListField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  const s = String(value).trim();
  if (!s) return [];

  // Try JSON array first
  if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith('"') && s.endsWith('"'))) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (typeof parsed === "string") return parsed.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to CSV parsing
    }
  }

  // Fallback: CSV split
  return s
    .split(",")
    .map((x) =>
      x
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/^\[|\]$/g, ""),
    )
    .filter(Boolean);
}
