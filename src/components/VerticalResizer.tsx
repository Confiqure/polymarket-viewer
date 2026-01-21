"use client";
import { useEffect, useRef, useState } from "react";

interface VerticalResizerProps {
  onResize: (newSplit: number) => void;
  tvMode: boolean;
}

export function VerticalResizer({ onResize, tvMode }: VerticalResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    // Apply global cursor while dragging to prevent flickering
    document.body.style.cursor = "ns-resize";

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const parent = containerRef.current?.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const newSplit = 100 - (relativeY / rect.height) * 100;

      // Clamp between 20% and 80%
      onResize(Math.max(20, Math.min(80, newSplit)));
    };

    const handleUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
      document.body.style.cursor = "";
    };
  }, [isDragging, onResize]);

  if (!tvMode) return null;

  return (
    <div
      ref={containerRef}
      className="group relative z-40 flex h-4 w-full transform-gpu cursor-ns-resize touch-none items-center justify-center select-none"
      onMouseDown={() => setIsDragging(true)}
      onTouchStart={() => setIsDragging(true)}
    >
      {/* Visual divider line: subtle by default, very bright on hover/drag */}
      <div
        className={`absolute inset-x-0 top-1/2 w-full border-t transition-all duration-200 ${
          isDragging
            ? "border-indigo-500 opacity-100 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
            : "border-neutral-800 opacity-40 group-hover:border-neutral-400 group-hover:opacity-100"
        }`}
      />

      {/* Modern Grabber: Slimmer horizontal bar that highlights strongly on hover */}
      <div
        className={`relative z-10 h-1 w-12 rounded-full transition-all duration-200 ${
          isDragging ? "bg-indigo-400 opacity-100" : "bg-neutral-500 opacity-0 shadow-sm group-hover:opacity-100"
        }`}
      />

      {/* Extra large hitbox for touch and hover - ensures cursor-ns-resize is stable */}
      <div className="absolute inset-x-0 -top-4 h-12 w-full cursor-ns-resize" />
    </div>
  );
}

export default VerticalResizer;
