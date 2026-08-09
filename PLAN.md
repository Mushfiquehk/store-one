# Store-One — Feature Plan

Living document. Each entry is a feature that moves the product toward [VISION.md](VISION.md).
Newest feature at the top. Tasks are sized so a single AI coding agent can finish one in ~15 minutes.

---

## Feature 3 — Locations: make a second store possible at all

**Status:** planned
**Vision pillar:** #1 — the easiest path to grow into a second location
**Blocks:** Feature 2 (an unscoped MCP endpoint would let any agent edit every store's menu)
**Added:** 2026-08-09

### The finding

The `admin_*` tables have no tenancy column. Verified in `server/schema.ts`: of every table in the
file, exactly two carry a `clientId` — `backups` and `syncRecords`. All **ten** `admin_*` tables do
not: `adminProducts`, `adminVariants`, `adminModifierGroups`, `adminModifiers`,
`adminProductModifierGroups`, `adminInventoryItems`, `adminBillOfMaterials`, `adminInvoices`,
`adminInvoiceLineItems`, and `adminSales`.

(`adminSales` is worth noting: the table exists server-side even though the Express adapter stubs
`listSales()` to `[]` — see Feature 2's capability table. It still needs the column, so that
whenever the server does start serving sales, it is scoped from day one rather than retrofitted.)

The storage layer matches. `adminStorage.listProducts` (`server/storage.ts:428`) builds its query as:

```ts
const conditions = [isNull(adminProducts.deletedAt)];
```

That is the entire filter. Every client hitting the Express admin API reads and writes **one global
menu**. There is a per-client sync layer sitting on top of a single-tenant admin store.

Two consequences, and the second is the reason this jumps the queue:

1. **The guiding star is unreachable.** "Grow into a second location" is the product's stated
   purpose, and there is currently no column in which a second location could exist. Not a missing
   feature — a missing dimension.
2. **It makes Feature 2 unsafe to ship.** Feature 2 mounts an MCP endpoint that hands an agent
   `apply_menu`. Against a global admin store, one operator's agent rewrites every operator's menu.
   Feature 2 should not be deployed against a shared server until this lands.

### The feature

Add a `locationId` to the admin tables, resolve it once per request, and scope every admin read and
write to it.

**Deliberately narrow choices**, because tenancy refactors are where projects disappear for a month:

- **`locationId` is `text`, not a foreign key to a new table.** Reuse the existing `clients.code`
  as the location identifier. There is already a client-code concept the sync layer and backups
  use (`storage.ts:1008`, `getClientSyncData`); a parallel `locations` table would be a second
  identity system to keep in sync with the first.
- **Backfill to a single default location, non-null after.** Existing rows get
  `locationId = 'default'`. Nothing breaks, and there is no nullable-tenant state where a forgotten
  filter silently returns everyone's data. Nullable tenancy columns are how these bugs survive
  code review.
- **Resolve the location in exactly one place**, at the handler boundary, never in individual
  route bodies. One resolution point is one thing to audit.
- **The local server always resolves to a single location.** An in-app IndexedDB database *is* one
  store's data; there is no cross-tenant risk there and no reason to complicate the Dexie adapter.

### Tasks

Each is completable by an AI agent in about 15 minutes. T3 is the one that matters — read its
warning before starting.

**T1 — Schema column and backfill migration** (~15 min)
- Add `locationId: text("location_id").notNull().default("default")` to all ten `admin_*` tables
  in `server/schema.ts`.
- Generate the Drizzle migration (`drizzle-kit` is already a dependency — do not hand-write SQL that
  the tool generates). Confirm the generated migration backfills existing rows via the column
  default rather than leaving them null.
- Add an index on `locationId` for each table. Every list query is about to filter on it, and
  adding the index later means a lock on a table that by then has real data in it.
- Check: run the migration against a database with seed data loaded and confirm every existing row
  reads back `location_id = 'default'` and no row is null.

**T2 — Resolve the location once, at the boundary** (~15 min)
- In `shared/api-handlers.ts`, extend `ApiRequest` with a `locationId: string` field, and read it
  from an `X-Store-Location` header in `handleViaSharedHandlers` (`server/routes.ts:639`) with
  `'default'` as the fallback.
- In `client/src/lib/local-server.ts`, set it to the constant `'default'` — the in-app database is
  already single-store.
- Validate the header: non-empty, and matching `/^[a-zA-Z0-9_-]{1,64}$/`. It is about to become
  part of a SQL predicate, and an unvalidated tenant identifier arriving from a header is a trust
  boundary. Reject anything else with a 400 rather than falling back to `'default'` — silently
  serving the wrong store's menu is worse than an error.
- Check: assertions that a valid header passes through, that a missing header yields `'default'`,
  and that a malformed one 400s.

**T3 — Scope the storage layer** (~15 min, and the one that can go wrong)
- Thread `locationId` through `IAdminStorage` and add it to every predicate in the admin methods in
  `server/storage.ts`: `and(isNull(x.deletedAt), eq(x.locationId, locationId))` on lists, and on
  `get`/`update`/`delete` **as a second condition alongside the primary key**.
- That last part is the whole security property and the easy thing to skip. IDs are
  client-generated and guessable; a `get` that matches on `id` alone reads across locations even
  though the list endpoint looks correctly scoped. Filter by ID *and* location on every
  single-record method.
- **Warning:** this touches roughly 40 methods. It is 15 minutes of mechanical work only if done
  mechanically — one method at a time, the same two-condition shape each time. If a method seems to
  need a different shape, stop and write it down rather than inventing a variant. A tenancy filter
  that is right 39 times out of 40 provides no security at all.
- Set `locationId` on insert in every `create*` method.
- Check: seed two locations with a same-named product each, then assert that a list scoped to A
  returns only A's row, and — the test that actually matters — that a `get` for **B's product ID
  under location A returns null**, not B's row.

**T4 — Clone a menu into a new location** (~15 min)
- Add `POST /api/admin/locations/:id/clone-from` taking `{ sourceLocationId, dryRun }`.
- Implement it as pure composition of what already exists: export the source location's blueprint
  (Feature 2 T1), then apply it to the target location (Feature 1). No new copy logic, no new
  entity walker. If this task requires writing a menu-traversal routine, the earlier features were
  built wrong and that is worth knowing.
- This is the product's guiding star as a single endpoint: opening store #2 starts with store #1's
  menu, previewable via `dryRun` before it lands, and the second location is a real store from its
  first minute rather than a blank database.
- Check: clone `default` into `store-2`, assert the blueprint exports of both are now identical,
  and assert location `default` was not modified.

### Non-goals

Per-location pricing, per-location availability (86'ing an item at one store), cross-location
reporting, and user↔location permissions are all out of scope. This feature adds the *dimension*;
those are the things worth building once it exists, and none of them are expressible today.

Note that **authentication is still absent** — `X-Store-Location` is self-asserted, so this feature
delivers isolation, not authorization. Anyone who can reach the server can name any location. That
is a real limit and it is exactly why the auth feature below the fold still needs to be planned and
built before anything is exposed publicly.

### Definition of done

Two locations, two independent menus, on one deployment — and an operator opening their second
store seeds its menu from their first with one call.

---

## Feature 2 — Agent Bridge: let an agent actually connect to the POS

**Status:** planned
**Vision pillar:** #2 — AI Agent first POS
**Depends on:** Feature 1 (uses `menu/apply` as its main write tool)
**Added:** 2026-08-09

### The problem

Feature 1 gives an agent a good pair of hands for the menu. It does not give the agent a way to
*reach* the POS. Today there is no agent-facing entry point of any kind in this repo — no MCP
server, no tool manifest, no LLM dependency in `package.json`. "An AI agent living alongside the
system" is, as of now, entirely unimplemented.

Two concrete gaps stand between the current REST API and a working agent:

1. **No connection.** An operator running Claude (desktop, mobile, or in this repo) has no way to
   point it at their store. The only integration path is "read `docs/api-reference.md` and hand-write
   `curl`", which is not something a restaurant owner does.
2. **No read half.** Even with `menu/apply`, an agent cannot safely *change* a menu it cannot see.
   Answering "what's on my menu and what does it cost" currently means `GET`ing products, variants,
   modifier groups, modifiers, and product-modifier-group links, then joining five arrays by ID —
   the same N+1 problem Feature 1 fixed for writes, unfixed for reads, and it burns an enormous
   amount of the agent's context on raw rows.

### The architectural constraint that shapes this feature

There are **two servers** running the same handler layer, and they do not have the same data:

| | Express server (`server/routes.ts`) | Local server (`client/src/lib/local-server.ts`) |
|---|---|---|
| Runs on | Node, port 5000 | In-app, `127.0.0.1:8080` via the Capacitor plugin |
| Storage | PostgreSQL via Drizzle | IndexedDB via Dexie |
| Menu data | yes | yes |
| **Sales data** | **no — returns 501** | yes |
| Reports, order simulate | **no — returns 501** | yes |

`server/routes.ts` has three explicit 501 responses saying so outright: *"Sales are stored
client-side in IndexedDB."* This is not a bug to route around; it is the offline-first design. It
means an agent's available capabilities depend on **which server it is talking to**, and the feature
has to model that honestly rather than advertising tools that will 501.

### The feature

A single **MCP endpoint mounted on the shared handler layer**:

```
POST /api/mcp
```

Because it lives in `shared/api-handlers.ts` alongside everything else, it is exposed by *both*
servers automatically — the same trick that makes Feature 1 work online and offline with one
implementation. Point an agent at port 5000 and it gets menu-management tools. Point it at the
in-app server on 8080 and it additionally gets sales and reporting tools. No second codebase, no
separate process to supervise, no new deployment unit.

**Tools exposed (first cut):**

| Tool | Backed by | Available on |
|---|---|---|
| `get_menu` | `GET /api/admin/menu/blueprint` (T1 below) | both |
| `apply_menu` | `POST /api/admin/menu/apply` (Feature 1) | both |
| `list_inventory` | `GET /api/admin/inventory-items` | both |
| `adjust_inventory` | `POST /api/admin/inventory-items/:id/adjust` | both |
| `sales_summary` | `GET /api/reports/sales-summary` | local only |
| `product_mix` | `GET /api/reports/product-mix` | local only |

`apply_menu` exposes `dryRun` as a first-class parameter, and its description tells the agent to
call it with `dryRun: true` and show the operator the change list before applying. The approval
step is part of the tool contract, not an afterthought.

### Do not add the MCP SDK

MCP is JSON-RPC 2.0 with three methods that matter here: `initialize`, `tools/list`, and
`tools/call`. Hand-writing that dispatch is roughly 80 lines and has no dependencies. Adding
`@modelcontextprotocol/sdk` would pull a Node-oriented package into `shared/`, which is also
bundled into the browser for the local server — the exact place where a Node-only transport
breaks.

```
ponytail: hand-rolled MCP over plain JSON-RPC POST. No SSE, no streaming,
no resources/prompts/sampling. Adopt @modelcontextprotocol/sdk if and when
server-initiated messages or resource subscriptions are actually needed.
```

### Tasks

Each is independently completable by an AI agent in about 15 minutes.

**T1 — `GET /api/admin/menu/blueprint`: the read half** (~15 min)
- In `shared/api-handlers.ts`, add a handler that reads products, variants, modifier groups,
  modifiers, and product-modifier-group links, and assembles them into **exactly the shape that
  `menu/apply` accepts** — nested, name-referenced, no IDs, no `updatedAt`, no `deletedAt`.
- Skip soft-deleted rows. Sort products and variants by name so the output is stable across calls;
  an agent diffing two exports should see only real changes.
- The invariant that makes this worth building: **export → apply is always a no-op.** Feeding the
  output of `menu/blueprint` straight into `menu/apply` must produce a change list that is entirely
  `noop`. That single property is what turns read + write into a safe edit loop: an agent fetches
  the menu, edits the JSON it already understands, and applies it back.
- Check: an assertion that seeds a small menu, exports it, runs it through `planMenuApply` from
  Feature 1 T2, and asserts every change is `noop`. This is the highest-value test in either feature
  — it pins both halves against each other.

**T2 — MCP JSON-RPC core** (~15 min)
- In a new `shared/mcp.ts`, implement the dispatch for `initialize` (reply with protocol version and
  `{ capabilities: { tools: {} } }`), `tools/list`, and `tools/call`.
- Handle JSON-RPC framing properly: echo the request `id`, return errors in the
  `{ code, message }` envelope rather than throwing, and return `-32601` for unknown methods and
  `-32602` for bad params. Notifications (a request with no `id`) get no response body.
- A tool result is `{ content: [{ type: "text", text: "<json>" }] }` — MCP tool output is text
  blocks, not raw JSON, and getting this wrong is the most common way a hand-rolled MCP server
  fails to work with a real client.
- Check: assertions for a valid `tools/list`, an unknown method returning `-32601`, and a
  notification returning nothing.

**T3 — Tool definitions and capability probing** (~15 min)
- Define the tool table above, each entry mapping to an existing route in `api-handlers.ts` with a
  JSON Schema for its input. Reuse the Feature 1 zod schema for `apply_menu`'s input schema rather
  than hand-writing a second copy that can drift.
- Register `POST /api/mcp` in `createApiHandlers`, dispatching into `shared/mcp.ts`.
- **Capability probing:** `tools/list` must only advertise tools the current storage adapter can
  actually serve. The Express adapter's `listSales()` returns `[]` and its report routes 501; the
  Dexie adapter serves both. Decide availability from the adapter — for example a
  `supports?: string[]` field on `ApiAdminStorage`, defaulting to full support so the local server
  needs no change — rather than sniffing the environment. An agent that is never offered
  `sales_summary` cannot waste a turn calling it and reading a 501.
- Check: a `tools/list` against a stub adapter without sales support omits `sales_summary` and
  `product_mix`, and includes them when support is declared.

**T4 — Connection docs** (~15 min)
- New `docs/agent-setup.md`: what the endpoint is, the two servers and their differing capability
  sets (reproduce the table above — this is the single most confusing thing about the system for
  anyone connecting an agent), a ready-to-paste MCP client config block, and a worked example of the
  read → dry-run → approve → apply loop.
- Link it from `docs/api-reference.md` and `replit.md` so it is discoverable from where people
  already look.

### Non-goals

No authentication on the MCP endpoint in this cut — it inherits whatever the admin API already has,
which is nothing, and the local server binds to `127.0.0.1` only. **Do not deploy the Express server
with `/api/mcp` reachable from the public internet until auth exists.** Write that warning into
`docs/agent-setup.md` as part of T4. Auth is its own feature and should be planned as one.

Also out of scope: streaming/SSE transport, MCP resources and prompts, employee and scheduling
tools, and any tool that moves money.

### Definition of done

An operator connects Claude to their store with one config block, asks "add a large oat milk latte
for $6.50", and watches the agent read the current menu, show them exactly what will change, and
apply it on approval — without the operator seeing a single ID, endpoint, or JSON payload.

---

## Feature 1 — Menu Blueprint: one declarative call to build an entire menu

**Status:** planned
**Vision pillar:** #2 — AI Agent first POS
**Added:** 2026-08-09

### The problem

The admin API today is a set of per-row CRUD endpoints (`shared/api-handlers.ts`,
`crudEntities`). For an agent to set up a modest restaurant menu — say 20 products, each with
2–3 variants, sharing 5 modifier groups — it must make roughly 100 sequential HTTP calls:

```
POST /api/admin/products          (per product)
POST /api/admin/variants          (per variant, needs productId from the previous response)
POST /api/admin/modifier-groups   (per group)
POST /api/admin/modifiers         (per modifier, needs modifierGroupId)
POST /api/admin/product-modifier-groups/set   (per product, needs both ids)
```

Three things make this hostile to an agent, and they map directly to why an operator today has
to "become a full time system administrator":

1. **No atomicity.** If call 63 fails schema validation, the menu is left half-built. There is no
   rollback and no way for the agent to know what it already created without re-listing everything.
2. **No idempotency.** Re-running the same setup duplicates every row, because IDs are
   client-generated and nothing dedupes by name. An agent that retries after a network blip
   corrupts the menu.
3. **No preview.** The operator has no chance to approve "here is what I'm about to create"
   before it lands. Agent-driven setup without a preview step is not something a business owner
   will trust with their live menu.

The consequence: "just tell the agent your menu and it builds it" is not actually reachable with
today's API. This feature is the primitive that makes it reachable.

### The feature

A single endpoint that takes a **declarative description of the menu** and makes the system match
it — the POS equivalent of `kubectl apply`.

```
POST /api/admin/menu/apply
```

**Request body:**

```json
{
  "dryRun": true,
  "modifierGroups": [
    {
      "name": "Milk",
      "minSelections": 1,
      "maxSelections": 1,
      "modifiers": [
        { "name": "Whole", "baseUpcharge": 0 },
        { "name": "Oat", "baseUpcharge": 75 }
      ]
    }
  ],
  "products": [
    {
      "name": "Latte",
      "type": "RESTAURANT",
      "variants": [
        { "name": "Small", "basePrice": 450 },
        { "name": "Large", "basePrice": 550 }
      ],
      "modifierGroups": ["Milk"]
    }
  ]
}
```

Note what the agent does **not** have to supply: no UUIDs, no foreign keys, no ordering, no
`updatedAt`. Entities reference each other **by name**. That is the whole point — a language model
writing this JSON from an operator's spoken menu should not have to run an ID bookkeeping
algorithm in its head.

**Response (same shape for `dryRun` and real runs):**

```json
{
  "data": {
    "applied": false,
    "changes": [
      { "op": "create", "entity": "modifierGroup", "name": "Milk", "id": "..." },
      { "op": "create", "entity": "modifier", "name": "Oat", "parent": "Milk" },
      { "op": "update", "entity": "variant", "name": "Latte / Large",
        "fields": { "basePrice": { "from": 500, "to": 550 } } },
      { "op": "noop",   "entity": "product",  "name": "Latte" }
    ],
    "errors": []
  }
}
```

### Semantics

- **Match by name, scoped to parent.** A product matches an existing non-deleted product with the
  same name (case-insensitive, trimmed). A variant matches within its product. A modifier matches
  within its modifier group. This is what makes the call idempotent: apply the same blueprint twice
  and the second run is all `noop`.
- **Upsert, never delete.** Anything present in the system but absent from the blueprint is left
  alone. Destructive sync is deliberately out of scope — an agent should not be able to wipe a live
  menu because a product was omitted from a payload. (Revisit as an explicit `prune: true` flag once
  there is a confirmation UI for it.)
- **`dryRun: true` computes the full change list and writes nothing.** Same code path, guarded at
  the write boundary, so the preview cannot drift from what actually happens.
- **Validate everything before writing anything.** Collect all errors in one pass and return them
  together; if `errors` is non-empty, apply nothing. An agent gets one round trip to fix all its
  mistakes rather than discovering them one failed call at a time.
- **Ordering is handled server-side.** Modifier groups resolve first, then products, then variants,
  then product↔group links — so the agent can send the blueprint in whatever order it composed it.

### Why it lands in `shared/api-handlers.ts`

That module is the single handler layer consumed by both the Express server (`server/routes.ts`)
and the in-browser offline server (`client/src/lib/local-server.ts`), against the
`ApiAdminStorage` interface. Building the endpoint there means it works online and offline with no
second implementation — an agent can set up a menu on a tablet with no connectivity. Any approach
that reaches for the database directly forfeits that and should be rejected in review.

### Non-goals for this feature

Combos, product groups, inventory items, BOM/recipe links, discounts, and promotions are all
out of scope for the first cut. Products + variants + modifier groups is the spine of a menu and
the piece an operator must get through before the POS is usable at all. Everything else extends
the same blueprint shape later.

### Tasks

Each is independently completable by an AI agent in about 15 minutes. Do them in order; each
leaves the tree green.

**T1 — Blueprint types and Zod schema** (~15 min)
- In a new `shared/menu-blueprint.ts`, add the `MenuBlueprint` TypeScript types plus a `zod` schema
  that parses and validates the request body. `zod` is already a dependency — do not add a
  validation library.
- Rules: names required and non-empty after trim; `basePrice` and `baseUpcharge` are non-negative
  integer cents; `minSelections <= maxSelections`; a product's `modifierGroups` entries must each
  name a group defined in the blueprint or one that already exists (the second half of that check
  belongs in T2, not here).
- Check: one assertion block proving a good blueprint parses and a bad one — a negative price and a
  blank name — fails with **both** errors reported, not just the first.

**T2 — The diff planner** (~15 min)
- In the same module, add a pure function `planMenuApply(blueprint, existing)` that takes the parsed
  blueprint plus the current `{ products, variants, modifierGroups, modifiers,
  productModifierGroups }` arrays and returns `{ changes, errors }` — no I/O, no storage calls.
- Implement the name-matching rules above, including case-insensitive trimmed comparison and
  ignoring rows where `deletedAt` is non-null.
- Emit `noop` entries for unchanged rows; the operator-facing preview is much more trustworthy when
  it says "18 unchanged, 2 updated" than when it silently omits the unchanged ones.
- Check: assertions covering the three cases that matter — empty system creates everything,
  identical re-apply is all `noop`, and a changed price produces exactly one `update` with correct
  `from`/`to`.

**T3 — Wire the endpoint** (~15 min)
- In `shared/api-handlers.ts`, register `POST /api/admin/menu/apply` alongside the existing
  hand-written routes (follow the pattern used by `/api/orders/simulate` at `api-handlers.ts:373`,
  which already does
  multi-entity reads and a write).
- Flow: parse with the T1 schema → load current state via the existing `ApiAdminStorage` list
  methods → `planMenuApply` → if `errors.length` return 400 with them → if `dryRun` return 200 with
  `applied: false` → otherwise execute the changes through the existing `create*` / `update*` /
  `setProductModifierGroups` methods and return `applied: true`.
- Generate IDs the same way the rest of the codebase does (client-generated UUID strings); do not
  invent a new ID scheme.
- Check: run the server and apply a two-product blueprint twice — the second run must report all
  `noop` and leave row counts unchanged.

**T4 — Document it** (~15 min)
- Add a `Menu Blueprint` section to `docs/api-reference.md` following the existing conventions
  (response envelope, error shape), with a complete worked example and an explicit statement of
  the idempotency and no-delete guarantees.
- This task is not optional polish. The document is how an agent driving this POS learns the
  endpoint exists and what it promises; an undocumented agent-facing API is an unusable one.

### Definition of done

An agent handed an operator's menu in plain language can call `menu/apply` once with `dryRun: true`,
show the operator a readable list of what will change, and on approval call it again to build the
menu — with a failed or repeated call leaving the menu in a consistent state either way.
