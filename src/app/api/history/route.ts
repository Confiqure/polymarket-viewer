import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  const fidelity = req.nextUrl.searchParams.get("fidelity") ?? "1"; // minutes
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d"; // span bucket
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });

  try {
    console.log("[history] params:", { tokenId, fidelity, interval });
    const { data } = await axios.get("https://clob.polymarket.com/prices-history", {
      params: { market: tokenId, interval, fidelity },
    });
    console.log(
      "[history] upstream length:",
      Array.isArray(data?.history) ? data.history.length : Array.isArray(data) ? data.length : "n/a",
    );
    // Expected shape: { history: [{t,p}...] } or []
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return NextResponse.json({ history: [] });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("[history] error:", e);
    // Serve empty history on upstream failure to keep UI alive
    return NextResponse.json({ history: [] });
  }
}
