import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { z } from "zod";

const GammaMarket = z.object({
	question: z.string().nullable(),
	conditionId: z.string(),
	slug: z.string().nullable(),
	endDateIso: z.string().nullable().optional(),
	clobTokenIds: z.union([z.string(), z.array(z.string())]).nullable().optional(),
	shortOutcomes: z.union([z.string(), z.array(z.string())]).nullable().optional(),
	outcomes: z.union([z.string(), z.array(z.string())]).nullable().optional(),
});

function extractSlug(u: string) {
	const url = new URL(u);
	const parts = url.pathname.split("/").filter(Boolean);
	const idx = parts.indexOf("event");
	if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
	return parts.at(-1) ?? "";
}

function parseListField(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.map(String);
	const s = String(value).trim();
	if (!s) return [];
	// Try JSON array first
	if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("\"") && s.endsWith("\""))) {
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return parsed.map(String);
			if (typeof parsed === "string") return parsed.split(",").map((x) => x.trim().replace(/^\"|\"$/g, ""));
		} catch {
			// fall through to CSV parsing
		}
	}
	// Fallback: CSV split
	return s.split(",").map((x) => x.trim().replace(/^\"|\"$/g, "").replace(/^\[|\]$/g, ""))
		.filter(Boolean);
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
		if (!slug)
			return NextResponse.json({ error: "could not parse slug" }, { status: 400 });

			console.log("[resolve] incoming url:", inputUrl, "slug:", slug);
			const { data } = await axios.get(
				"https://gamma-api.polymarket.com/markets",
				{ params: { slug } }
			);

			if (!Array.isArray(data) || data.length === 0) {
				// Try to parse direct token id from URL paths like /market/<id> if present
				const maybeId = slug?.match(/[0-9]{3,}/)?.[0];
				if (maybeId) {
					return NextResponse.json({
						question: "",
						conditionId: "",
						yesTokenId: maybeId,
						noTokenId: "",
						slug,
					});
				}
				return NextResponse.json({ error: "Market not found" }, { status: 404 });
			}

			// Find the first strictly binary market (2 tokens)
			const markets = data.map((d: unknown) => GammaMarket.parse(d));
			const binary = markets.find((m) => {
				const tokenIds = parseListField(m.clobTokenIds);
				const out1 = parseListField(m.shortOutcomes);
				const out2 = parseListField(m.outcomes);
				const outs = out1.length ? out1 : out2;
				return tokenIds.length === 2 || outs.length === 2;
			});

			if (!binary) {
				const debug = req.nextUrl.searchParams.get("debug");
				const payload = { error: "Not a binary market for this slug", markets: markets.map((m) => ({
					conditionId: m.conditionId,
					clobTokenIds: m.clobTokenIds,
					shortOutcomes: m.shortOutcomes,
					outcomes: m.outcomes,
				})) };
				return NextResponse.json(payload, { status: debug ? 200 : 400 });
			}

			const tokenIds = parseListField(binary.clobTokenIds);
			const shortOuts = parseListField(binary.shortOutcomes);
			const outs2 = parseListField(binary.outcomes);
			const outcomes = shortOuts.length ? shortOuts : outs2;

			if (tokenIds.length !== 2)
				return NextResponse.json({ error: "Binary market missing tokens" }, { status: 400 });

			// Choose YES/NO mapping: prefer explicit Yes/No, otherwise default to [0]=YES, [1]=NO
			let yesIdx = outcomes.findIndex((o) => /yes/i.test(o));
			if (yesIdx < 0) yesIdx = 0;
			const noIdx = yesIdx === 0 ? 1 : 0;

				const response = {
				question: binary.question ?? "",
				conditionId: binary.conditionId,
				yesTokenId: tokenIds[yesIdx],
				noTokenId: tokenIds[noIdx],
				endDateIso: binary.endDateIso ?? undefined,
				slug: binary.slug ?? undefined,
					yesLabel: outcomes[yesIdx] ?? "Yes",
					noLabel: outcomes[noIdx] ?? "No",
			};
				console.log("[resolve] selected market:", {
					question: response.question,
					conditionId: response.conditionId,
					yesTokenId: response.yesTokenId,
					noTokenId: response.noTokenId,
					yesLabel: response.yesLabel,
					noLabel: response.noLabel,
				});
				return NextResponse.json(response);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "unknown error";
		console.error("[resolve] error:", e);
		return NextResponse.json({ error: msg }, { status: 500 });
	}
}

		export async function POST(req: NextRequest) { return resolveFromUrl(req); }
		export async function GET(req: NextRequest) { return resolveFromUrl(req); }