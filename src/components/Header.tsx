"use client";

import Link from "next/link";

type ShareStatus = "idle" | "copied" | "failed";

export function Header({
  title,
  compact,
  tvMode,
  onToggleTv,
  shareStatus,
  onShare,
  onHome,
}: {
  title: string;
  compact: boolean;
  tvMode: boolean;
  onToggleTv: (v: boolean) => void;
  shareStatus: ShareStatus;
  onShare: () => void | Promise<void>;
  onHome?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      {compact ? (
        <h1 className="line-clamp-2 text-base font-semibold text-slate-300 sm:text-lg md:text-xl">{title}</h1>
      ) : (
        <Link
          href="/"
          onClick={onHome}
          aria-label="Reset to home"
          className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-slate-300 transition hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path d="M3 17l4-4 4 3 6-7 4 4v6H3z" />
            </svg>
          </span>
          {title}
        </Link>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleTv(!tvMode)}
          aria-pressed={tvMode}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 sm:text-sm ${tvMode ? "bg-indigo-500/15 text-indigo-200 ring-indigo-500/40" : "bg-neutral-900 text-neutral-300 ring-neutral-700 hover:ring-neutral-500"}`}
          title="Toggle TV mode (t)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M3 5h18v11H3z" />
            <path d="M8 19h8v2H8z" />
          </svg>
          TV
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 sm:text-sm ${shareStatus === "copied" ? "text-emerald-200 ring-emerald-600" : shareStatus === "failed" ? "text-red-200 ring-red-700" : "text-neutral-300 ring-neutral-700 hover:ring-neutral-500"}`}
          onClick={onShare}
          aria-label="Copy shareable link"
          title="Copy shareable link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1L8.83 8.5A3 3 0 1 0 9 12l6.34 3.51A3 3 0 1 0 18 14a3 3 0 0 0-2.16.93L9.5 11.4a3 3 0 0 0 0-2.8l6.34-3.52A3 3 0 0 0 18 8z" />
          </svg>
          {shareStatus === "idle" && "Share"}
          {shareStatus === "copied" && "Copied"}
          {shareStatus === "failed" && "Failed"}
        </button>
      </div>
    </div>
  );
}

export default Header;
