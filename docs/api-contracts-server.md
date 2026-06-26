# API Contracts — Server

**Part:** `server` · **Base URL (dev):** `http://localhost:3001`

All responses use `Content-Type: application/json`.  
All response bodies carry a top-level `result` string (or `status` for the sale-status endpoint).  
No authentication is required.

---

## Endpoints

### `GET /api/sale/status`

Returns current sale state, remaining stock, and the configured sale window.

**Response 200**

```json
{
  "status": "upcoming" | "active" | "ended" | "sold_out",
  "stockRemaining": 42,
  "saleStart": "2026-06-25T10:00:00.000Z",
  "saleEnd":   "2026-06-25T11:00:00.000Z"
}
```

| `status` value | Meaning |
|----------------|---------|
| `upcoming` | Current time < `SALE_START` |
| `active` | Within window and stock > 0 |
| `ended` | Current time > `SALE_END` |
| `sold_out` | Within window but `flash:stock` = 0 |

---

### `POST /api/purchase`

Attempts a purchase for the specified user. The stock decrement and purchase record are written atomically via a Redis Lua script.

**Request body**

```json
{ "userId": "alice@example.com" }
```

| Field | Type | Rules |
|-------|------|-------|
| `userId` | string | Required, non-empty |

**Responses**

| HTTP | `result` | Extras | Condition |
|------|----------|--------|-----------|
| 200 | `success` | `userId`, `purchasedAt` (ISO 8601) | Purchase recorded |
| 409 | `already_purchased` | — | User already holds an item |
| 410 | `sold_out` | — | Stock exhausted |
| 400 | `sale_not_active` | — | Outside sale window |
| 400 | `invalid_request` | — | Missing or empty `userId` |

**Success example**

```json
{
  "result": "success",
  "userId": "alice@example.com",
  "purchasedAt": "2026-06-25T10:03:41.000Z"
}
```

---

### `GET /api/purchase/status?userId=:userId`

Returns whether a user has successfully purchased. Used by the frontend on page load to restore the "Purchased ✓" state.

**Query parameters**

| Param | Type | Required |
|-------|------|----------|
| `userId` | string | Yes |

**Responses**

```json
// Purchased
{ "purchased": true, "purchasedAt": "2026-06-25T10:03:41.000Z" }

// Not purchased
{ "purchased": false }
```

---

## Error Conventions

- No separate `error` key — all outcomes use `result`.
- Dates on the wire are always ISO 8601 strings (never epoch integers).
- Unmatched `/api/*` routes return **404** (narrowed catch-all regex prevents HTML fallback on typo'd API paths).

---

## Redis Data Model

| Key | Type | Purpose |
|-----|------|---------|
| `flash:stock` | Integer | Remaining inventory; initialized at startup via `SET NX` |
| `flash:purchased:{userId}` | String | Stores ISO 8601 purchase timestamp; key existence = purchased |

### Atomic Purchase Lua Script (`purchase.lua`)

5-step sequence executed as a single `EVALSHA` call:

1. If `flash:purchased:{userId}` exists → return `1` (`already_purchased`)
2. If `flash:stock` ≤ 0 → return `2` (`sold_out`)
3. `DECR flash:stock`
4. `SET flash:purchased:{userId} <timestamp>`
5. Return `0` (`success`)

Integer return codes are mapped to domain strings in `adapter.ts`.