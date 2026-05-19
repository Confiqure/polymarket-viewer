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

export function formatMoneyline(p: number): string {
  if (p <= 0 || p >= 1) return "—";
  if (p > 0.5) {
    const american = -100 * (p / (1 - p));
    return Math.round(american).toString();
  } else {
    const american = 100 * ((1 - p) / p);
    return `+${Math.round(american)}`;
  }
}

export function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/**
 * Format a 0..1 probability as a percentage with sensible bounds:
 * - undefined/NaN → "—"
 * - tiny but non-zero → "<1%"
 * - otherwise rounded to the nearest whole percent.
 */
export function formatProbability(p?: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** Format a USD volume like 1.2M / 1.2K / 12. Returns "—" for missing or non-positive. */
export function formatVolumeUsd(v?: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Parse an end-date string from Gamma into an absolute timestamp, treating
 * date-only and midnight-UTC values as "through end of that day (UTC)".
 * Polymarket commonly emits `YYYY-MM-DD` or `YYYY-MM-DDT00:00:00Z` to mean
 * "the market resolves on that day", not "at the very start of that day".
 */
export function parseMarketEndDate(iso: string | undefined | null): number | null {
  if (!iso) return null;
  let s = iso;
  // Bare YYYY-MM-DD -> end of day UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T23:59:59Z`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  // Midnight UTC -> push to end of that calendar day (start + ~24h - 1s)
  const d = new Date(t);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return t + 24 * 60 * 60 * 1000 - 1000;
  }
  return t;
}
