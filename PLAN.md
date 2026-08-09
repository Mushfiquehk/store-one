# Store-One — Feature Plan

Living document. Each entry is a feature that moves the product toward [VISION.md](VISION.md).
Newest feature at the top. Tasks are sized so a single AI coding agent can finish one in ~15 minutes.

---

## How to implement this plan

**One worktree per feature, one branch per feature.** Each feature below is self-contained: four
tasks, each with a check that must pass before moving on. Do not mix two features in one branch —
the dependency and conflict notes below only hold if features land one at a time.

### Build order

**Start with Feature 7 T1.** It is a one-file, few-line change that converts silent data loss into a
loud error, and it is independent of everything else. Nothing in this plan is worth building on top
of a server that reports success for writes it discarded.

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
6. **Feature 6 — Day One setup status.** Independent of 3, 4 and 5. Its T4 needs Feature 2's MCP
   tool table, and it asks Feature 1 T2 for a one-line change (ignore `demo_`-prefixed rows when
   matching by name) — make that change while building Feature 1, not afterwards.

### Features collide in these files — do not run them in parallel blind

`shared/api-handlers.ts` is touched by **all five features**. Parallel worktrees will conflict
there. Either land features serially, or expect to resolve that file on every merge.

| File | Features that modify it |
|---|---|
| `shared/api-handlers.ts` | 1, 2, 3, 4, 5, 6 — every feature |
| `server/schema.ts` | 3 (locationId on ten tables), 4 (apiTokens table) |
| `server/storage.ts` | 3 (~40 methods) |
| `server/routes.ts` | 3, 4, 6 (moves the demo-clear handler out), 7 (the adapter stubs) |
| `server/bom-engine.ts` | 5 |
| `client/src/pages/onboarding.tsx` | 6 |
| `client/src/lib/sync.ts` | 8 |
| `server/storage.ts` (sync engine) | 8 — a different region from Feature 3's ~40 CRUD methods |
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

## Feature 10 — Menu margins: the number that decides whether there is a second location

**Status:** planned
**Vision pillar:** #1 — the guiding star itself, "boost their business into getting a second location"
**Depends on:** Feature 5 T1 (needs the pure pricing/BOM functions out of `server/bom-engine.ts`)
**Added:** 2026-08-09

### The finding

Features 1–9 are foundation, plumbing, and bug fixes. Necessary, but none of them help a business
*grow*, which is what VISION.md actually asks for. This is the gap.

**Nothing in the codebase computes cost, margin, or profit.** A grep for those words across
`server/`, `shared/`, and the reports page returns only CSS `margin` properties. The three report
endpoints — `sales-summary`, `product-mix`, `inventory-status` (`shared/api-handlers.ts:504, 534,
571`) — are all volume and revenue. An operator can see that they sold 200 croissants and cannot see
whether they made money on any of them.

**Every input already exists:**

| Input | Where |
|---|---|
| What an item costs to make | `billOfMaterials.quantityDeducted` × `inventoryItems.lastPurchasePrice` (`server/schema.ts:101, 90`) |
| What it sells for | `variants.basePrice` |
| What actually sold | `sales.linesJson` |
| What was really paid for stock | `invoiceLineItems.unitPriceCents` |

And the hard part is already written. `computeInventoryDeductions` (`server/bom-engine.ts:203`) is a
**pure function** taking line items plus preloaded data and returning
`Map<inventoryItemId, quantity>` — already handling modifiers, scale factors, and composite
products. Costing one variant is that map, priced:

```
cost(variant) = Σ over computeInventoryDeductions([{variantId, qty: 1}], data)
                  of quantity × inventoryItem.lastPurchasePrice
```

Do not write a second BOM traversal. If this feature grows one, it was built wrong.

### Why this is the growth feature

Food cost percentage is the number restaurant operators actually run on. It decides which items to
push, which to reprice, and which to cut — and whether the business throws off enough margin to
fund a second location. It is also the most useful thing an agent could tell an operator without
being asked: *"your croissant is priced below what it costs you to make."* That is Pillar 2's
"maintain", as opposed to the setup work Features 1 and 6 cover.

### The honesty requirement

