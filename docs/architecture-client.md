# Architecture — Client

**Part:** `flash-sale-client`  
**Type:** Web SPA  
**Pattern:** Single-component React app with polling + localStorage persistence

---

## Executive Summary

The client is a minimal single-page React application that allows a buyer to watch the flash sale status in real time and attempt a purchase. There is no routing, no component library, and no external state management — the entire UI is a single `App.tsx` backed by a typed API layer in `api.ts`.

---

## Technology Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Language | TypeScript | 5.5 | Strict, ESNext target, no emit (Vite bundles) |
| Framework | React | 18.3 | Hooks-only (`useState`, `useEffect`) |
| Build tool | Vite | 5.3 | Dev server `:5173`, proxy `/api` → `:3001` |
| JSX | react-jsx | — | Via `@vitejs/plugin-react` |
| State | React built-ins | — | `useState` + `useEffect`; no Redux/Zustand/Jotai |
| Persistence | `localStorage` | — | userId stored under key `flash_userId` |
| API calls | Native `fetch` | — | Wrapped in typed helpers in `api.ts` |
| Bundler | Vite (esbuild) | — | Output: `client/dist/` |

---

## Architecture Pattern

**Flat single-component SPA:**

```
Browser
  │
  ├── index.html            ← Vite shell
  └── src/
      ├── main.tsx          ← Mount App into #root
      ├── App.tsx           ← All state, effects, and render logic
      └── api.ts            ← Typed fetch wrappers (no raw fetch in App)
```

**Intentional constraints (from architecture decisions):**
- No routing library — single page only
- No external state manager — `useState` + `useEffect` only
- No component tests — deferred
- No CSS framework — plain CSS / inline styles

---

## State Model (`App.tsx`)

| State variable | Type | Purpose |
|----------------|------|---------|
| `saleStatus` | `SaleStatus \| null` | Last known response from `GET /api/sale/status` |
| `userId` | `string` | Buyer identifier; synced to/from `localStorage` |
| `purchased` | `boolean` | Whether the current session has purchased |
| `buying` | `boolean` | In-flight purchase request guard |
| `feedback` | `string` | Last purchase outcome message |

**Derived value:**

```ts
const canBuy = saleStatus?.status === 'active'
             && userId.trim().length > 0
             && !purchased
             && !buying;
```

Wired to the `disabled` attribute of the Buy Now button — not just visual styling.

---

## Effects

| Effect | Trigger | Behaviour |
|--------|---------|-----------|
| Status polling | Mount (empty dep array) | `setInterval` every 5 s; clears on unmount |
| Purchase restore | Mount (runs once after userId init) | Calls `GET /api/purchase/status`; sets `purchased = true` if backend confirms |
| userId sync | Per `handleUserIdChange` call | Writes to `localStorage` with try/catch (Safari private mode guard) |

---

## API Layer (`api.ts`)

Three typed async functions — the only place `fetch` is called:

| Function | Endpoint | Returns |
|----------|----------|---------|
| `getSaleStatus()` | `GET /api/sale/status` | `SaleStatus` — throws on non-2xx |
| `attemptPurchase(userId)` | `POST /api/purchase` | `PurchaseResult` — always parses (caller reads `result`) |
| `getPurchaseStatus(userId)` | `GET /api/purchase/status?userId=` | `{ purchased: boolean; purchasedAt?: string }` — throws on non-2xx |

---

## Purchase Outcome Feedback Strings

Exact strings from the product requirements — no paraphrasing:

| `result` | Message shown |
|----------|---------------|
| `success` | "You got it! Purchase confirmed." |
| `already_purchased` | "You've already purchased this item." |
| `sold_out` | "Sorry — sold out." |
| `sale_not_active` | "Sale is not currently active." |
| `invalid_request` | "Something went wrong. Please try again." |
| network / 5xx | "Something went wrong. Please try again." |

---

## Build & Dev Configuration

**Development:**
- Vite dev server on `:5173`
- `/api` proxy → `http://localhost:3001` (eliminates CORS in dev — AD-6)
- HMR enabled by default

**Production:**
- `npm run build` in `client/` → `client/dist/`
- Express serves `client/dist/` as static files; catch-all route serves `index.html`
- No CORS header needed (same origin)

**TypeScript config:**
- `noEmit: true` — Vite handles bundling, `tsc` is type-check only
- `lib: ["ESNext", "DOM", "DOM.Iterable"]`
- `moduleResolution: "bundler"` (Vite-aware)

---

## Known Deferred Items

| Item | Location | Notes |
|------|----------|-------|
| Mount-time `getPurchaseStatus` doesn't re-run when userId changes mid-session | `App.tsx:58` | Tracked in deferred-work.md |
| StrictMode double-mount / missing AbortController on fetch | `App.tsx:75` | Tracked in deferred-work.md |
| No CSP / security headers | `index.html` | Defense-in-depth; out of interview scope |
| Multi-tab purchased state desync | `App.tsx:31` | No `storage` event listener |
| Polling continues after terminal status with no backoff | `App.tsx:51` | Spec mandates poll for page lifetime |