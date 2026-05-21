import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = "https://clob.polymarket.com/price";
const TIMEOUT_MS = 8000;

async function fetchSide(tokenId: string, side: "BUY" | "SELL"): Promise<number | null> {
  const url = `${UPSTREAM}?token_id=${encodeURIComponent(tokenId)}&side=${side}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = (await res.json()) as { price?: unknown };
  const n = typeof data.price === "number" ? data.price : parseFloat(String(data.price));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });

  const [buy, sell] = await Promise.allSettled([fetchSide(tokenId, "BUY"), fetchSide(tokenId, "SELL")]);
  return NextResponse.json(
    {
      bestBid: buy.status === "fulfilled" ? buy.value : null,
      bestAsk: sell.status === "fulfilled" ? sell.value : null,
    },
    {
      headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10" },
    },
  );
}
