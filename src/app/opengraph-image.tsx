import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Polymarket Viewer";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #020617 0%, #1e1b4b 50%, #4338ca 100%)",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            color: "#a5b4fc",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(99,102,241,0.18)",
              border: "1px solid rgba(165,180,252,0.3)",
              borderRadius: 12,
              color: "#c7d2fe",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            PV
          </div>
          Polymarket Viewer
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: "#f8fafc",
          }}
        >
          Live, delayed odds for any Polymarket market.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            color: "#94a3b8",
            lineHeight: 1.3,
          }}
        >
          TV-friendly probability + candlesticks. Spoiler-safe display delay.
        </div>
      </div>
    ),
    size,
  );
}
