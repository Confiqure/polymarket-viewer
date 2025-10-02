"use client";

type ShareStatus = "idle" | "copied" | "failed";

export function Header({
  title,
  compact,
  tvMode,
  onToggleTv,
  shareStatus,
  onShare,
}: {
  title: string;
  compact: boolean;
  tvMode: boolean;
  onToggleTv: (v: boolean) => void;
  shareStatus: ShareStatus;
  onShare: () => void | Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1
        className={`font-semibold ${compact ? "line-clamp-2 text-base text-slate-300 sm:text-lg md:text-xl" : "text-xl sm:text-2xl"}`}
      >
        {title}
      </h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-1.5 text-xs ring-1 transition sm:text-sm ${shareStatus === "copied" ? "text-emerald-200 ring-emerald-600" : "text-neutral-300 ring-neutral-700 hover:ring-neutral-500"}`}
          onClick={onShare}
          aria-label="Copy shareable link"
          title="Copy shareable link"
        >
          {shareStatus === "idle" && "Share"}
          {shareStatus === "copied" && "✅ Copied"}
          {shareStatus === "failed" && "❌ Failed"}
        </button>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tvMode}
            onChange={(e) => onToggleTv(e.target.checked)}
            className="h-4 w-4 accent-neutral-500"
          />
          TV mode
        </label>
      </div>
    </div>
  );
}

export default Header;
