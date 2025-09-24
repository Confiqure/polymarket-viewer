# Polymarket Viewer

A focused, fast, TV-friendly realtime viewer for Polymarket markets.

> Not affiliated with or endorsed by Polymarket. Data provided without warranty; not trading advice.

## Why This Exists

Polymarket’s native UI is great for trading, but not ideal for passive monitoring, broadcasting on a screen, or quickly inspecting one side of a binary market with delayed / aggregated price context. Polymarket Viewer provides:

- A clean fullscreen / TV mode with large probability readout
- Selectable delay window (latency / anti-spoiler / fair display buffer)
- Adjustable candlestick timeframe (1m / 5m / 15m / 60m)
- Outcome POV toggle (YES / NO)
- Auto screen wake (TV mode) so displays don’t sleep
- URL parameter sync & deep-linking (share a specific configuration)

It’s designed for: stream overlays, venue displays, dashboards, and personal monitoring.

## Core Features

| Feature | Notes |
| ------- | ----- |
| Realtime prices | WebSocket subscription with automatic REST polling fallback |
| Delayed view | Client-side buffer to avoid spoilers during live events |
| Candles | Built from point-in-time price snapshots (aggregated client-side) |
| Deep links | `?url=...&delay=30&tf=5&pov=yes&mode=tv` style sharing |
| TV Mode | Enlarged probability, auto wake lock, minimal chrome |
| Resilient | Graceful degradation if WS fails (no hard crash) |

## Data Flow Overview

1. `resolve` API -> normalizes a pasted Polymarket market/event URL into token IDs.
2. History endpoint -> initial backfill (seconds -> ms normalization).
3. Live feed -> WebSocket (bid/ask snapshots) -> in-memory ring buffers per outcome.
4. Display time = `now - delayMs` -> interpolate/lerp to derive delayed spot price.
5. Candlestick builder groups points into timeframe buckets on the client.

## Quick Start (Local Dev)

```bash
npm install
npm run dev
# open http://localhost:3000
```

Paste a Polymarket market or event URL (e.g. `https://polymarket.com/event/...`).

## URL Parameters

| Param | Example | Description |
| ----- | ------- | ----------- |
| `url` | `?url=https://polymarket.com/event/...` | Market/event link to auto-resolve |
| `delay` | `delay=30` | Seconds of display delay (0–600) |
| `tf` | `tf=5` | Candle timeframe in minutes (1,5,15,60) |
| `pov` | `pov=yes` | Outcome perspective (`yes` or `no`) |
| `mode` | `mode=tv` | TV mode (large probability, wake lock) |

Examples:

```text
/ ?url=...&delay=45&tf=5&pov=yes
/ ?url=...&mode=tv&delay=120
```

## TV Mode Notes

TV mode:

- Increases typography scale
- Hides most controls
- Enables screen wake lock (where supported; Safari may need a one-time user interaction)

## Contributing

Lightweight project; PRs welcome for stability, performance, or data correctness improvements.

## License

MIT License – see `LICENSE` file. “Polymarket” is a trademark of its respective owner; usage here is purely descriptive.

---
Questions / features you’d like? Open an issue or drop a note.