`lastPurchasePrice` is nullable (`server/schema.ts:90`). An item whose ingredients have no recorded
price has an **unknown** cost, not a zero cost — and zero cost renders as 100% margin, which is the
most flattering possible lie about a menu. Every task below must keep "unknown" distinct from
"zero", and the API must say which ingredients are missing prices so the operator can fix it. A
margin report that quietly treats missing data as free is worse than no report.

### Tasks

**T1 — Cost per variant** (~15 min)
- Add `costVariant(variantId, data)` to `shared/pricing.ts` (created by Feature 5 T1, which is what
  moves `computeInventoryDeductions` out of the db-coupled `bom-engine.ts`). Reuse that function;
  do not re-walk the BOM.
- Return `{ costCents, unknownIngredients: string[] }` — never a bare number. If any contributing
  inventory item has a null `lastPurchasePrice`, name it. The caller decides how to present partial
  information; the costing function must not decide by silently dropping it.
- Check: a variant with fully-priced ingredients returns the expected cost; a variant with one
  unpriced ingredient returns that ingredient's name and does **not** report a lower cost as if it
  were free.

**T2 — `GET /api/reports/menu-margins`** (~15 min)
- One row per variant: name, `priceCents`, `costCents`, `marginCents`, `marginPct`, and
  `costKnown: boolean`. Sort worst-margin first — the rows an operator needs are the bad ones, and
  a report that opens on the best sellers buries them.
- Include a `?since=` window and join against `product-mix` volumes so rows carry the weighted
  contribution, not just per-unit margin. A terrible margin on an item that sells twice a month
  matters less than a mediocre one on the top seller, and per-unit margin alone cannot show that.
- Register in `shared/api-handlers.ts` so both servers expose it. Note it needs sales data, so it
  falls under Feature 2's capability probing — and after Feature 7 T2, the Express server can serve
  it too.
- Check: an item priced below its ingredient cost reports a negative margin rather than clamping to
  zero. Negative margins are the entire point of the report.

**T3 — Show it** (~15 min)
- Add a margins table to `client/src/pages/reports.tsx` alongside the existing reports, worst first,
  with unknown-cost rows visibly flagged rather than sorted as if their margin were 100%.
- Give unknown-cost rows a direct link to the inventory item that needs a price. The report's job is
  to be actionable, and "go find which of your 60 ingredients is missing a price" is not.
- Check: with seeded demo data, items with no `lastPurchasePrice` render as unknown and do not
  appear as the most profitable items on the menu.

**T4 — Let the agent use it** (~15 min)
- Add `menu_margins` to the Feature 2 MCP tool table, described so an agent knows to check margins
  before proposing price changes — this is the read that makes Feature 5's discount tooling safe.
  An agent that can apply a 20% discount without seeing that the item runs a 15% margin is a
  liability.
- Document the interaction in `docs/agent-setup.md`: read margins → propose repricing → dry-run
  through `menu/apply` → operator approves. Same read-propose-preview-apply loop as Feature 6, which
  is the pattern this whole plan keeps converging on.
- Check: after an `apply_menu` price change, `menu_margins` reflects the new margin with no other
  call.

### Non-goals

Yield and waste factors (a 10kg case of tomatoes does not yield 10kg of usable tomato), labour cost
per item, prep-time weighting, supplier price-trend analysis, and any "you are ready for a second
location" scoring. That last one is tempting and should be resisted until the margin numbers have
been trusted by a real operator for a few months — a readiness score built on unvalidated cost data
is a confident wrong answer about someone's livelihood.

### A unit hazard worth naming

`inventoryItems.unitOfMeasure` is free text and `billOfMaterials.quantityDeducted` is a bare number.
Nothing enforces that a BOM quantity is in the same unit as the item's purchase price. Grams against
a per-kilo price is a 1000× costing error that looks entirely plausible on screen. This feature does
not fix it, but T1 should surface the item's `unitOfMeasure` in its output so the mismatch is at
least visible, and it is worth its own feature.

### Definition of done

An operator opens Reports and sees, worst first, which menu items make money and which do not — with
anything the system cannot cost honestly labelled as unknown rather than flattered.

---

## Feature 9 — A backup that contains everything, and a restore that cannot wipe you

**Status:** planned
**Vision pillar:** #1 — "the best foundation". This is the one that loses a business its records.
**Added:** 2026-08-09

### The finding

