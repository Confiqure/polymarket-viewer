"use client";

export function StatusBadge({ delaySec, tvMode }: { delaySec: number; tvMode?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-neutral-900 text-slate-300 ring-1 ring-neutral-800 ${tvMode ? "px-4 py-2 text-base sm:text-lg" : "px-3 py-1.5 text-xs sm:text-sm"}`}
    >
      {delaySec === 0 ? (
        <>
          <span aria-hidden="true" className={`relative flex ${tvMode ? "h-3 w-3" : "h-2.5 w-2.5"}`}>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span
              className={`relative inline-flex rounded-full bg-emerald-400 ${tvMode ? "h-3 w-3" : "h-2.5 w-2.5"}`}
            />
          </span>
          <span>Live</span>
        </>
      ) : (
        <span>{`Delayed by ${Math.floor(delaySec / 60)}:${String(delaySec % 60).padStart(2, "0")}`}</span>
      )}
    </div>
  );
}

export default StatusBadge;
