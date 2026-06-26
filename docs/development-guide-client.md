# Development Guide — Client

**Part:** `flash-sale-client`  
**Runtime:** Browser  
**Language:** TypeScript 5.5 · React 18.3 · Vite 5.3

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥18 | [nodejs.org](https://nodejs.org) |
| npm | ≥9 | Included with Node.js |

The client communicates with the Express API server — Redis and Docker are not required for the client alone, but the full experience requires the server running.

---

## Installation

```bash
cd flash-sale/client
npm install
```

Or from the repo root (installs both server and client):

```bash
cd flash-sale
npm run install:all
```

---

## Local Development

**Start the dev server (Vite):**

```bash
cd flash-sale/client
npm run dev
```

Or start both client and server together from the repo root:

```bash
cd flash-sale
npm run dev
```

Vite starts on `http://localhost:5173`.

All `/api/*` requests are automatically proxied to `http://localhost:3001` — no CORS configuration needed in development.

---

## Build

```bash
cd flash-sale/client
npm run build
```

This runs `tsc` (type-check only, no emit) then `vite build`. Output: `client/dist/`.

**Preview the production build locally:**

```bash
cd flash-sale/client
npm run preview
```

---

## Project Structure

```
client/
├── index.html          ← Vite HTML shell
├── vite.config.ts      ← Plugin + /api proxy
├── tsconfig.json       ← Strict, noEmit, jsx: react-jsx
├── package.json
└── src/
    ├── main.tsx        ← Mount App into #root
    ├── App.tsx         ← All state, effects, and UI
    └── api.ts          ← Typed fetch wrappers
```

---

## Key Behaviors (Testing Manually)

| Scenario | How to test |
|----------|------------|
| Status polling | Open app — sale status badge updates every 5 s |
| userId persistence | Type a userId, reload page — field pre-filled from localStorage |
| Buy Now disabled | Leave userId empty or set sale outside window — button is disabled |
| Purchase success | Valid userId, active sale, stock > 0 — shows "You got it! Purchase confirmed." + "Purchased ✓" |
| Reload restores state | After purchase success, reload — "Purchased ✓" restored via `/api/purchase/status` |
| Duplicate purchase | Attempt second purchase with same userId — "You've already purchased this item." |
| Sold out | All stock consumed — "Sorry — sold out." |
| Network error | Stop the server — "Something went wrong. Please try again." |

---

## TypeScript Configuration Notes

- `noEmit: true` — TypeScript is used for type-checking only; Vite/esbuild handles transpilation
- `moduleResolution: "bundler"` — Vite-aware module resolution (supports bare imports with extensions)
- `isolatedModules: true` — Each file must be independently transpilable
- Run type-check only: `cd flash-sale/client && npx tsc --noEmit`

---

## Testing

No unit or component tests are implemented (deferred per spec). Manual testing against the live dev server is the current approach.

---

## API Dependency

The client depends entirely on the server for all data. With the server down:
- Status polling fails silently (previous status remains visible)
- Purchase attempts show "Something went wrong. Please try again."
- Mount-time purchase restore silently skips

Start the full stack to test end-to-end:

```bash
# Terminal 1
cd flash-sale && docker compose up -d && npm run dev

# Browser
open http://localhost:5173
```