Backup and restore both exist and both work, in `client/src/pages/settings.tsx`. The card describes
them as *"Full snapshot backup of all local data"* (line 740). It is not.

The snapshot is a hand-written object literal (line 256) listing **ten** tables:

```
products, variants, modifierGroups, productModifierGroups, modifiers,
inventoryItems, billOfMaterials, employees, timePunches, sales
```

The Dexie database defines **sixteen**. These six are in `client/src/lib/db.ts` and in
`SYNC_CATEGORY_TABLES` (`shared/schema.ts:32-35`), but in neither backup nor restore:

```
combos, comboItems, productGroups, productGroupItems, invoices, invoiceLineItems
```

So an operator who builds combos and product groups, then restores from backup, loses all of them.
Supplier invoices too. The word "Full" in that description is the dangerous part — it is the reason
nobody would think to check.

**Three defects, in descending order of how much they cost:**

1. **Backup silently omits six of sixteen tables** while claiming to be complete.
2. **Restore clears tables it may not repopulate.** It unconditionally `.clear()`s all ten tables,
   then writes each back only `if (snapshot.X?.length)`. A snapshot that is missing a key, or has an
   empty array for it, leaves that table wiped with nothing put back. Restoring a menu-only snapshot
   deletes the sales history.
3. **Restore has no confirmation.** `handleRestore` validates that a client code was typed, then
   goes straight to fetching and wiping ten tables. A mistyped code that happens to match another
   store replaces this device's data with theirs, with no prompt and no undo.

And underneath all three: **the table list is written out by hand three times** — once in the
backup literal, once in the restore `clear()` block, once in the restore `bulkPut` block. Three
hand-maintained copies of the same list is why six tables fell out of two of them. Adding the
missing tables to all three lists fixes today's symptom and leaves the mechanism that produced it
fully intact.

### The feature

One list, derived once, used by both paths — then make restore non-destructive by construction.

### Tasks

**T1 — One table list, no hand-maintained copies** (~15 min)
- Export a single `BACKUP_TABLES` array from `client/src/lib/db.ts`, next to the Dexie schema it
  must stay in step with — all sixteen tables.
- Rewrite backup to build its snapshot by iterating that list, and restore to clear and repopulate
  by iterating the same list. No table name should appear literally in `settings.tsx` afterwards.
- Add an assertion that `BACKUP_TABLES` covers every table in the Dexie schema, so a table added
  later fails loudly instead of being silently excluded from backups for a year.
- Check: back up a database containing combos and invoices, inspect the uploaded snapshot, and
  confirm all sixteen keys are present.

**T2 — Restore that cannot destroy what it is not replacing** (~15 min)
- Validate the snapshot **before** touching the database: confirm it is an object and that every key
  it contains is a known table. Reject and abort with a clear message otherwise. Nothing should be
  cleared until the snapshot has been shown to be usable.
- Clear only tables the snapshot actually carries a key for. A snapshot with an explicit empty array
  for `sales` means "no sales" and should clear; a snapshot with **no `sales` key at all** is an
  older or partial format and must leave the table alone rather than wipe it.
- Keep the whole thing in the existing Dexie `rw` transaction so a mid-restore failure rolls back.
  That part is already right — do not lose it in the rewrite.
- Check: restoring a snapshot containing only `products` leaves existing sales intact; restoring one
  with `sales: []` clears sales. Those two cases must behave differently.

**T3 — Confirm before wiping, and say what will be lost** (~15 min)
- Put a confirmation in front of restore that names the client code being restored from, the
  backup's `createdAt`, and the row counts about to be replaced — "this will replace 412 sales and
  38 products on this device". The endpoint already returns `createdAt`; the counts are a local
  count before the write.
- The current flow can silently replace one store's data with another's on a typo. This is the only
  irreversible action in the app.
- While here: the success message says *"Reload the page to see updated data."* If a reload is
  required for correctness, trigger it rather than asking — a user who does not reload is looking
  at stale state after a destructive operation.
- Check: cancelling the confirmation leaves every table untouched.

**T4 — Make backup happen without being remembered** (~15 min)
- Backup is manual only. `client/src/lib/sync.ts:200-208` has a `setInterval` auto-timer, but it
  drives **auto-sync**, not backup — there is no automatic backup anywhere. A small restaurant's
  disaster recovery currently depends on the owner remembering to open Settings and click a button.
