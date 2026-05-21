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

export async function GET() {
  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("limit", "20");
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

    const events: TrendingEvent[] = [];
    for (const raw of data as RawEvent[]) {
      const slug = toStr(raw.slug);
      const title = toStr(raw.title);
      if (!slug || !title) continue;
      events.push({
        slug,
        title,
        image: toStr(raw.image) ?? toStr(raw.icon),
        volume24hr: toNum(raw.volume24hr),
        marketCount: Array.isArray(raw.markets) ? raw.markets.length : 0,
      });
      if (events.length >= 10) break;
    }

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
