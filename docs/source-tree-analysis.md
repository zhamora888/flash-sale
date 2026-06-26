# Source Tree Analysis

**Project:** Flash Sale System  
**Root:** `flash-sale/`  
**Repository type:** Monorepo (root orchestrates server + client via `concurrently`)

---

## Full Annotated Tree

```
flash-sale/                          ← Monorepo root
├── package.json                     ← Root orchestrator: "dev" and "install:all" scripts
├── package-lock.json
├── docker-compose.yml               ← Redis 7 service with AOF persistence
├── .env.example                     ← All required env vars with defaults
├── .env                             ← Local overrides (git-ignored)
├── .gitignore
│
├── server/                          ← Part: backend API server
│   ├── package.json                 ← Express/Redis deps + dev tooling
│   ├── package-lock.json
│   ├── tsconfig.json                ← Strict, CommonJS, target ES2022
│   ├── jest.config.ts               ← ts-jest preset, testEnvironment: node
│   └── src/
│       ├── index.ts                 ← ENTRY POINT — env validation → Redis init → Express wiring
│       ├── redis/
│       │   ├── client.ts            ← node-redis createClient; fail-fast on error
│       │   ├── adapter.ts           ← loadScript (SCRIPT LOAD + SHA cache); executePurchase
│       │   └── scripts/
│       │       └── purchase.lua     ← 5-step atomic Lua: dup-check → stock-check → decr → record → return
│       ├── service/
│       │   ├── saleService.ts       ← getSaleStatus(now) — sale window state machine
│       │   └── purchaseService.ts   ← attemptPurchase(userId) — orchestrates window + Lua
│       ├── routes/
│       │   ├── sale.ts              ← GET /api/sale/status
│       │   └── purchase.ts          ← POST /api/purchase · GET /api/purchase/status
│       ├── stress.ts                ← autocannon stress runner: Scenario A + B
│       └── __tests__/
│           ├── unit/
│           │   ├── saleService.test.ts      ← State machine with mocked timestamps
│           │   └── purchaseService.test.ts  ← Result-mapping with mocked adapter
│           └── integration/
│               └── purchase.test.ts         ← Full flow against live Redis
│
└── client/                          ← Part: React SPA frontend
    ├── package.json                 ← React 18 / Vite 5 deps
    ├── package-lock.json
    ├── tsconfig.json                ← Strict, ESNext, jsx: react-jsx, noEmit
    ├── vite.config.ts               ← Plugin: react(); proxy /api → :3001
    ├── index.html                   ← Vite shell with <div id="root">
    └── src/
        ├── main.tsx                 ← ENTRY POINT — ReactDOM.createRoot('#root')
        ├── App.tsx                  ← Root component — polling, state, purchase UI
        └── api.ts                   ← Typed fetch wrappers: getSaleStatus / attemptPurchase / getPurchaseStatus
```

---

## Critical Directories

| Directory | Purpose |
|-----------|---------|
| `server/src/redis/` | All Redis interaction — client, Lua script, adapter |
| `server/src/service/` | Business logic — isolated from HTTP and Redis details |
| `server/src/routes/` | HTTP request/response mapping only — no business logic |
| `server/src/__tests__/` | Unit (mocked) + integration (live Redis) tests |
| `client/src/` | Entire frontend — 3 files (main, App, api) |

## Layer Direction (server)

```
routes/ → service/ → redis/adapter.ts → redis/client.ts
```

No Redis calls in routes. No HTTP objects in service. Strictly one-way.

## Integration Points

- **Dev:** Vite dev server `:5173` proxies `/api/*` → Express `:3001`
- **Prod:** Express serves `client/dist/` as static; single origin, no CORS needed