- Reuse the existing auto-sync timer pattern rather than adding a second scheduler: same
  enabled/interval settings shape, same `localStorage` key convention (`cornerpos_sync_` prefix),
  a separate interval for backup.
- Surface "last backup" with its age on the Settings card, and in the Feature 6 setup status. A
  backup that last ran three weeks ago should look wrong at a glance.
- Skip the upload when nothing has changed since the last backup — compare the max `updatedAt`
  across tables against the last backup time. Snapshots are whole-database blobs; re-uploading an
  unchanged one on a timer is pure waste.
- Check: with auto-backup enabled and a short interval, a change triggers exactly one upload and an
  idle period triggers none.

### Correction to Feature 8

Feature 8's non-goals state that no restore path is exercised anywhere. That is wrong — restore
exists in `settings.tsx` and does write the snapshot back into Dexie. The real problems are the
three above, not the absence of a restore.

### Non-goals

Server-side backup scheduling, multiple retained backup versions (`getLatestBackup` returns only the
most recent, so there is exactly one restore point per client — worth revisiting, but a schema and
retention question), point-in-time recovery, and export to a file the operator holds themselves.

### Definition of done

A backup contains every table the app stores, restoring one cannot delete data it is not replacing,
restore asks first, and a store that has not been backed up in weeks says so.

---

## Feature 8 — Sync that converges, and a conflict policy that is written down

**Status:** planned
**Vision pillar:** #1 — "the best foundation". Sales records are the business's books.
**Added:** 2026-08-09

### How sync works today

Clients push changed rows per category to `POST /api/sync/:category`; the server stores them as JSON
blobs in `syncRecords`, keyed `(clientId, tableName, recordId)`, and returns `serverChanges` for the
client to apply. `processSyncChanges` (`server/storage.ts:215`) is the whole conflict engine.

For the menu tables it builds an `adminLookups` map — `products`, `variants`, `modifierGroups`,
`modifiers`, `productModifierGroups` — and for each incoming change looks up the corresponding
`admin_*` row. That design intent is sound: the admin console owns the menu, POS devices consume it.

Two problems with the implementation.

### Problem 1 — the comparison can essentially never be equal

```ts
const posDataJson  = JSON.stringify(change.data);
const adminDataJson = JSON.stringify(adminData);
const dataMatches = posDataJson === adminDataJson && change.deletedAt === adminDeletedAt;
```

`JSON.stringify` is sensitive to key order and to the exact set of keys. The two sides are built by
entirely different machinery:

- `adminData` is a Drizzle row — every column, in schema-definition order.
- `change.data` is `data: record` straight out of Dexie (`client/src/lib/sync.ts:97`) — whatever
  shape the client wrote, in its own key order.

So they differ on key order, and separately on field set: `adminProducts` carries a `createdAt`
column the client record need not have, and Feature 3 is about to add `locationId` to all ten tables,
widening the gap further.

When `dataMatches` is false the server overwrites the sync record with the admin version and pushes
it back to the client. If the comparison never returns true, **every menu record is pushed to every
client on every sync, forever.** Sync does not converge; it just moves the same rows back and forth.

### Problem 2 — "admin wins" is unconditional, and undocumented

`adminUpdatedAt` is read out of the row and written into `syncRecords`, but it is **never compared
to `change.updatedAt`**. Whenever the two sides differ, admin wins regardless of which edit is newer.

For menu data that may well be the intended policy — but it is nowhere stated, and it means a newer
POS-side edit is discarded silently. A conflict policy that lives only in the shape of an `if`
statement is one that gets reversed by accident during the next refactor.

### The feature

Make sync converge, and write the policy down where it can be checked.

### Tasks

**T1 — Confirm the mismatch, then fix the comparison** (~15 min)
- **Confirm before fixing.** Add temporary logging of `posDataJson` and `adminDataJson` on a
  mismatch and run one sync against seeded data. The reasoning above predicts they differ on key
  order and field set; verify that is what is actually happening rather than trusting the analysis.
  If they match, the real cause is elsewhere and the rest of this task is wrong.
