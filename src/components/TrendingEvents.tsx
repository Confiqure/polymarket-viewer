"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { TrendingEvent } from "@/app/api/trending/route";
import { formatVolumeUsd } from "@/lib/format";

function Avatar({ src, alt, size = 36 }: { src?: string; alt: string; size?: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="rounded-md bg-neutral-800 object-cover ring-1 ring-neutral-700"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials =
    alt
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-md bg-neutral-800 text-xs font-semibold text-neutral-300 ring-1 ring-neutral-700"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export default function TrendingEvents({ onPick }: { onPick: (url: string) => void }) {
  const [events, setEvents] = useState<TrendingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trending")
      .then((r) => r.json())
      .then((data: { events: TrendingEvent[] }) => {
        if (cancelled) return;
        setEvents(Array.isArray(data?.events) ? data.events : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load trending markets");
        setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && (!events || events.length === 0)) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Trending</h2>
        <span className="text-xs text-neutral-500">Top 10 by 24h activity</span>
      </div>
      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl bg-neutral-900/60 ring-1 ring-neutral-800">
        {events == null
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 px-3 py-3">
                <div className="h-10 w-10 rounded-md bg-neutral-800" />
                <div className="flex-1">
                  <div className="h-3 w-2/3 rounded bg-neutral-800" />
                  <div className="mt-2 h-2 w-1/4 rounded bg-neutral-800" />
                </div>
              </li>
            ))
          : events.map((e, i) => {
              const url = `https://polymarket.com/event/${e.slug}`;
              return (
                <li key={e.slug}>
                  <button
                    type="button"
                    onClick={() => onPick(url)}
                    className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-800/60 focus:bg-neutral-800/60 focus:outline-none"
                  >
                    <span className="w-5 text-xs font-medium text-neutral-500 tabular-nums">{i + 1}</span>
                    <Avatar src={e.image} alt={e.title} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-slate-100">{e.title}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {formatVolumeUsd(e.volume24hr)} 24h{e.marketCount > 1 ? ` · ${e.marketCount} markets` : ""}
                      </span>
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-4 w-4 fill-current text-neutral-700 transition group-hover:translate-x-0.5 group-hover:text-neutral-400"
                    >
                      <path d="M7.5 5l5 5-5 5V5z" />
                    </svg>
                  </button>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
