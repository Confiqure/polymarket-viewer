import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveMarketFromUrl } from "@/lib/resolve";

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

    const outcome = await resolveMarketFromUrl(inputUrl);
    switch (outcome.kind) {
      case "ok":
        return NextResponse.json(outcome.resolved);
      case "unsupported":
        return NextResponse.json({ error: outcome.reason }, { status: 422 });
      case "invalid":
        return NextResponse.json({ error: outcome.reason }, { status: 400 });
      case "notfound":
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
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
