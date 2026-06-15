import { Suspense } from "react";
import type { Metadata } from "next";
import HomeContent from "@/features/home/HomeContent";
import { TickerProvider } from "@/components/Ticker";
import { extractSlug } from "@/lib/slug";
import { parseListField } from "@/lib/data";
import { fetchEventBySlug, fetchMarketsBySlug } from "@/lib/gamma";
import { gammaMarketToOption, sortOptionsForPicker } from "@/lib/market";
import { resolveMarketFromUrl } from "@/lib/resolve";
import type { ResolvedMarket } from "@/lib/types";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Best-effort server-side resolve using the shared resolver (same flow as /api/resolve).
 * Returns null on any failure or unsupported event so the client can fall back to its
 * client-side resolve flow (which surfaces error details).
 */
async function resolveMarketServer(url: string | undefined): Promise<ResolvedMarket | null> {
  if (!url) return null;
  const outcome = await resolveMarketFromUrl(url);
  return outcome.kind === "ok" ? outcome.resolved : null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const urlParam = resolvedParams?.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;
  const optionParam = resolvedParams?.option;
  const optionId = Array.isArray(optionParam) ? optionParam[0] : optionParam;

  if (!url) return {};

  const slug = extractSlug(url);
  if (!slug) return {};

  try {
    // Try event first
    const event = await fetchEventBySlug(slug);
    if (event && event.markets.length > 0) {
      const options = sortOptionsForPicker(
        event.markets.map((m) => gammaMarketToOption(m)).filter((o): o is NonNullable<typeof o> => o !== null),
      );

      if (options.length >= 2) {
        const title = event.title ?? slug;
        const image = event.image ?? undefined;

        // Deep-link to a specific candidate
        const pinned = optionId ? options.find((o) => o.id === optionId) : null;
        if (pinned) {
          const pct = pinned.lastPrice != null ? `${Math.round(pinned.lastPrice * 100)}%` : "—";
          const pinnedTitle = `${pinned.label} — ${title}`;
          const description = `${pct} chance to win • ${title}`;
          const images = pinned.image ? [pinned.image] : image ? [image] : undefined;
          return {
            title: pinnedTitle,
            description,
            openGraph: { title: pinnedTitle, description, type: "website", images },
            twitter: { card: "summary_large_image", title: pinnedTitle, description, images },
          };
        }

        // Aggregated leaderboard
        const top = options.slice(0, 4);
        const parts = top.map((o) => `${o.label}: ${o.lastPrice != null ? Math.round(o.lastPrice * 100) : "?"}%`);
        const more = options.length - top.length;
        const leaderboard = parts.join(" • ") + (more > 0 ? ` • +${more} more` : "");
        const cleanDesc = (event.description ?? "").replace(/\s+/g, " ").trim();
        const description = cleanDesc ? `${leaderboard} • ${cleanDesc}` : leaderboard;
        const images = image ? [image] : undefined;
        return {
          title,
          description,
          openGraph: { title, description, type: "website", images },
          twitter: { card: "summary_large_image", title, description, images },
        };
      }
    }

    // Fallback: legacy single-market path
    const markets = await fetchMarketsBySlug(slug);
    const market = markets[0];
    if (!market || !market.question) return {};

    const outcomes = parseListField(market.outcomes);
    const prices = parseListField(market.outcomePrices);

    let oddsStr = "";
    if (outcomes.length > 0 && prices.length === outcomes.length) {
      const odds = outcomes.map((o: string, i: number) => {
        const p = parseFloat(prices[i]);
        const pct = Math.round(p * 100);
        return `${o}: ${pct}%`;
      });
      oddsStr = odds.join(" | ");
    }

    const cleanDesc = (market.description || "").replace(/\s+/g, " ").trim();
    const description = oddsStr ? `${oddsStr} • ${cleanDesc}` : cleanDesc;
    const images = market.image ? [market.image] : undefined;

    return {
      title: market.question,
      description: description || undefined,
      openGraph: {
        title: market.question,
        description: description || undefined,
        type: "website",
        images,
      },
      twitter: {
        card: "summary_large_image",
        title: market.question,
        description: description || undefined,
        images,
      },
    };
  } catch (e) {
    console.error("Error fetching metadata:", e);
    return {};
  }
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const urlParam = params?.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;
  // Resolve the market server-side so the first paint already shows the right view.
  // Re-uses the same `fetch` calls as `generateMetadata` — Next.js fetch caching
  // (revalidate: 60) makes the second call essentially free.
  const initialResolved = await resolveMarketServer(url);

  // Seed the ticker with the server time so any time-sensitive UI (e.g.
  // "Ends in 27d 4h") matches between SSR and the first client render.
  const initialNow = Date.now();

  return (
    <TickerProvider intervalMs={1000} initialNow={initialNow}>
      <Suspense
        fallback={
          <main className="min-h-screen bg-black text-slate-200">
            <div className="mx-auto max-w-4xl px-4 py-6">
              <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
              <div className="mt-4 h-6 w-40 animate-pulse rounded bg-neutral-800" />
            </div>
          </main>
        }
      >
        <HomeContent initialResolved={initialResolved} initialUrl={url ?? ""} />
      </Suspense>
    </TickerProvider>
  );
}
