/** Coerce a value into a finite number, or undefined if unparseable. */
export function toNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parses a value that might be an array, a JSON stringified array, or a comma-separated string
 * into an array of strings.
 */
export function parseListField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  const s = String(value).trim();
  if (!s) return [];

  if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith('"') && s.endsWith('"'))) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (typeof parsed === "string") return parsed.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to CSV parsing
    }
  }

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
