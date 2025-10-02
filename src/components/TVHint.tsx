"use client";

export function TVHint({ render, visible }: { render: boolean; visible: boolean }) {
  if (!render) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/95 px-3 py-1 text-xs text-neutral-200 shadow-lg ring-1 ring-neutral-700">
        Press F to toggle fullscreen
      </span>
    </div>
  );
}

export default TVHint;
