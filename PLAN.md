# Store-One — Feature Plan

Living document. Each entry is a feature that moves the product toward [VISION.md](VISION.md).
Newest feature at the top. Tasks are sized so a single AI coding agent can finish one in ~15 minutes.

---

## How to implement this plan

**One worktree per feature, one branch per feature.** Each feature below is self-contained: four
tasks, each with a check that must pass before moving on. Do not mix two features in one branch —
the dependency and conflict notes below only hold if features land one at a time.

### Build order

Dependencies are real here; building out of order means writing code that a later feature deletes.

```
Feature 4 (auth)  ──┐
Feature 3 (locations) ──┴──> Feature 2 (agent bridge)
Feature 1 (menu blueprint) ──┘

Feature 5 (pricing + discounts) — independent, can go first or last
```

1. **Feature 1 — Menu Blueprint.** No dependencies. The best starting point: it is self-contained,
   and Features 2 and 3 both build on its primitives.
2. **Feature 3 — Locations.** Blocks Feature 2. Build before exposing anything to an agent.
3. **Feature 4 — API tokens.** Supersedes Feature 3's T2. If building 3 and 4 together, skip
   Feature 3 T2 entirely and take `locationId` from the token — do not build the
   `X-Store-Location` header only to delete it.
4. **Feature 2 — Agent Bridge.** Needs Feature 1 (for `apply_menu`) and Feature 3 (or it hands an
   agent write access to every store's menu).
5. **Feature 5 — Discounts.** Touches only the pricing path; independent of the other four.

### Features collide in these files — do not run them in parallel blind

`shared/api-handlers.ts` is touched by **all five features**. Parallel worktrees will conflict
there. Either land features serially, or expect to resolve that file on every merge.

| File | Features that modify it |
|---|---|
| `shared/api-handlers.ts` | 1, 2, 3, 4, 5 — every feature |
| `server/schema.ts` | 3 (locationId on ten tables), 4 (apiTokens table) |
| `server/storage.ts` | 3 (~40 methods) |
| `server/routes.ts` | 3, 4 |
| `server/bom-engine.ts` | 5 |
| New files, no conflict | `shared/menu-blueprint.ts` (1), `shared/mcp.ts` (2), `server/auth.ts` (4), `shared/pricing.ts` (5) |

Features 1 and 5 are the safest pair to run concurrently: both touch `api-handlers.ts`, but in
different regions (a new route versus the `/api/orders/simulate` body).

### Before you start: there is no test runner

Every task below ends in a `Check:`. As of this writing the repo has **no test runner, no test
files, and no `test` script** — `"check": "tsc"` is typecheck only. Verified against `package.json`.

This needs no new dependency. The Dockerfile pins `node:20-slim`, so `node:test` and `node:assert`
are available, and `tsx` is already installed:

```jsonc
// package.json
"test": "tsx --test \"{shared,server}/**/*.test.ts\""
```

Wire that up first. It matters most for **Feature 5 T1**, which describes itself as a pure refactor
where "any number that moves is a bug" — with zero coverage on `bom-engine`'s combo allocation and
rounding, nothing would catch a moved number. Write characterization tests for the existing pricing
output *before* extracting it, not after.

### Definition of done for any feature

All four tasks complete, every `Check:` passing, `npm run check` (tsc) clean, and the feature's own
stated "Definition of done" demonstrably true. A feature with three of four tasks done is not
partially shipped — it is unshipped, and several of these leave the system in a worse state
half-built than not started (Feature 3 T3 in particular).

---

## Feature 5 — Discounts, and the one pricing engine they need to live in

**Status:** planned
**Vision pillar:** #2 — VISION names discounts and promotions explicitly as agent-managed tasks
**Added:** 2026-08-09

### The finding

VISION.md says the agent should handle "creating products, combos, discounts, promotions etc."
Products and combos exist. **Discounts and promotions do not exist as entities at all.** The only
occurrences of the word in the schema are `discountValueCents` and `discountPercent` at
`shared/schema.ts:186-187` — both fields *on the combo record*, not a discount of their own. There
is no way to take 10% off an order, comp an item, or run a happy-hour price.

Investigating where a discount would plug in surfaced something bigger: **there are two pricing
implementations, and the good one is not the one serving orders.**

| | `server/bom-engine.ts` | `/api/orders/simulate` (`shared/api-handlers.ts:373`) |
|---|---|---|
| Reached by | `server/routes.ts` only, for the test-orders API | the actual POS order path |
| Combos | full support — three strategies, proportional allocation across lines | **none** |
| Tax | `taxRatePct` parameter, default `0` | **hardcoded `const taxRate = 0.08`** (line 451) |
| Inventory deduction | yes | no |

`grep -rn "bom-engine"` returns exactly one importer: `server/routes.ts:16`. The engine that knows
how to price a combo is not on the path that prices real orders.

Two things follow:

1. **Combos are already broken in the live path.** An operator creates a combo in the UI; the order
   path never looks at it and charges full price. That is a present-tense pricing bug, not a gap.
2. **A third tax rate.** `0.08` in `api-handlers.ts`, `0.0825` in `server/seed-data.ts:297`, and a
   `0` default in `bom-engine.ts`. A POS whose tax rate is a constant in three files is not
   deployable in any jurisdiction that did not happen to pick 8%.

Adding discounts to either engine alone would deepen the split. So this feature does the merge
first, and gets discounts almost for free afterward.

### The seam

`bom-engine.ts` cannot simply move to `shared/` — line 1 is `import { db } from "./db"`, so it is
bound to Postgres and would break the browser bundle the local server ships in.

But the split is clean: the **pricing math is already pure**. `allocateComboDiscounts`
(`bom-engine.ts:~295-335`) operates on plain arrays and returns a number; it touches no database.
Only the *loading* of products, variants, and modifiers is db-coupled.

So the seam is: pure pricing core → `shared/pricing.ts`; db loading stays in `server/bom-engine.ts`
and calls into it. Both servers then price identically, which is the same shape as every other
feature in this plan — one implementation in `shared/`, two hosts.

### Tasks

**T1 — Extract the pure pricing core** (~15 min)
- Create `shared/pricing.ts` and move the pure functions from `server/bom-engine.ts`:
  `allocateComboDiscounts` and the line-pricing math that builds `originalPriceCents` /
  `finalPriceCents` / `lineTotalCents`. Take already-loaded products, variants, and modifiers as
  **arguments** — the new module must import nothing from `server/`.
- `server/bom-engine.ts` keeps its db queries and calls the extracted functions. Its behaviour must
  not change at all in this task.
- Verify the new module imports neither `./db` nor `drizzle-orm`. If it needs either, the seam was
  cut in the wrong place — stop and re-cut rather than adding a shim.
- Check: run the existing test-orders flow (`docs/test-orders-api.md`) before and after and assert
  identical totals. This task is a pure refactor; any number that moves is a bug.

**T2 — Put the real order path on the shared core** (~15 min)
- Rewrite the `/api/orders/simulate` handler to call `shared/pricing.ts` instead of its own inline
  loop, passing the combos it now must load.
- **Combos start working in the live path as a result.** Treat that as the headline of this task,
  and confirm it explicitly rather than assuming it.
- Kill the hardcoded `taxRate = 0.08`. Read the rate from a store setting, defaulting to `0` — the
  same default `bom-engine` already uses. Zero is the honest default: a wrong tax rate silently
  charges customers incorrectly, while a zero one is obviously unconfigured. Per-location tax rates
  compose with Feature 3 once locations exist.
- Check: an order containing a combo now returns the combo price rather than the sum of its parts,
  and a store with no configured rate returns `taxCents: 0` rather than 8%.

**T3 — The discount entity** (~15 min)
- Add a `discounts` table and type: `id`, `name`, `scope` (`ORDER` | `ITEM`), `strategy`
  (`PERCENT` | `FIXED`), `percent`, `valueCents`, `active`, plus the standard `updatedAt` /
  `deletedAt`. Register it in the `crudEntities` array in `shared/api-handlers.ts` — each entry
  there is a single line and generates full CRUD, so do not hand-write routes.
- Apply discounts in `shared/pricing.ts`, **reusing `allocateComboDiscounts`' proportional
  allocation** rather than writing a second allocator. An order-level discount is the same problem
  the combo code already solves: spread a reduction across lines proportional to their share.
- Order of operations must be explicit and documented in the module: combo pricing → item
  discounts → order discounts → tax. Tax applies to the discounted subtotal. Getting this order
  wrong is the kind of bug that is invisible in testing and shows up in an audit.
- Clamp like the combo code does: a discount can never exceed the line or order total, and never
  produce a negative price. `allocateComboDiscounts` already does
  `Math.max(0, Math.min(discount, originalTotal))` — match it.
- Check: 10% off a $10 order is $9.00; a $50 fixed discount on a $10 order is $10.00 off and not
  a negative total; rounding across three unevenly-priced lines still sums exactly to the order
  total, with no stray cent.

**T4 — Expose discounts to the agent** (~15 min)
- Extend the Feature 1 menu blueprint with a `discounts` array so `menu/apply` can create and update
  them by name, and include them in the Feature 2 T1 blueprint export. The round-trip invariant
  still has to hold: export → apply is all `noop`.
- Add `apply_discount` to the Feature 2 MCP tool table so an agent can run "20% off pastries after
  4pm" as an actual operation.
- Document the order of operations from T3 in `docs/api-reference.md`. An agent applying discounts
  needs to know whether tax comes before or after, and so does the operator's accountant.

### Non-goals

Time-windowed promotions (happy hour), customer-specific or coupon-code discounts, loyalty, and
stacking rules between multiple discounts are all out of scope. **Stacking in particular:** this cut
applies at most one order-level discount, and that limit should be enforced rather than left
undefined. Promotions are the natural next feature once a discount entity exists — a promotion is
largely a discount plus a schedule.

### Known issue surfaced, not fixed here

`server/seed-data.ts:297` hardcodes `TAX_RATE = 0.0825` for generated demo sales. Once T2 makes the
rate configurable, the seed should use the same setting so demo data matches what the store would
actually charge. Small, and separate from this feature.

---

## Feature 4 — Location API tokens: the prerequisite the other three keep deferring

**Status:** planned
**Vision pillar:** prerequisite for both — nothing above ships publicly without it
**Blocks:** Features 1, 2, and 3 (all three end with "…but there is no auth yet")
**Added:** 2026-08-09

### The finding

There is no authentication anywhere on the server. `server/index.ts` is, in full:

```ts
app.use(express.json({ limit: "50mb" }));
app.use(router);
```

No middleware between the request and every admin route. A grep across `server/` for
`authorization`, `Bearer`, `session`, `cookie`, `jwt`, or `token` returns only seed-data rows
containing the word "cookie". The server binds `0.0.0.0` (`server/index.ts:268`).

The one thing that looks like auth is not. `client/src/components/pin-protection.tsx` defaults to
`requiredPin = "1234"`, compares in the browser, prints *"Default PIN: 1234"* on the dialog, and
carries the comment `// in real app, would validate against user`. It is a UI speed bump on a
trusted device, not access control, and it guards nothing on the server.

This has stopped being theoretical. The repo now has a `Dockerfile` and a `docker-compose.yml`
publishing `5000:5000` — the app is being packaged to deploy. The moment it lands on a public host,
every menu, sale, invoice, and employee record is world-readable and world-writable.

And each of the three features above ends with the same caveat:

- Feature 1 — an unauthenticated `menu/apply` lets anyone rewrite a live menu.
- Feature 2 — explicitly deferred auth and said to plan it as its own feature.
- Feature 3 — delivers isolation but not authorization; `X-Store-Location` is self-asserted, so
  anyone can name any location.

A plan that keeps deferring its own blocker is not a plan. This is that feature.

### The feature

**One static API token per location**, sent as `Authorization: Bearer <token>`, verified in exactly
one middleware ahead of the router.

The scope is deliberately, aggressively small. What this is *not*: no user accounts, no sessions, no
cookies, no OAuth, no password reset, no roles or permissions, no refresh tokens. Those are a
product. This is the lock on the door, and the door is currently open.

**The design point that pays for the whole feature:** the token *identifies the location*. Feature 3
T2 resolves tenancy from a self-asserted `X-Store-Location` header — a trust boundary with nothing
behind it. Once tokens exist, `locationId` comes from the verified token instead, and that header is
deleted. Feature 4 does not add a security check on top of Feature 3; it removes Feature 3's weakest
part. **Feature 3 T2 should be treated as superseded by this feature's T3.**

### Deliberate choices

- **`node:crypto`, no new dependency.** `scrypt` for hashing and `timingSafeEqual` for comparison
  are both in the standard library. Do not add `bcrypt` (a native build) or a JWT library — nothing
  here needs a stateless self-describing token, and a random 32-byte string in a table is simpler
  to reason about and trivially revocable.
- **Store hashes, never the token.** The plaintext token is shown exactly once, at mint time. A
  database leak should not hand over live credentials.
- **The local server is exempt.** `client/src/lib/local-server.ts` binds `127.0.0.1` and serves the
  device's own IndexedDB to the app running on that device. Requiring a token there adds a secret to
  manage on every tablet and protects nothing that the device's own lock screen does not.
- **Fail closed.** No token, unknown token, or malformed header → 401. In particular there must be
  no "if no tokens are configured, allow everything" bootstrap path — that branch is exactly the one
  that survives into production.

### Tasks

Each is completable by an AI agent in about 15 minutes.

**T1 — Token storage and minting** (~15 min)
- Add an `apiTokens` table to `server/schema.ts`: `id`, `locationId` (text), `tokenHash` (text),
  `salt` (text), `label` (text, so an operator can tell "tablet" from "agent"), `createdAt`,
  `lastUsedAt` (nullable), `revokedAt` (nullable). Generate the migration with `drizzle-kit`.
- Add a small script under `scripts/` that mints a token for a location: generate 32 random bytes
  via `crypto.randomBytes`, hex-encode, hash with `crypto.scrypt` and a per-token salt, insert the
  hash, and print the plaintext once with a clear "this will not be shown again" notice.
- Check: mint two tokens, assert the plaintext appears nowhere in the table, and that the stored
  hash verifies against the right plaintext and not the other one.

**T2 — The middleware** (~15 min)
- Add `server/auth.ts` exporting one Express middleware, and register it in `server/index.ts`
  **between** `express.json()` and `app.use(router)`. One registration point, one thing to audit.
- Parse `Authorization: Bearer <token>`, look up by hash, reject revoked tokens, and compare with
  `crypto.timingSafeEqual` — never `===`. Attach `{ locationId, tokenId }` to the request.
- Allowlist only what must be public: the static file serving and SPA catch-all in the
  `!isDev` block, plus a health endpoint if one is added. **Every `/api/*` route requires a token.**
  Write the allowlist as an explicit list of public paths, not as a list of protected prefixes — the
  default for a new route must be "protected", so that adding a route cannot accidentally add a hole.
- Update `lastUsedAt` on success, but do not block the response on that write.
- Check: assertions for no header → 401, garbage header → 401, valid token → passes with the right
  `locationId`, and revoked token → 401. Confirm a wrong-but-same-length token is rejected.

**T3 — Derive the location from the token; delete `X-Store-Location`** (~15 min)
- Set `ApiRequest.locationId` in `handleViaSharedHandlers` (`server/routes.ts:639`) from the
  authenticated token rather than the header. Remove the header parsing and its validation regex
  added in Feature 3 T2 — with tokens in place it is dead code, and a leftover header path that
  still works is a bypass of the thing you just built.
- The local server keeps passing the constant `'default'`; no change there.
- Check: a request bearing location A's token cannot read location B's products **even when it
  sends `X-Store-Location: B`**. That assertion is the point of the task — it fails loudly if the
  old path was left in.

**T4 — Docs, rotation, and the deploy warning** (~15 min)
- Document token minting, rotation, and revocation in `docs/agent-setup.md` (created in Feature 2
  T4) and `docs/local-setup.md`. Rotation is: mint the new token, move clients over, set
  `revokedAt` on the old one — no downtime, which is the reason for a token *table* rather than an
  env var.
- Update `docker-compose.yml`: it currently ships `POSTGRES_PASSWORD: postgres` and publishes
  `5432:5432` to the host. Fine for local development, dangerous as a deploy template. Add a comment
  saying so, and stop publishing the database port by default — the app container reaches the
  database over the compose network without it.
- Check: a fresh `docker compose up` followed by an unauthenticated `curl` of `/api/admin/products`
  returns 401, and the same call with a minted token returns data.

### Non-goals

Per-token scopes (read-only vs read-write), rate limiting, audit logging of which token changed
what, and anything to do with employee identity. Employee PINs and API tokens answer different
questions — *which staff member is at the till* versus *which machine may call the API* — and
merging them produces a system that does neither well.

The hardcoded `1234` in `pin-protection.tsx` is a separate known issue. It is not made better or
worse by this feature and should be tracked on its own; note that fixing it means validating
against `adminEmployees.pin` server-side, which is its own small feature.

### Definition of done

The server refuses every `/api/*` request without a valid token, the token determines which
location's data the caller sees, and an operator can rotate a compromised token without downtime.

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
delivers isolation, not authorization. Anyone who can reach the server can name any location.

**Feature 4 resolves this and supersedes T2.** Once location API tokens exist, `locationId` is
derived from the verified token and the `X-Store-Location` header is deleted outright. If Feature 4
is being built first or alongside, skip T2's header parsing entirely and take the location from the
token — T2 exists only so that Feature 3 can land independently, and its header path is meant to be
removed, not kept as a fallback.

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

**Status:** in progress — T1 done (`shared/menu-blueprint.ts`), T2–T4 unstarted
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
