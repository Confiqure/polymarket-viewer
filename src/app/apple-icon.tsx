import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)",
        color: "#e0e7ff",
        fontSize: 96,
        fontWeight: 800,
        letterSpacing: -4,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      PV
    </div>,
    size,
  );
}
