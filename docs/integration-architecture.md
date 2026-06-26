# Integration Architecture

**Project:** Flash Sale System  
**Parts:** `client` (React SPA) ↔ `server` (Express API) ↔ Redis

---

## System Diagram

```
┌─────────────────────────────────────────────────────┐
│          Browser  (React + Vite)  :5173 (dev)        │
│                                                       │
│  Sale status display  (polls every 5 s)               │
│  userId input  +  Buy Now button                      │
│  Purchase result feedback                             │
└─────────────────────┬─────────────────────────────────┘
                      │  HTTP/JSON REST
                      │  (Vite proxy in dev / same origin in prod)
┌─────────────────────▼─────────────────────────────────┐
│       API Server  (Node.js / Express)  :3001           │
│                                                        │
│  GET  /api/sale/status                                 │
│  POST /api/purchase  ──────────────────────────┐       │
│  GET  /api/purchase/status?userId=             │       │
│                                                │       │
│  Sale config from .env at startup              │ Lua   │
│  Layer: routes → service → redis adapter       │ script│
└─────────────────────┬──────────────────────────┘ (atomic)
                      │  node-redis (TCP :6379)
┌─────────────────────▼─────────────────────────────────┐
│                     Redis 7  (Docker)                   │
│                                                         │
│  flash:stock              INTEGER (inventory counter)   │
│  flash:purchased:{userId} STRING  (ISO 8601 timestamp)  │
│                                                         │
│  Persistence: AOF (appendonly yes, appendfsync everysec)│
└─────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. Client → Server (REST over HTTP/JSON)

| Aspect | Detail |
|--------|--------|
| Protocol | HTTP/1.1, JSON bodies |
| Base path | `/api` |
| Dev networking | Vite proxy: `{ '/api': { target: 'http://localhost:3001' } }` |
| Prod networking | Express serves `client/dist/` — same origin, no proxy needed |
| CORS | Enabled in dev (`NODE_ENV !== 'production'`); not needed in prod |
| Auth | None — `userId` is a self-reported string, trusted as-is |

**Endpoints used by the client:**

| Client call | Server endpoint | Frequency |
|-------------|----------------|-----------|
| `getSaleStatus()` | `GET /api/sale/status` | Every 5 s (setInterval) |
| `getPurchaseStatus(userId)` | `GET /api/purchase/status?userId=` | Once on mount (restore session) |
| `attemptPurchase(userId)` | `POST /api/purchase` | On Buy Now click |

### 2. Server → Redis (node-redis TCP)

| Aspect | Detail |
|--------|--------|
| Protocol | Redis wire protocol (RESP) over TCP |
| Client library | node-redis 4.6 |
| Connection URL | `REDIS_URL` env var (default `redis://localhost:6379`) |
| Fail-fast | Server exits immediately if Redis is unreachable at startup |
| Script loading | `SCRIPT LOAD` at startup; SHA cached; subsequent calls use `EVALSHA` |
| Atomic operation | 5-step Lua script executed as single `EVALSHA` per purchase attempt |

---

## Data Flow — Purchase Request

```
Browser
  1. User clicks "Buy Now"
  2. App.tsx: sets buying=true, calls attemptPurchase(userId)

client/src/api.ts
  3. POST /api/purchase  { userId: "alice" }

server/src/routes/purchase.ts
  4. Validates userId (non-empty)
  5. Calls purchaseService.attemptPurchase(userId)

server/src/service/purchaseService.ts
  6. Checks sale window via saleService.getSaleStatus(now)
  7. If active: calls redisAdapter.executePurchase(userId, timestamp)

server/src/redis/adapter.ts
  8. EVALSHA <sha> 1 flash:stock <userId> <ISO-timestamp>

Redis (purchase.lua — atomic)
  9.  EXISTS flash:purchased:{userId}  → already_purchased (code 1) ?
  10. GET flash:stock <= 0             → sold_out (code 2) ?
  11. DECR flash:stock
  12. SET flash:purchased:{userId} <timestamp>
  13. return 0 (success)

server/src/routes/purchase.ts
  14. Maps domain code → HTTP status + JSON body

client/src/App.tsx
  15. Sets feedback message, sets purchased=true on success
```

---

## Dev Environment Port Map

| Service | Port | Started by |
|---------|------|-----------|
| Redis | 6379 | `docker compose up -d` |
| Express API server | 3001 | `npm run dev` (root) |
| Vite dev server | 5173 | `npm run dev` (root) |

All three must be running for the full stack to work in development.

---

## Production Serving Model

In production, Express collapses client and server into a single origin:

```
Client browser
  └── GET /               → Express serves client/dist/index.html
  └── GET /assets/*       → Express serves client/dist/assets/*
  └── GET /api/sale/status → Express routes to API handler
  └── GET /unknown-route  → Express serves client/dist/index.html (SPA fallback)
```

Build steps:
1. `cd client && npm run build` → produces `client/dist/`
2. `cd server && npm run build` → produces `server/dist/`
3. `node server/dist/index.js` — serves both API and static assets

---

## Shared Dependencies

The monorepo root has no shared source code — `client/` and `server/` are fully isolated TypeScript projects with no cross-imports. The root `package.json` only provides the `concurrently`-based `dev` script.