- Replace the string comparison with a value comparison over an **explicit field list per table** —
  the fields sync is actually responsible for. Not a deep-equal over whatever keys happen to be
  present: an explicit projection also stops server-only columns (`locationId`, `createdAt`) from
  ever counting as a difference.
- Normalise before comparing: treat `undefined` and `null` as equal, and compare numbers as numbers.
  Dexie and Postgres disagree about empty values often enough that this is where the next
  false-mismatch will come from.
- Check: two semantically identical records with different key insertion order and one extra
  server-only field compare as equal.

**T2 — Make the conflict policy explicit** (~15 min)
- Write the policy as a named function — `resolveConflict(pos, admin)` returning which side wins and
  why — rather than leaving it implicit in control flow. One place to read, one place to change.
- Keep admin-wins for the menu tables if that is the intent, but make it a stated rule with a
  comment explaining *why* (the admin console is the source of truth for the menu; POS devices
  consume it). For tables with no admin counterpart, last-write-wins on `updatedAt` is the fallback
  that is already implied — state it.
- Fix the timestamp fallback at `client/src/lib/sync.ts:99`:
  `updatedAt: (record.updatedAt as number) || Date.now()`. A record with no `updatedAt` is stamped
  *now*, which makes the oldest data in the system look like the newest — precisely backwards for
  last-write-wins.
- Check: an admin-owned table resolves to admin even when the POS record is newer; a non-admin table
  resolves to whichever side has the greater `updatedAt`.

**T3 — The convergence test** (~15 min)
- The load-bearing check for this whole feature: seed data, sync, then **sync again with no changes
  in between and assert the second round pushes zero and pulls zero.** That single assertion is what
  proves the system reaches a fixed point, and it is exactly what fails today.
- Then: change one field on the client, sync, and assert exactly one record moves — not the whole
  table.
- Add a third case for the delete path, since `deletedAt` participates in the comparison and
  soft-deletes are the easiest thing to get wrong when reworking equality.

**T4 — Resolve the two-writer question for sales** (~15 min, deferred here from Feature 7)
- Sales reach the server two ways: `bom-engine.ts:447` inserts into `adminSales` directly for test
  orders, and POS sales flow through `syncRecords` as JSON blobs under the `sales` sync group
  (`shared/schema.ts:34`). After Feature 7 T2 wires `createSale` through, there is a third.
- Note that `sales` has **no entry in `adminLookups`**, so sync treats it as a plain blob table while
  `adminSales` is separately a real table with real rows. Determine what actually happens today when
  the same sale arrives by both paths, and write the answer down.
- Decide one owner for sales rows and route the others through it. Do not add reconciliation logic
  between two writers — that is a second system to keep correct.
- **This task is an investigation first.** If it turns out to need more than a 15-minute change,
  the deliverable is a written finding and a follow-up feature entry in this file, not a rushed fix
  to the path that carries the business's revenue records.

### Non-goals

Real-time or push-based sync, multi-device conflict UI, and per-field merge. Backup and restore are
handled by Feature 9.

### Definition of done

Two consecutive syncs with no intervening edits move zero records, the conflict policy is a named
function with a stated rule, and sales have exactly one writer.

---

## Feature 7 — Stop the server accepting data it silently throws away

**Status:** planned
**Vision pillar:** #1 — "the best foundation". A POS that discards sales is not a foundation.
**Added:** 2026-08-09

### The finding

`server/routes.ts:622-632` defines the Express storage adapter. Most of it delegates to
`adminStorage`. These eleven lines do not:

```ts
async listSales()      { return []; },
async getSale()        { return null; },
async createSale(d)    { return d; },      // <-- accepts, echoes, saves nothing
async updateSale()     { return null; },

async listEmployees()  { return []; },
async getEmployee()    { return null; },
async createEmployee(d){ return d; },      // <-- same
async updateEmployee() { return null; },

async listTimePunches(){ return []; },
```

`createSale(d) { return d; }` is the serious one. `POST /api/admin/sales` returns **200 with the
sale echoed back**. A caller — a client, an integration, an agent — cannot distinguish "saved" from
"discarded", because the response looks exactly like success. The sale is gone.

**And the real implementation already exists.** `server/storage.ts` has working `listSales` (line
853), `getSale` (856), and `createSale` (860) — the last one an upsert that writes to the
`adminSales` table, which is fully defined at `server/schema.ts:130`. The adapter shadows a working
implementation sitting three files over. This is not a missing feature; it is a disconnected wire.

