import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractSlug } from "@/lib/slug";
import { fetchEventBySlug, fetchMarketsBySlug } from "@/lib/gamma";
import { gammaMarketToRef, interpretEvent } from "@/lib/market";
import type { ResolvedMarket } from "@/lib/types";

function classifyUrlPath(rawUrl: string): "event" | "market" | "unknown" {
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "event") return "event";
    if (parts[0] === "market") return "market";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function tryEvent(slug: string): Promise<ResolvedMarket | { error: string; status: number } | null> {
  const event = await fetchEventBySlug(slug);
  if (!event) return null;
  const interpreted = interpretEvent(event);
  if (interpreted.kind === "unsupported") {
    return { error: interpreted.reason, status: 422 };
  }
  if (interpreted.kind === "market") {
    return interpreted;
  }
  return interpreted.event;
}

async function tryMarket(slug: string): Promise<ResolvedMarket | null> {
  const markets = await fetchMarketsBySlug(slug);
  if (markets.length === 0) return null;
  for (const m of markets) {
    const ref = gammaMarketToRef(m);
    if (ref) return { kind: "market", market: ref };
  }
  return null;
}

async function resolveFromUrl(req: NextRequest) {
  try {
    let inputUrl: string | undefined;
    if (req.method === "GET") {
      inputUrl = req.nextUrl.searchParams.get("url") ?? undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      const Body = z.object({ url: z.string().optional() });
      const parsed = Body.safeParse(body);
      inputUrl = parsed.success ? parsed.data.url : undefined;
    }
    if (!inputUrl) return NextResponse.json({ error: "url required" }, { status: 400 });

    const slug = extractSlug(inputUrl);
    if (!slug) return NextResponse.json({ error: "could not parse slug" }, { status: 400 });

    const pathKind = classifyUrlPath(inputUrl);
    const order: Array<"event" | "market"> = pathKind === "market" ? ["market", "event"] : ["event", "market"];

    let unsupported: { error: string; status: number } | null = null;
    for (const step of order) {
      if (step === "event") {
        const r = await tryEvent(slug);
        if (r && "error" in r) {
          unsupported = r;
          continue;
        }
        if (r) return NextResponse.json(r);
      } else {
        const r = await tryMarket(slug);
        if (r) return NextResponse.json(r);
      }
    }

    if (unsupported) {
      return NextResponse.json({ error: unsupported.error }, { status: unsupported.status });
    }
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return resolveFromUrl(req);
}
export async function GET(req: NextRequest) {
  return resolveFromUrl(req);
}
