"use client";
import TrendingEvents from "@/components/TrendingEvents";

export function LandingView({
  url,
  onUrlChange,
  resolving,
  error,
  onPickTrending,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  resolving: boolean;
  error: string | null;
  onPickTrending: (url: string) => void;
}) {
  return (
    <div className="mt-8 flex flex-col gap-8 sm:mt-12">
      <section className="mx-auto w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          Watch a Polymarket market live
        </h1>
        <p className="mt-2 text-sm text-neutral-400 sm:text-base">
          Paste a Polymarket event or market URL to start tracking delayed probabilities and candlesticks.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-sm ring-1 ring-neutral-800 outline-none focus:ring-indigo-500 sm:text-base"
            placeholder="https://polymarket.com/event/..."
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            autoFocus
          />
          {resolving && (
            <span className="inline-flex items-center justify-center gap-2 px-4 text-sm text-slate-300">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              Resolving…
            </span>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-left text-xs text-red-200"
          >
            {error}
          </div>
        )}
      </section>
      <TrendingEvents onPick={onPickTrending} />
    </div>
  );
}

export default LandingView;