Two more things surfaced alongside it:

- **`storeSettings` is implemented and unreachable.** A key/value table (`server/schema.ts:146`)
  with working get/set/list in `storage.ts:1068-1083`, imported by nothing outside that file. No
  route, no handler. Feature 5 T2 needs "read the tax rate from a store setting" — that store
  already exists and just needs a door.
- **Employees genuinely do not exist server-side.** `grep -c "employees" server/schema.ts` returns
  **0**. There is no table and no storage method — so unlike sales, the employee stubs are not
  shadowing anything. They are inventing success for a feature that was never built. Employees live
  only in the client's Dexie database.

### The principle

A stub that returns a 501 with an explanation is fine — `server/routes.ts` already does exactly
that in three places for reports and order simulation, with a clear message about IndexedDB. That
pattern is honest and it is already in the codebase. A stub that returns fake success is not a stub,
it is a data-loss bug wearing a stub's clothes.

So this feature has a cheap first task that stops the bleeding, and slower ones that connect the
wires properly. Do them in order — T1 alone is worth shipping on its own.

### Tasks

**T1 — Make the lying stubs honest** (~15 min)
- Replace every fake-success stub in `server/routes.ts:622-632` with a 501 carrying a message in
  the same style as the existing report stubs. `createSale` and `createEmployee` are the urgent
  ones; a write that reports success and persists nothing is the worst failure mode available.
- Do **not** implement anything in this task. It is a small, obviously-correct diff that converts
  silent data loss into a loud, diagnosable error, and it should be reviewable in a minute.
- Check: `POST /api/admin/sales` returns 501 with an explanatory body rather than 200 and the echoed
  payload.

**T2 — Connect sales to the storage that already works** (~15 min)
- Delete the four sales stubs and delegate to `adminStorage`, exactly like the neighbouring
  inventory and invoice entries: `listSales: () => adminStorage.listSales()`, and so on.
- `updateSale` is the one that genuinely does not exist in `storage.ts` — write it, following
  `updateProduct` (`storage.ts:455`) for the shape: build a partial `set`, always bump `updatedAt`,
  return the updated row or `null`.
- Check: `POST` a sale, then `GET /api/admin/sales/:id` and confirm the persisted row comes back
  with matching totals — and confirm it survives a server restart. The restart is the assertion that
  actually distinguishes this from the bug being fixed.

**T3 — Give `storeSettings` a door** (~15 min)
- Add `getSetting` / `setSetting` / `listSettings` to the `ApiAdminStorage` interface in
  `shared/api-handlers.ts`, plus `GET`/`PUT /api/admin/settings/:key` and `GET /api/admin/settings`.
  Delegate to the existing `storage.ts:1068-1083` methods on the Express side; back them with a
  Dexie table on the local side.
- Validate the key (`/^[a-z0-9._-]{1,64}$/`) — it is a primary key arriving from a request.
- **This unblocks Feature 5 T2's configurable tax rate with no new table.** Note the key name there
  and here so both features agree: `tax.ratePct`.
- Check: set a value, read it back, overwrite it, confirm `updatedAt` moved and no duplicate row
  was created.

**T4 — Decide employees honestly, and fix what this changes downstream** (~15 min)
- Employees have no table and no storage. Either add `adminEmployees` (mirroring the
  `shared/schema.ts` `Employee` type: `id`, `name`, `role`, `payRate`, `pin`, `email`) with four
  storage methods and delegation, or leave the T1 501s in place. **Leaving the 501 is a legitimate
  outcome** — the client already manages employees in Dexie, and inventing a half-server-side
  employee model to satisfy a stub is how the sales bug happened in the first place. Whichever is
  chosen, record it in the code as a comment rather than leaving a bare stub for the next reader to
  re-litigate.
- If employees do get a table: PINs must not be stored in plaintext. Reuse the `scrypt` hashing
  from Feature 4 T1 rather than adding a second scheme. If that seems like too much for this task,
  that is the signal to take the 501.
- **Update Feature 2's capability table.** It states that `sales_summary` and `product_mix` are
  local-only because "the Express adapter's `listSales()` returns `[]`". After T2 that is no longer
  true for sales data, and the capability probing must reflect it or the Express server will
  under-advertise what it can do.
