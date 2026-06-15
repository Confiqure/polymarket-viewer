"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { MarketOption } from "@/lib/types";
import { formatProbability, formatVolumeUsd, timeAgo } from "@/lib/format";

function OptionAvatar({ option, size = 28 }: { option: MarketOption; size?: number }) {
  const src = option.image ?? option.icon;
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="rounded-full bg-neutral-800 object-cover ring-1 ring-neutral-700"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = option.label
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-neutral-800 text-[10px] font-semibold text-neutral-300 ring-1 ring-neutral-700"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

export function EventOptionPicker({
  options,
  selectedId,
  onSelect,
  lastUpdated,
  filterPlaceholder = "Filter options…",
}: {
  options: MarketOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  lastUpdated?: number | null;
  filterPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? options[0], [options, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  // Keyboard nav while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      const idx = filtered.findIndex((o) => o.id === selectedId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[(idx + 1) % filtered.length];
        if (next) onSelect(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = filtered[(idx - 1 + filtered.length) % filtered.length];
        if (next) onSelect(next.id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, selectedId, onSelect]);

  if (!selected) return null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2.5 text-left ring-1 ring-neutral-800 transition hover:ring-neutral-600"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-3">
          <OptionAvatar option={selected} size={32} />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-100 sm:text-base">{selected.label}</span>
              {selected.closed && (
                <span className="shrink-0 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase ring-1 ring-amber-800/60">
                  Resolved
                </span>
              )}
            </span>
            {lastUpdated && (
              <span
                className="block truncate text-[11px] text-neutral-500"
                title={new Date(lastUpdated).toLocaleString()}
              >
                updated {timeAgo(lastUpdated)}
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block text-base font-bold text-slate-100 tabular-nums sm:text-lg">
              {formatProbability(selected.lastPrice)}
            </span>
            <span className="block text-[10px] text-neutral-500 tabular-nums">
              {formatVolumeUsd(selected.volume24hr)} 24h
            </span>
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 fill-current text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M5.25 7.5L10 12.25 14.75 7.5z" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-40 mt-1 max-h-[420px] w-full overflow-hidden rounded-md bg-neutral-950 shadow-xl ring-1 ring-neutral-800"
        >
          <div className="border-b border-neutral-800 p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder={filterPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded bg-neutral-900 px-2 py-1.5 text-sm text-slate-100 ring-1 ring-neutral-800 outline-none focus:ring-indigo-500"
            />
          </div>
          <ul className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-4 text-center text-sm text-neutral-500">No matches</li>}
            {filtered.map((opt) => {
              const isSelected = opt.id === selectedId;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(opt.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition ${
                      isSelected ? "bg-neutral-800/80" : "hover:bg-neutral-900"
                    } ${opt.closed ? "opacity-60" : ""}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <OptionAvatar option={opt} size={28} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-100">{opt.label}</span>
                          {opt.closed && (
                            <span className="shrink-0 rounded bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-300 uppercase ring-1 ring-amber-800/60">
                              Resolved
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500">
                          {formatVolumeUsd(opt.volume24hr)} 24h · {formatVolumeUsd(opt.volume)} total
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-slate-100 tabular-nums">
                        {formatProbability(opt.lastPrice)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default EventOptionPicker;
