import { NextResponse } from "next/server";
import { toNum } from "@/lib/data";

// The upstream Gamma /events payload can exceed Next.js's 2MB fetch-cache cap,
// so we use `cache: "no-store"` for the upstream call and instead cache our
// trimmed response via an HTTP Cache-Control header.

export interface TrendingEvent {
  slug: string;
  title: string;
  image?: string;
  volume24hr?: number;
  marketCount: number;
}

interface RawEvent {
  slug?: unknown;
  title?: unknown;
  image?: unknown;
  icon?: unknown;
  volume24hr?: unknown;
  markets?: unknown;
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/** Highest 24h volume among an event's individual markets (0 when unavailable). */
function maxMarketVolume(markets: unknown): number {
  if (!Array.isArray(markets)) return 0;
  let max = 0;
  for (const m of markets) {
    const v = toNum((m as { volume24hr?: unknown })?.volume24hr) ?? 0;
    if (v > max) max = v;
  }
  return max;
}

/**
 * Blended trending score: the geometric mean of an event's *aggregate* 24h volume and its
 * *hottest single market's* 24h volume. Equivalent to aggVol·√(hottest-market share), it
 * rewards total activity while requiring at least one genuinely active market — so events
 * that only look big by summing many thin markets (e.g. 128-candidate nominee events) get
 * down-weighted, without nuking legitimately huge broad events (e.g. World Cup Winner).
 * Falls back to plain aggregate volume when per-market volume is missing.
 */
export function trendingScore(aggVolume: number, maxMarket: number): number {
  const peak = maxMarket > 0 ? maxMarket : aggVolume;
  return Math.sqrt(Math.max(0, aggVolume) * Math.max(0, peak));
}

export async function GET() {
  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    // Fetch a wider pool than we display so the concentration re-rank below has room to
    // move thin many-market events down and surface concentrated ones.
    url.searchParams.set("limit", "40");
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("archived", "false");
    // Match Polymarket's own homepage curation: featured events sorted by 24h volume.
    // Plain `order=volume24hr` is dominated by short-lived sports games and misses
    // the politics/macro markets that Polymarket actually surfaces as "trending".
    url.searchParams.set("featured", "true");
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");

    const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ events: [] }, { status: 200 });

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return NextResponse.json({ events: [] }, { status: 200 });

    const scored: Array<{ event: TrendingEvent; score: number }> = [];
    for (const raw of data as RawEvent[]) {
      const slug = toStr(raw.slug);
      const title = toStr(raw.title);
      if (!slug || !title) continue;
      const aggVolume = toNum(raw.volume24hr) ?? 0;
      scored.push({
        event: {
          slug,
          title,
          image: toStr(raw.image) ?? toStr(raw.icon),
          volume24hr: toNum(raw.volume24hr),
          marketCount: Array.isArray(raw.markets) ? raw.markets.length : 0,
        },
        score: trendingScore(aggVolume, maxMarketVolume(raw.markets)),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const events = scored.slice(0, 10).map((s) => s.event);

    return NextResponse.json(
      { events },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  } catch (e) {
    console.warn("[trending] error:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ events: [] }, { status: 200 });
  }
}