- **Update Feature 3.** `adminSales` is one of the ten tables getting a `locationId`; now that sales
  actually persist there, its scoping stops being theoretical.
- Check: whichever path is taken for employees, `GET /api/admin/employees` never returns `[]` while
  employees exist somewhere — it either returns them or says it cannot serve them.

### Non-goals

Time punches, scheduling (`scheduleShifts` exists at `server/schema.ts:152` and is equally
unreachable), and reconciling the two sales paths — `bom-engine.ts:447` writes `adminSales` directly
for test orders, while sales also flow through `syncRecords` as JSON blobs under the `sales` sync
group (`shared/schema.ts:34`). **Two writers into one table via different paths is worth a proper
look**, but it is a separate investigation and should not be smuggled into a bug fix.

### Definition of done

No endpoint on this server returns success for a write it did not perform. Sales posted to the
Express server survive a restart, and a store setting can be read and written through the API.

---

## Feature 6 — Day One: a setup checklist that knows where you are

**Status:** planned
**Vision pillar:** #1 — "the easiest path to grow a business", starting with getting set up at all
**Added:** 2026-08-09

### The finding

Pillar 1 is the least-served part of the vision so far. Features 1–5 are all plumbing. The actual
first-run experience is this:

- **`client/src/pages/onboarding.tsx` is 158 lines of static links.** Five `StepCard`s — Inventory,
  Recipes, Menu, Link recipes, Open POS — each taking `{ n, title, body, icon, href, cta, testid }`.
  There is no `completed` prop and no data fetch in the file. The checklist cannot tell an operator
  what they have already done. Someone who sets up inventory on Monday and returns on Wednesday
  sees exactly what they saw before they started.
- **`client/src/components/product-wizard.tsx` is 1,819 lines** — the largest component in the
  client, and it is the manual data-entry path the checklist points at. VISION.md says a restaurant
  operator "does not have to become a full time system administrator". Right now that wizard *is*
  the job.

And the trap that makes naive progress-tracking wrong:

- **Every fresh install boots with a full demo menu.** `autoSeedIfEmpty()` runs at startup
  (`server/index.ts:266`); if `adminProducts` has a single row it returns, otherwise it seeds the
  demo catalogue. So a brand-new store has products, recipes, inventory, and BOM links before the
  operator touches anything. A setup check that asks "do you have products?" answers **yes** for a
  store that has nothing of its own.

Demo rows are identifiable: `DEMO_PREFIX = "demo_"` (`server/seed-data.ts:14`), exported as
`DEMO_PREFIX_VALUE`. Any honest progress signal has to exclude them.

### The feature

`GET /api/admin/setup-status` — compute the five onboarding steps from **real, non-demo data**, and
render the existing checklist from it. Then expose the same endpoint as an MCP tool so the agent and
the operator are reading the same source of truth.

That last part is what makes this more than a UI polish task. Feature 2 gives an agent the ability
to build a menu; nothing tells it *what still needs building*, and nothing shows the operator what
the agent did. One shared status object answers both: the agent knows where to start, and the
operator watches the checklist tick over as it works. Agent-driven setup that the operator cannot
see is agent-driven setup the operator will not trust.

**Response shape:**

```json
{
  "data": {
    "hasDemoDataOnly": true,
    "steps": [
      { "key": "inventory", "label": "Add inventory", "done": false, "count": 0 },
      { "key": "recipes",   "label": "Create recipes", "done": false, "count": 0 },
      { "key": "menu",      "label": "Create menu", "done": false, "count": 0 },
      { "key": "links",     "label": "Link recipes", "done": false, "count": 0 },
      { "key": "pos",       "label": "Open POS", "done": false, "count": 0 }
    ]
  }
}
```

`count` matters as much as `done`. "Menu: 12 products" tells an operator something "✓" does not, and
gives an agent a number to reason about.

### Reuse, do not rebuild

`POST /api/demo/clear` **already exists** at `server/routes.ts:824` and deletes by the `demo_`
prefix. Do not write a second one. It has one real limitation worth fixing in T3: it lives in
`server/routes.ts` rather than `shared/api-handlers.ts`, so it exists on the Express server only and
not on the in-app local server — the opposite of every other capability in this plan.

