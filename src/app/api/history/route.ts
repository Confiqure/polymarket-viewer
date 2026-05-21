import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = "https://clob.polymarket.com/prices-history";
const TIMEOUT_MS = 8000;

export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  const fidelity = req.nextUrl.searchParams.get("fidelity") ?? "1";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });

  try {
    const url = `${UPSTREAM}?${new URLSearchParams({ market: tokenId, interval, fidelity })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
    }
    const data = await res.json();
    const body = !data || (Array.isArray(data) && data.length === 0) ? { history: [] } : data;
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
