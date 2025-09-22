import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
	const tokenId = req.nextUrl.searchParams.get("tokenId");
	if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });
		try {
		console.log("[price] tokenId:", tokenId);
		const [buy, sell] = await Promise.all([
			axios.get("https://clob.polymarket.com/price", { params: { token_id: tokenId, side: "BUY" } }),
			axios.get("https://clob.polymarket.com/price", { params: { token_id: tokenId, side: "SELL" } }),
		]);
		console.log("[price] upstream buy:", buy.data, "sell:", sell.data);
		return NextResponse.json({ bestBid: buy.data?.price ?? null, bestAsk: sell.data?.price ?? null });
		} catch (e) {
			console.error("[price] error: ", e);
			return NextResponse.json({ bestBid: null, bestAsk: null });
	}
}