### Tasks

**T1 — The setup-status endpoint** (~15 min)
- Add `GET /api/admin/setup-status` to `shared/api-handlers.ts`, computed from the existing
  `ApiAdminStorage` list methods. No new storage methods and no new tables — this is a derived
  view, and persisting setup state would create a second source of truth that drifts from the data.
- Step definitions: `inventory` = ≥1 inventory item; `menu` = ≥1 product with ≥1 variant;
  `recipes` = ≥1 BOM row; `links` = ≥1 product-modifier-group link; `pos` = ≥1 non-demo sale.
- **Exclude any row whose `id` starts with `demo_`** from every count, and set `hasDemoDataOnly`
  when demo rows exist and non-demo rows do not. Import `DEMO_PREFIX_VALUE` rather than
  re-typing the literal — one definition of what "demo" means.
- Check: with only auto-seeded demo data present, every step reports `done: false`, `count: 0`, and
  `hasDemoDataOnly: true`. That assertion is the whole point of the task; a version that reports the
  demo catalogue as a finished setup is worse than no endpoint at all.

**T2 — Render the checklist from real state** (~15 min)
- Add `completed: boolean` and `count: number` to `StepCard` in `client/src/pages/onboarding.tsx`,
  fetch `setup-status`, and drive the five cards from the response. Show the count next to each
  completed step.
- Keep the existing `data-testid` values unchanged — they look like the hooks an existing test or
  tooling setup relies on, and renaming them is free breakage.
- Handle the states the page currently cannot express: loading, and the error case. A checklist that
  silently renders everything as incomplete when the fetch fails will send an operator to redo work
  they already did.
- Check: seed a product, reload, and confirm the Menu step shows complete with a count while the
  others stay incomplete.

**T3 — "Start fresh" from the demo catalogue** (~15 min)
- Move the `/api/demo/clear` handler from `server/routes.ts:824` into `shared/api-handlers.ts` so
  both servers expose it, leaving the Express route as a thin delegation like the others. Keep the
  `demo_` prefix matching and its existing `%`/`_` LIKE-escaping exactly as written — that escaping
  is correct and easy to lose in a move.
- When `hasDemoDataOnly` is true, surface a "Start fresh — clear the demo menu" action on the
  onboarding page. An operator whose POS is full of Chocolate Chip Cookies they do not sell needs
  one obvious way out, and right now there is no way to reach this endpoint from the UI at all.
- **Confirm before clearing**, and say how many records will be deleted. This is the one destructive
  action in the whole feature.
- Check: clear demo data, then assert `setup-status` still reports all steps incomplete and
  `hasDemoDataOnly` flips to false — a cleared store and a demo-only store are different states and
  must not look identical.

**T4 — Give the agent the same view** (~15 min)
- Add `get_setup_status` to the Feature 2 MCP tool table, and reference it in the tool description
  for `apply_menu` so an agent checks what exists before building.
- Document in `docs/agent-setup.md` the intended loop: read setup status → propose what is missing →
  dry-run → apply → re-read status to confirm the step flipped. That final re-read is what lets an
  agent report "your menu is set up" as an observation rather than an assumption.
- Check: after an `apply_menu` that creates products and variants, `get_setup_status` reports the
  `menu` step complete without any other call.

### Cross-reference for Feature 1

Demo data interacts badly with blueprint name matching. `menu/apply` matches products by name, and
the demo catalogue contains ordinary names like "Chocolate Chip Cookie" (`server/seed-data.ts:85`).
An operator whose real menu has a chocolate chip cookie would have it silently matched against the
demo row and updated in place rather than created. **Feature 1's matcher should ignore
`demo_`-prefixed rows**, the same way this feature's counts do. Worth fixing in Feature 1 T2 rather
than here.

### Non-goals

No chat UI, no conversational setup flow inside the app, and no rewrite of `product-wizard.tsx`.
The wizard stays exactly as it is — this feature makes the *path around it* visible, and the agent
is what makes the wizard optional. Also out of scope: per-step guidance content, progress
persistence, and any notion of "setup complete" that unlocks or gates functionality.

### Definition of done

A new operator opens the app, sees honestly that they have nothing set up yet despite the demo menu
being present, clears it in one click, and watches the checklist fill in as either they or their
agent does the work.

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
