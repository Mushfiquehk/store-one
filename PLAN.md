# Store-One — Feature Plan

Living document. Each entry is a feature that moves the product toward [VISION.md](VISION.md).
Newest feature at the top. Tasks are sized so a single AI coding agent can finish one in ~15 minutes.

**Planning is done; implementing is not.** Fifteen features are written up below, several of them
defects in shipped code. Further planning has lower value than implementing what is here. The triage
below is the entry point — **pick one task, not one feature**: every `T*` is sized for a single agent
in about 15 minutes, states the files it touches, and ends in a `Check:` that must pass before the
task counts as done. Update the feature's **Status** line when you finish one, so the next agent can
see what is left.

---

## Triage: what is broken versus what is missing

Five of these twelve are **defects in shipped code**, not enhancements. They were found by reading
the code while planning features, and each is independently verifiable at the file and line cited in
its section. They are ordered by what they cost if left alone.

| # | Defect | Evidence | Cost if ignored |
|---|---|---|---|
| **7** | `POST /api/admin/sales` returns 200 with the sale echoed back and persists nothing | `server/routes.ts:622-632` — `createSale(d) { return d; }`, shadowing a working `storage.ts:860` | Sales silently lost; caller cannot tell success from discard |
| **9** | Backup omits 6 of 16 tables while the UI calls it a "full snapshot" | `settings.tsx:256` lists ten tables; `db.ts:194-199` defines combos, invoices and more | Restore loses every combo and supplier invoice |
| **9** | Restore clears tables it may not repopulate, with no confirmation | `settings.tsx:316-340` — unconditional `.clear()`, then `bulkPut` only `if (snapshot.X?.length)` | A partial snapshot or mistyped store code wipes the device |
| ~~**11**~~ | ~~`lastPurchasePrice` stores price per *purchased* unit; recipes consume *stocking* units~~ **Fixed** — `shared/units.ts` | ~~`storage.ts:910`~~ | — |
| **8** | Sync compares Drizzle rows to Dexie records via `JSON.stringify`, so they never match | `storage.ts:~270` vs `sync.ts:97` — differing key order and field set | Every menu record re-pushed to every client on every sync, forever |
| **8** | Conflict resolution reads `adminUpdatedAt` but never compares it | `storage.ts:215+` | Newer POS edits silently discarded |
| **17** | The stored SMTP password is returned by `GET /api/settings`, pre-filled into a form, and included in every backup | `api-handlers.ts:467-472`; `settings.tsx:109, 580`; `db.ts:462` → `backup.ts:32` | An operator's real mail credential leaks to anyone who can reach the server or fetch a backup |
| ~~**16**~~ | ~~Whether the till can record a card sale depends on ephemeral React state~~ **Fixed** — `payments.methods`, a store setting | ~~`pos.tsx:133`~~ | — |
| ~~**16**~~ | ~~"Integration Connected — Successfully linked to provider" is a toast over a no-op~~ **Fixed** — `shared/integrations.ts`, every provider `planned` | ~~`store.tsx:236-241`~~ | — |
| **19** | No sale, price change, or adjustment records who made it; the only "current employee" is dialog state cleared on submit | `Sale` has no `employeeId` (`db.ts:142-156`); `app-shell.tsx:57, 85` | Feature 12's void attribution and Feature 15's ledger actor have nothing to record |
| ~~**15**~~ | ~~Recipe depletion is implemented twice, and only the POS copy runs on real sales~~ **Fixed** — one engine in `shared/depletion.ts` | ~~`pos.tsx:373-436`~~ | — |
| ~~**15**~~ | ~~Stock adjustments clamp at zero and record nothing~~ **Fixed** — `inventoryLedger` + unclamped quantities | ~~`local-storage.ts:257`~~ | — |
| **21** | The Settings tax-rate field is bound to `useState` and written nowhere; the till charges a hardcoded 8.25% in every store | `settings.tsx:89, 411-412` (only three mentions of `taxRate` in the file); `pos.tsx:38` — `setTaxRatePct` is never called | Every operator charges the wrong tax and cannot change it |
| **22** | Nothing ever asks how much cash is in the drawer — no float, no count, no over/short, no trading day | `grep -rin "drawer\|openingFloat\|cashCount\|endOfDay"` returns nothing | Every other defect in this table is undetectable in daily operation |
| **25** | A product with no tags is unreachable on the till — the "show everything" branch is dead once any tagged product exists | `pos.tsx:98-116`; `activeTag` auto-sets at `:109` (during render), and `:114` filters by it | An operator adds an item, cannot find it, cannot tell whether it saved |
| ~~**26**~~ | ~~Synced POS sales never reach `admin_sales`, so no server-side report can see them~~ **Fixed** — landed on sync (T2) and backfilled on boot (T3) | ~~`server/sales-writers.test.ts`~~ | — |
| **5** | Combos are ignored by the live order path | `bom-engine.ts` is imported only by `routes.ts:16` for test orders; `/api/orders/simulate` prices inline with a hardcoded 8% tax | Combos charge full price; three different tax rates in the codebase |

~~**Suggested first session**~~ — **done.** Features 7, 9 and 11 have all landed, which clears the
three defects that cost the most: silently discarded sales, a backup that could wipe a device, and
costs wrong by orders of magnitude.

**Start with the three that are cheap and depend on nothing:** **Feature 17 T1** (stop returning the
stored SMTP password from `GET /api/settings` — a credential leak, and the whole task is a redaction
map and two handlers), **Feature 16 T1** (the till drops to cash-only on every reload), and
**Feature 15 T1** (delete one of the two copies of the depletion walk before either drifts further).

**Then**, in this order: **Feature 10** (margins — both of its blockers, 11 and 13, have now landed,
so its inputs are finally true), then **Feature 14** (labour, which needs 13's real revenue as its
denominator), then **Feature 8** (sync convergence).

~~Note that Feature 10 T1 depends on **Feature 5 T1**~~ — that extraction landed with **Feature 15 T1**
(`shared/depletion.ts`), and Feature 10 T1 is done on top of it.

Everything else is a genuine enhancement and can wait: **1** (menu blueprint, done), **2** (agent
bridge), **3** (locations), **6** (setup status), **12** (voids and refunds), **18** (profit and
loss, whose T3 needs 13, 10 and 14 first). Of the lot, **4 (auth) is the one with a deadline** —
there is no authentication of any kind, and the repo has a Dockerfile and compose file, so it must
land before this is deployed anywhere public.

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
| `server/schema.ts` | 3 (locationId on ten tables), 4 (apiTokens table), 11 (two columns on `inventoryItems`) |
| `server/storage.ts` | 3 (~40 methods), 11 (the invoice-receive path) |
| `server/routes.ts` | 3, 4, 6 (moves the demo-clear handler out), 7 (the adapter stubs) |
| `server/bom-engine.ts` | 5 (pricing, `:295-335`), 15 (depletion, `:203-293`) — different regions |
| `client/src/pages/pos.tsx` | 15 (deletes the duplicated depletion walk), 16 (payment dialog, `:900-960`) |
| `client/src/lib/store.tsx` | 16 (deletes the `integrations` state and its toggle) |
| `client/src/lib/db.ts` | 9 (backup list), 11 (two columns), 12 (reversal fields), 15 (ledger table) |
| `client/src/lib/local-storage.ts` | 11 (two copies of the same receive path) |
| `client/src/components/product-wizard.tsx` | 11 (deletes the duplicated cost arithmetic) |
| `shared/pricing.ts` | 5 creates it, 10 adds costing functions. ~~11~~ **(done)** — its conversion lives in `shared/units.ts` |
| `client/src/pages/reports.tsx` | 10 (adds a margins table), ~~13~~ **(done)**, 14 (adds labour) |
| `client/src/pages/employees.tsx` | 14 (adds the pay-rate field) |
| `shared/api-handlers.ts` (reports) | 12 moves the two report handler bodies into `shared/reports.ts` |
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

## Feature 26 — Sales have two writers and no owner

**Status:** T1 done — the decision is recorded in `shared/sync-compare.ts` beside the conflict policy:
`SALES_OWNER = "admin_sales"`, with the sync blob named as transport and bookkeeping rather than the
record. The corollary is enforced rather than merely written: a test asserts `isAdminOwned("sales")` is
false and that a device sale beats an older server copy on recency, so nobody can quietly add `sales`
to `ADMIN_OWNED_TABLES` and let a stale server row overwrite a real transaction. No data moved — that
is T2.
T2 done — `processSyncChanges` lands a synced sale through `adminStorage.createSale` (idempotent on
`id`) before the blob write, so `listSales()` and every report built on it can finally see it. The blob
stays as the sync bookkeeping the `lastSyncedAt` window reads. A sale the device deleted is soft-deleted
on the row rather than resurrected as live. `server/sales-writers.test.ts` — which used to pin the
invisibility — now asserts the opposite, plus idempotency across repeated syncs and the delete path.
T3 done — `server/backfillSyncedSales()` (`server/backfill-sales.ts`) promotes blob-only sales into
`admin_sales` on boot, newest blob per id, soft-deleting the ones the device had voided rather than
resurrecting them. Idempotent and silent after the first boot; it logs only when it actually moves
something. Tested against a real database: revenue invisible before, correct after, unchanged by a
second run.
T4 remains (`bom-engine`'s direct insert into `adminSales`).
**Vision pillar:** #1 — "the best foundation". Sales records are the business's books, and half of
them are currently invisible to the server that reports on them.
**Depends on:** nothing. Feature 8 T1–T3 made sync converge, which is what made this measurable.
**Added:** 2026-08-17 (found by Feature 8 T4's investigation)

### The finding, verified against a real database

`server/sales-writers.test.ts` asserts all of this today:

1. **A synced POS sale never reaches `admin_sales`.** The `sales` sync group stores the row as a JSON
   blob in `syncRecords`. `sales` has no entry in `processSyncChanges`'s `adminLookups` and no branch
   in `applyChanges`, so nothing ever promotes the blob into a real row.
2. **Every server-side report reads `admin_sales` only** (`adminStorage.listSales()`), so
   `sales-summary`, `product-mix` and Feature 10's `menu-margins` **cannot see a single synced POS
   sale**. They see admin-API sales (Feature 7 T2) and `bom-engine` test orders.
3. **The same sale arriving by both paths leaves two disconnected copies** — one `admin_sales` row and
   one orphaned sync blob. Not a double count today, because nothing unions the two; it becomes one
   the moment anything does.
4. `getClientSyncData` has no `sales` key in its result map at all, so a client that rebuilds from that
   endpoint gets no sales back.

The device is not wrong and the server is not wrong: nobody ever decided which one owns a sale.

### The shape

```
ponytail: one owner, one write path. admin_sales is the row; the sales sync group
becomes transport that lands rows through createSale instead of storing blobs.
No reconciliation job between two writers — that is a second system to keep
correct, and the thing it would reconcile is revenue.
```

### Tasks

**T1 — Decide and write down who owns a sale** (~15 min)
- One owner: `admin_sales`. A sale is authored on the device and *lands* server-side as a row, not as
  a blob. Record it beside the conflict policy in `shared/sync-compare.ts`, which is now where sync
  policy lives.
- State the corollary: sales are **append-mostly and device-authored**, so admin-wins must not apply
  to them — the existing last-write-wins fallback is correct for this table and must stay.
- Check: the policy note names `admin_sales` as the owner and the test above still passes unchanged
  (this task decides, it does not move data).

**T2 — Land synced sales as rows** (~15 min)
- Give `sales` a branch in the sync path that writes through `adminStorage.createSale` (idempotent on
  `id` already, via `onConflictDoUpdate`) instead of only storing a `syncRecords` blob.
- Keep the blob as the sync bookkeeping it is — `lastSyncedAt` windows depend on it — but the
  authoritative row must exist.
- Check: a device syncs a sale and `listSales()` returns it; syncing the same sale twice leaves one
  row.

**T3 — Backfill the blobs already stored** (~15 min)
- Existing installs have real sales sitting only in `syncRecords`. Promote them once, idempotently,
  and log how many moved.
- Check: a database seeded with blob-only sales reports the same revenue before and after a restart.

**T4 — Stop the third writer diverging** (~15 min)
- `bom-engine.ts` inserts into `adminSales` directly for test orders. Route it through the same
  `createSale` so there is one insert path, and mark test-order sales so they can be excluded from
  reports rather than being indistinguishable from real ones.
- Check: a test order is visible as a sale but excluded from revenue reporting.

### Non-goals

Moving sales into `SYNC_CATEGORY_TABLES`' admin-lookup machinery (they are device-authored, not
admin-owned), a reconciliation job between the two stores, and multi-device sale merging.

### Definition of done

One write path for sales, every synced sale visible to every report, and a test that fails if a sale
can exist in one store and not the other.

---

## Feature 25 — The menu grid: a product you add can currently become unreachable

**Status:** planned
**Vision pillar:** #1 — "the easiest path". Setting up a menu is the first thing an operator does and
the till layout is what they live in afterwards.
**Depends on:** nothing. **T1 is a bug fix and should be taken on its own** regardless of the rest.
**Added:** 2026-08-10

### The finding

Three defects in twenty lines of `client/src/pages/pos.tsx`, and the first one loses products.

**1. A product with no tags cannot be displayed on the till.**

```ts
// pos.tsx:98-116
const tags = useMemo(() => { /* every distinct tag across all products */ }, [products]);
const [activeTag, setActiveTag] = useState<string | null>(null);
if (!activeTag && tags.length > 0) { setActiveTag(tags[0]); }      // <-- during render
const filteredProducts = useMemo(() => {
  if (!activeTag) return products;                                  // the only path showing everything
  return products.filter(p => (p.attributes?.tags || []).includes(activeTag));
}, [products, activeTag]);
```

`activeTag` is null only until any tagged product exists. Every real store has one, so `activeTag` is
always set, so the "return everything" branch is dead — and **a product with an empty `tags` array
appears under no category and is reachable only by search.** An operator adds an item, cannot find it
on the till, and has no way to tell whether it saved. The product wizard does not require a tag, so
this is reachable by the ordinary path.

**2. `setActiveTag` is called during render**, not in an effect or an event handler (`:109`). React
re-renders on the spot; it is the kind of thing that works until a concurrent-render change or a
`StrictMode` double-invoke makes it not.

**3. Category order is arbitrary and unchangeable.** The category bar is
`Array.from(new Set(...))` over the products array, so the order is the order products happen to come
back in — and the default selected category is whichever that puts first. An operator cannot put
Drinks before Bakery, and the bar can silently reorder itself when a product is edited.

Underneath all three: **categories are not a thing.** They are free-text strings inside
`ProductAttributes.tags` (`shared/schema.ts:2`), a JSON blob on the product. Nothing registers them,
nothing orders them, nothing catches a typo — "Drinks" and "drinks" are two categories, and a
rename means editing every product that carries the old string.

There is also no ordering *within* a category: products render in whatever order the store returns
them, so the best-seller cannot be put first.

### The shape

Promote the category to a real, ordered thing; keep tags for what tags are good at.

- `category` — one nullable string per product, the till's grouping.
- `menu.categories` — one ordered array in store settings (Feature 7 T3's API, already shipped),
  which is what makes ordering and renaming a single write rather than a migration over products.
- `sortOrder` — a number per product, for arranging the grid.
- `tags` stays exactly as it is, for search and for anything cross-cutting ("vegan", "seasonal").

```
ponytail: a category is a string on the product plus an ordered array in
settings. No categories table, no join, no per-category images or colours, no
nesting. Sub-categories are the upgrade if a menu ever gets big enough to need
them, and most never do.
```

### Tasks

**T1 — Nothing disappears** (~15 min, and worth shipping alone)
- Add an "All" option to the category bar and make it the default, so the "show everything" path is
  reachable instead of dead. Any product with no category appears under **Uncategorised** as well —
  visible, and visibly needing a home.
- Move the `setActiveTag` call out of the render body (`pos.tsx:109`) — derive the active category
  instead, or set it in an effect. Same behaviour, without the render-phase write.
- Check: create a product with no tags and confirm it appears on the till without searching; confirm
  the category bar still defaults sensibly when every product is categorised.

**T2 — A category that is a category** (~15 min)
- Add `category: text` (nullable) to products in all three schema locations, and a `menu.categories`
  ordered array setting. Migrate existing data by taking each product's **first tag** as its
  category and leaving `tags` untouched — no data is lost and nothing needs re-tagging.
- Build the category bar from the setting, in its order, not from a `Set` over products. A category
  in the list with no products still shows (empty, so the operator can see where things should go);
  a product whose category is absent from the list falls into Uncategorised rather than vanishing.
- Renaming a category is a write to the setting plus one pass over products carrying the old value —
  do it in one place, and say in a comment that this is why the list is a setting rather than derived.
- Check: reorder the categories and confirm the till bar follows; rename one and confirm no product
  becomes uncategorised.

**T3 — Arrange the grid** (~15 min)
- Add `sortOrder: integer` to products, defaulting so existing rows keep their current relative order
  rather than jumping to alphabetical on upgrade.
- Let an operator drag products into position within a category. **Reuse the drag-and-drop already
  built in `client/src/pages/schedule.tsx`** rather than adding a second library or a second
  interaction pattern.
- Persist on drop, not on a separate save. A layout editor with an unsaved state is a layout an
  operator will lose.
- Check: reorder three products, reload, and confirm the order holds; add a fourth and confirm it
  lands at the end rather than in the middle.

**T4 — Categories travel with the menu** (~15 min)
- Add `category` and `sortOrder` to Feature 1's menu blueprint and to Feature 2 T1's export, keeping
  that pair's round-trip invariant: export → apply is still entirely `noop`. Add the `menu.categories`
  order to the blueprint too, or an agent can create a category it cannot position.
- This is what lets an operator say "put the pastries first" to an agent, which is pillar #2's
  promise applied to the thing they look at all day.
- Check: export a categorised menu, re-apply it, and confirm every change is `noop` — including
  category and order.

### Non-goals

Sub-categories and nesting, per-category colours or images, multiple layouts per device, a separate
customer-facing menu ordering, drag-and-drop of categories on the till itself (arranging belongs in
admin; the till is for selling), and per-location layouts (Feature 3). Tags are deliberately kept as
they are — this feature does not replace them, and a product may be in one category and carry any
number of tags.

### Definition of done

Every product an operator creates is visible on the till without searching for it, categories appear
in the order they chose, products sit where they dragged them, and an agent applying a menu can set
all of it.

---

## Feature 24 — What is for sale right now: 86-ing, and a menu that knows the time

**Status:** planned
**Vision pillar:** #2 — *"creating products, combos, discounts, promotions etc."* is the agent's job,
and "86 the salmon" is the single most common thing an operator would say to one during service.
Also #1: a menu that offers what the kitchen cannot make is a menu that generates refunds.
**Depends on:** nothing. Composes with Feature 15 (over-drawn stock suggests what to 86), Feature 22
(the business-day boundary), and Feature 2 (the agent tool).
**Added:** 2026-08-10

### The finding

**There is no way to stop selling something without deleting it.**

`Product`, `Variant` and `Modifier` (`client/src/lib/db.ts:14-60`) carry `updatedAt` and `deletedAt`
and nothing else about whether they can be sold. `availableAsIngredient` on the product is about
whether a recipe may consume it, not whether a customer may buy it. The POS filters products by name
and tag (`pos.tsx:95, 114`) and by soft-deletion; there is no other gate. Every product that exists
is on sale, always.

So an operator who runs out of salmon at 7pm has two options: leave it on the menu and disappoint
whoever orders it, or delete it. **Deleting it is worse than it looks:**

- It is the same mechanism used for "this item is gone forever", so the two intents become
  indistinguishable in the data.
- Re-creating it tomorrow produces a **new `id`**. Feature 13's product mix aggregates by
  `productId`, so a dish 86'd and restored twice a week splits its own sales history into three
  products, none of which shows what it actually sells. Feature 10's margins inherit the same split.
- Feature 1's blueprint matcher ignores soft-deleted rows by design, so an agent re-applying the menu
  quietly creates a duplicate rather than reviving the original.

**And nothing knows the time.** A `hoursOfOperation` setting exists and is read by the schedule page
(`schedule.tsx:97`) and the settings page — the store knows when it is open and the menu does not use
it at all. Breakfast served until 11, a lunch special, a bar menu after 4: none of them are
expressible, so every item is offered at every hour the till is on.

### The distinction the whole feature rests on

**Unavailable is not deleted.** Deleted means "this is not part of my menu"; unavailable means "not
right now". They differ in reversibility, in what reports should do with them, and in what an agent
is allowed to do unprompted. Keeping them as one field is what produces the fragmented history above.

```
ponytail: one boolean and one optional time window per product. No availability
calendar, no seasonal schedules, no per-location availability (that is Feature
3's), no auto-86 from stock levels. The upgrade when an operator runs two
genuinely different menus is a menu-per-daypart, not a rules engine on this
boolean.
```

### Tasks

**T1 — Available, as its own fact** (~15 min)
- Add `available: boolean NOT NULL DEFAULT true` to products and variants (`shared/schema.ts`,
  `client/src/lib/db.ts` with a version bump, `server/schema.ts`). Default `true` means every
  existing row behaves exactly as today.
- The POS shows unavailable items **greyed out and unselectable, not hidden**. Hidden items generate
  "do you still have the muffins?" at the counter; a visibly crossed-out item answers it before it is
  asked. Hiding is also how staff conclude the POS is broken.
- Put the comment next to the field: `available` is temporary and reversible, `deletedAt` is
  permanent, and 86-ing must never be implemented as a delete. That sentence is the feature.
- Check: an unavailable variant cannot be added to a cart, still appears on the menu, and still shows
  in reports for periods when it did sell.

**T2 — 86 it from where you find out** (~15 min)
- One long-press or one tap-and-confirm on the POS tile marks an item unavailable. The person who
  discovers the salmon is gone is holding the till or standing at the pass, not sitting in an admin
  page — Feature 6's whole thesis is that the operator should not have to become an administrator.
- **86 persists until someone clears it.** Do not auto-restore overnight: an item that is out on
  Tuesday night is usually still out on Wednesday morning, and silently re-enabling it sells
  something nobody has. Instead, show a banner at the start of each business day (Feature 22 T1's
  boundary) listing what is currently 86'd, so restoring is a deliberate morning decision.
- Record it in Feature 19's action log with the actor — 86-ing is the fastest way to make an item's
  sales vanish, and it should be as attributable as a void.
- Check: 86 an item, confirm it cannot be sold, reload, confirm it is still 86'd, and confirm the
  next business day opens with a banner naming it rather than quietly restoring it.

**T3 — Items that are only for sale at certain times** (~15 min)
- Add an optional availability window to the product: `availableFromMinutes`, `availableToMinutes`
  and a day-of-week mask. Empty means always, which is what every existing row gets.
- The POS applies it against local time. A window crossing midnight (a late-night menu) must work —
  test it, because `from > to` is the case that gets written last and breaks first.
- **Never hard-block.** An out-of-window item is dimmed with its window stated ("Breakfast — until
  11:00") and can still be rung with a confirm. The same principle as Feature 15 T3: record the
  truth, do not enforce it. A till that refuses to sell a breakfast burrito at 11:02 is a till the
  staff will route around, and then nothing is accurate.
- Check: an item with an 06:00–11:00 window is dimmed at 11:01 and normal at 10:59; an item with a
  22:00–02:00 window is available at midnight.

**T4 — Let the agent do it, and let stock suggest it** (~15 min)
- Add `set_availability` to Feature 2's MCP tool table. "86 the salmon" and "put the breakfast menu
  back on" are the two sentences an operator most wants to say rather than tap, and both are one
  call.
- Where Feature 15's ledger shows an ingredient over-drawn, **suggest** the menu items that depend on
  it as 86 candidates — with the item, the ingredient, and how far negative it is. Suggest, never
  act: stock counts drift and an auto-86 that removes the top seller at 8am on a bad count is worse
  than the count being wrong.
- The agent tool description must say the same thing: propose, show the operator, apply on approval —
  the read-propose-preview-apply loop this plan keeps converging on.
- Check: an over-drawn ingredient produces a suggestion naming the dishes that use it and does not
  change their availability; the agent tool flips a flag and the POS reflects it without a reload.

### Non-goals

Per-location availability (Feature 3 once locations exist), separate menus per daypart, seasonal or
calendar-based scheduling, automatic 86 from stock levels, quantity-limited items ("only 12 specials
left" — a real feature and a different one, since it needs a counter that decrements per sale),
customer-facing availability on any online channel, and availability on modifiers (worth doing, but
the plumbing is the same and the demand is lower — add it once the product-level version is in use).

### Definition of done

An operator marks something unavailable in one tap from the till, it stays that way until they say
otherwise, the breakfast items dim themselves at 11, and none of it deletes a product or splits its
sales history.

---

## Feature 23 — The kitchen: an order that reaches the people making it

**Status:** planned
**Vision pillar:** #1 — "setup **and operate**", and #4 indirectly: a half-and-half pizza with
unlimited toppings is a recipe-costing triumph and a kitchen disaster if the toppings never reach the
person building it.
**Depends on:** nothing. **Coordinates with Feature 12** — see the status collision below, which must
be resolved whichever of the two lands first.
**Added:** 2026-08-10

### The finding

**Nothing in this system tells anyone to make anything.**

The only view of an in-flight order is `client/src/components/order-receipts.tsx`, rendered inside
the POS page on the cashier's own device. It filters
`closedAt === null && customerName !== undefined && status === "completed"` (`:142`) and offers one
action: **Close Order** (`:123`). That is the entire order lifecycle — a sale is born closed-ready and
someone eventually clicks a button on the till.

Three consequences, in order of how much they hurt on a busy morning:

1. **There is no kitchen-facing view at all.** No route, no second screen, no station. The person on
   bar or on the line reads the cashier's tablet over their shoulder, or the cashier calls the order
   out loud. `grep -rin "kitchen\|prepStatus\|fired\|readyAt\|station"` across `client/src`, `server`
   and `shared` returns one hit — a menu label in `products.tsx:22`.
2. **An order rung without a customer name never appears anywhere.** That `customerName !== undefined`
   filter (already flagged in Feature 20) means the rail silently omits it. On the till it is a
   missing row; for the kitchen it would be a drink nobody makes.
3. **There is no order number.** `customerName` is the only human-sayable identifier a sale has, and
   it is optional. Two customers called Sarah, or one who declined to give a name, and the counter
   has no way to hand the right cup to the right person.

And the modifiers — the thing pillar #4 is built around — are stored on `linesJson` and displayed
only in that one rail. The system can cost a half-and-half pizza to the gram and cannot tell the
kitchen which half.

### The status collision — resolve this before either feature is built

`adminSales.status` (`server/schema.ts:145`) is `"completed"` everywhere and nothing else; Feature 12
T1 claims that field for the vocabulary `"completed" | "void" | "refund"`.

**Preparation state must therefore be its own field, not another value in `status`.** A voided order
and a ready order are orthogonal facts — an order can be refunded *because* it was never made — and
collapsing them into one enum means the first refund of an in-progress ticket has no representable
state. Add `prepState` (`NEW` | `IN_PROGRESS` | `READY` | `SERVED`) alongside `status`, and note it
in Feature 12 T1 so whichever lands second does not "tidy up" by merging them.

### The shape

No second application. The app already runs on the device; the kitchen is a route in it — `/kitchen`
— reading the same store, showing tickets big enough to read from two feet away. A tablet propped on
the pass is the deployment.

```
ponytail: /kitchen is a route in the same app over the same Dexie store, polling
like every other page here. No WebSocket, no push, no separate KDS app, no
station routing. Cross-device tickets need Feature 8's sync to converge first —
that is a real dependency, not a nice-to-have, and it is why this cut is
same-device.
```

Cross-device is deliberately out. Today the kitchen tablet would need `syncRecords` to carry sales
reliably, and Feature 8 says plainly that sync does not converge. Shipping a two-device kitchen on
top of that would produce tickets that appear late, twice, or not at all — worse than the shouting it
replaces.

### Tasks

**T1 — A preparation state that is not `status`** (~15 min)
- Add `prepState` to `Sale` (`shared/schema.ts`, `client/src/lib/db.ts` with a version bump,
  `server/schema.ts`), defaulting to `NEW`, and the transitions `NEW → IN_PROGRESS → READY → SERVED`.
  Existing rows read as `NEW`; a sale with `closedAt` set reads as `SERVED` so history is not
  suddenly full of unmade orders.
- Keep `status` untouched for Feature 12. Add the comment there explaining why the two are separate —
  that comment is the deliverable, because the merge is what a later reader will otherwise attempt.
- Record transitions through Feature 19's action log if it has landed, and leave the call site
  obvious if it has not.
- Check: an existing seeded sale reads `SERVED` rather than `NEW`; a new sale starts `NEW`; and the
  type refuses an unknown state.

**T2 — `/kitchen`: the tickets** (~15 min)
- Add the route and a ticket board: oldest first, each ticket showing its order number, every line
  with its **modifiers spelled out**, and the elapsed time since it was rung. Type large — this is
  read at arm's length by someone with their hands full.
- Removals must not look like additions. "No onions" and "Add onions" differing only by a word is how
  an allergy incident happens; render them differently enough to be unmistakable at a glance.
- One action per ticket: **Ready**. One per line if a ticket is partly done. Nothing else — a kitchen
  screen with a settings menu is a kitchen screen someone taps by accident mid-service.
- Check: an order with a modifier appears within one refresh of being rung, shows the modifier, and
  moves off the active board when marked ready.

**T3 — An order number, and no silently dropped tickets** (~15 min)
- Give every sale a short daily order number — resets with the business day from Feature 22 T1, so
  the counter calls "84" rather than a UUID or a name that may not exist.
- Delete the `customerName !== undefined` filter (`order-receipts.tsx:142`). Every open order belongs
  on both the rail and the board; a nameless order is the common case, not an exception.
- Show the number on Feature 20's receipt, so a customer's paper and the counter's shout agree.
- Check: three orders rung with no names get 1, 2 and 3 and all appear on the board; the numbers reset
  the next business day rather than climbing forever.

**T4 — How long things actually take** (~15 min)
- Store `readyAt` and report ticket time — rung to ready — for the period: median and worst, and the
  items that are slowest. An operator guessing at their ticket times is guessing at their staffing,
  and Feature 14 is about to give them the labour cost of that guess.
- Show the current board's oldest ticket age prominently. The single most useful number during
  service is "the oldest thing waiting", and it is the one a queue of cards buries.
- **Do not build alerting or escalation.** A colour change past a threshold is enough; a POS that
  starts paging people is a product decision nobody asked for.
- Check: a ticket marked ready five minutes after it was rung reports five minutes; a period with no
  tickets reports no median rather than zero.

### Non-goals

Multi-device and cross-tablet tickets (needs Feature 8 to converge — stated above and meant), station
routing and multi-station tickets, course firing and coursing, table and seat management, printed
kitchen chits (Feature 20 already declines the printer stack), bump bars, recall of a bumped ticket
beyond an undo, prep-time prediction, delivery and online-order intake, and any alerting. Table
service — tabs, seats, transfers — is a genuinely different product shape and would be its own
feature, not an extension of this one.

### Definition of done

Every order rung appears on a kitchen screen within seconds, with its modifiers legible and its
number visible, someone marks it ready, and the operator can see afterwards how long the morning's
tickets actually took.

---

## Feature 22 — Close of day: what should be in the drawer, and what is

**Status:** planned
**Vision pillar:** #1 — "setup **and operate**". Counting the drawer is the one thing a cash business
does every single day, and it is the only routine check that catches theft, mis-rings and
mis-configuration at all.
**Depends on:** Feature 16 T2 for `tenderedCents` / `changeCents` (T2 below degrades honestly
without them), Feature 19 T1 for who counted. Named as "the obvious next feature" in both Feature 12's
and Feature 16's non-goals — this is that entry.
**Added:** 2026-08-10

### The finding

`grep -rin "drawer\|shiftStart\|openingFloat\|cashCount\|zreport\|endOfDay\|closeout"` across
`client/src`, `server` and `shared` returns **nothing**. There is no shift, no session, no opening
float, no cash count, no over/short, and no notion of a trading day closing at all.

What exists is `paymentMethod` on the sale (`db.ts:148`) — a string, `"Cash"` or `"Card"`. So the
system knows how much cash it *should* have taken and has never once been asked how much is actually
in the till. Nothing compares the two, because there is nothing to compare against: no starting
amount, no ending count.

The consequence is that **every failure this plan has documented is undetectable in practice**. A
mis-configured tax rate (Feature 21), a void that walked out with the cash (Feature 12), a sale rung
on the wrong item, a cashier taking a twenty — the drawer count is how a small operator finds out
any of them happened, usually the same evening. Without it, the first signal is the accountant, months
later, and by then the pattern is unrecoverable.

This is also the feature that makes the others' numbers checkable. Feature 13 makes revenue real, but
"real" there means "correctly summed from what was rung". A drawer count is the only place the system
touches physical reality and can be wrong out loud.

### The design points that matter

**Count blind.** The expected figure must not be shown until the count is entered. A count taken with
the target on screen is not a count — anyone skimming can simply enter the expected number, and the
one control the operator has evaporates. This is the whole feature's integrity in one UI decision.

**A trading day is not a calendar day.** A store closing at 1am must have those sales in the day that
began the previous morning. Feature 13 T1 already establishes local-time bucketing for reports;
this feature needs a business-day boundary (a `day.startHour` setting, default 4am) and the two must
use the same rule or the day's sales report and the day's drawer will disagree by exactly the
after-midnight trade.

**Over/short is not revenue.** A $12 shortage did not reduce sales; it is a separate line. Feature 18
must show it as its own item, not folded into either revenue or expenses — the same double-counting
care that feature applies to purchases versus COGS.

```
ponytail: one session row per drawer per day, opened with a float and closed
with a single counted total. No denomination breakdown, no blind-recount
workflow, no mid-shift skims, no multi-drawer assignment. Per-denomination
counting is the upgrade the first time an operator asks why the count is off by
a roll of quarters.
```

### Tasks

**T1 — The drawer session** (~15 min)
- Add a `drawerSessions` table (`shared/schema.ts`, `client/src/lib/db.ts` with a version bump, and
  the `crudEntities` line in `shared/api-handlers.ts`): `id`, `openedAt`, `openedByEmployeeId`,
  `openingFloatCents`, `closedAt`, `closedByEmployeeId`, `countedCents`, `expectedCents`,
  `varianceCents`, `note`.
- One open session at a time on a device. Opening while one is open is an error, not a second row —
  two overlapping sessions make every sale ambiguous about which drawer it belongs to.
- Add a `day.startHour` setting (default 4) and derive the session's sales window from it rather than
  from midnight.
- Do **not** block selling when no session is open. A till that refuses to sell because nobody
  clicked "open drawer" is a till that gets worked around; an unattached sale is attributed to the
  session that covers its timestamp when one is opened later.
- Check: opening a session and closing it produces one row with both timestamps; a second open while
  one is live is rejected; a sale rung at 1am belongs to the session that opened the previous
  morning.

**T2 — What should be in there** (~15 min)
- Add `shared/drawer.ts` with a pure `expectedCash(session, sales, movements)`:
  `openingFloat + cash tendered − change given + paid in − paid out`. Pure over the existing types,
  the same shape as `shared/labor.ts` and `shared/reports.ts`.
- **Degrade honestly without Feature 16 T2.** Until tender and change are recorded, cash taken is
  approximated by the totals of cash sales, which is right whenever change came from the drawer and
  cannot see a cash sale settled from a pocket. Return the figure with a flag saying which basis was
  used; do not present an approximation as a count.
- Add paid-in / paid-out movements — a supplier COD, a till float top-up, petty cash — as rows with
  a required reason. Cash leaving a drawer with no record is exactly the hole this feature exists to
  close, and Feature 18's expense categories are where a paid-out lands on the P&L.
- Check: a session with a $200 float, three cash sales totalling $47.50, $12 tendered against a
  $10.75 sale, and a $30 paid-out expects $217.50 — and the same computation over the same rows twice
  returns the same number.

**T3 — Count it blind, and record who** (~15 min)
- Closing asks for the counted total **before** showing anything else. Only after it is entered does
  the screen show expected, counted, and the variance. Do not preview the expected figure, do not
  pre-fill the field, and do not allow "use expected" as a shortcut.
- Record who counted (Feature 19 T1's active employee) and write one Feature 19 `actionLog` row —
  `DRAWER_CLOSED` with the variance in its summary. A closed drawer is a decision with money
  attached; it belongs in the same list as the voids.
- A variance beyond a configurable threshold (default $5) requires a note before the session can
  close. Not a block — a note. An operator who is $40 short at 11pm needs to record what they think
  happened while they still remember it.
- Check: the expected figure is absent from the DOM until the count is submitted; closing $8 short
  demands a note; the action log row names the employee and the variance.

**T4 — The pattern, not just the day** (~15 min)
- Add a close-of-day view: today's session, and the last 30 sessions with their variances. **One bad
  night is noise; the same cashier short every Thursday is the finding**, and a single-day screen can
  never show it — which is why this task is part of the feature rather than a later nicety.
- Show cumulative variance for the period and put it on Feature 18's P&L as its own line, never
  inside revenue or expenses.
- Surface the approximation flag from T2 wherever a variance is shown. A variance computed without
  tender data has a known error bar and must not be presented as if it were exact.
- Check: three sessions with variances of −$2, +$1 and −$40 show a cumulative −$41 and the −$40 is
  visibly distinguishable from the noise, not averaged into it.

### Non-goals

Per-denomination counting, mid-shift skims and drops, safe and deposit tracking, multiple drawers per
device, drawer assignment per cashier, a physical cash-drawer kick (that is a hardware feature, and
Feature 20 already declines the printer it would hang off), card settlement and batch reconciliation
against a processor, and tip declaration. Also out: any automatic accusation. The system reports a
variance and who was on; deciding what it means is the operator's job, and a POS that flags a
cashier as a suspect is a product that gets someone fired over a rounding error.

### Definition of done

An operator opens the drawer with a float in the morning, counts it at night without being shown the
answer first, and sees what the difference was — with a month of those differences behind it so a
pattern is visible before it becomes a habit.

---

## Feature 21 — Tax: the rate the operator typed, on the items that are actually taxable

**Status:** planned
**Vision pillar:** #1 — a POS a new business can operate. Charging the wrong tax is not a rough edge;
it is the operator's liability at the end of the quarter.
**Depends on:** nothing. Feature 7 T3 shipped `GET`/`PUT /api/settings/:key`, which is where the rate
belongs. **Coordinate with Feature 5 T2**, which kills the server order path's hardcoded `0.08` and
reads the same `tax.ratePct` key — that task owns the server half, this feature owns the client half
and the model. Neither is a substitute for the other.
**Added:** 2026-08-10

### The finding

**Every store using this POS charges 8.25%, and the Settings field that appears to change it is not
connected to anything.**

`client/src/pages/settings.tsx:89` declares `const [taxRate, setTaxRate] = useState(8.25)`. The
input at `:411` binds to it and `:412` sets it. Those are the **only three occurrences of `taxRate`
in the file** — no `fetch`, no `PUT`, no store write. The label above it reads *"The default tax rate
applied to all taxable items."* An operator types their real rate, navigates away, and it is gone.
The same page persists hours of operation and email settings through `/api/settings` twenty lines
above, so the mechanism is present and this one field simply does not use it.

Meanwhile the till has its own copy: `pos.tsx:38` is `useState(8.25)`, `:337` computes
`taxCents = round(subtotal × taxRatePct / 100)`, and `:845` prints **"Tax (8.25%)"** on the summary
the customer is shown. `setTaxRatePct` is **never called anywhere** — line 38 is its only mention. The
rate is a constant wearing a state hook.

The plan's triage says there are three tax rates in the codebase. Counted properly there are six
sites:

| Where | Value |
|---|---|
| `client/src/pages/pos.tsx:38` | `8.25` — what customers are actually charged |
| `client/src/pages/settings.tsx:89` | `8.25` — the field that saves nowhere |
| `client/src/components/app-shell.tsx:51` | `8.25` — declared, never read, dead |
| `client/src/pages/home.tsx:79` | `8.25` — in the dead POS Feature 16 T4 deletes |
| `shared/api-handlers.ts:451` | `0.08` — the server order path (Feature 5 T2) |
| `client/src/lib/seed-data.ts:353` | `0.0825` — demo sales |

**And everything is taxable.** There is no per-item tax flag anywhere in the live schema — the only
`taxable` field in the repo is in `home.tsx:27`, the dead page. In most US states prepared food and
grocery are taxed differently, and gift cards and many packaged goods are not taxed at all; a POS
that taxes every line at one rate cannot be operated legally in a lot of places it would otherwise
be a good fit for.

### The shape

The rate is one store setting, read in one place, and **stamped onto the sale**. That last part is
the piece that is easy to skip and impossible to retrofit: when a jurisdiction changes its rate,
every historical receipt must still reprint with the rate that was charged, and every prior period
must still reconcile. A sale that stores only `taxCents` cannot explain itself; one that stores the
rate can.

```
ponytail: one rate, one boolean per product, one inclusive/exclusive switch. No
tax jurisdictions, no rate tables, no Avalara, no address-based lookup. The
upgrade when an operator opens across a state line is a rate per location
(Feature 3), not a tax engine.
```

### Tasks

**T1 — One rate, set by the operator, actually charged** (~15 min)
- Persist the Settings field to the `tax.ratePct` store setting through the API Feature 7 T3 shipped,
  and read it in the POS in place of `pos.tsx:38`'s constant. Same key Feature 5 T2 uses — if the two
  land in either order they must agree on the name, or the server and the till will charge different
  amounts.
- Delete the dead copies: `app-shell.tsx:51` (declared and never read) and, once Feature 16 T4
  removes `home.tsx`, that one goes with the file.
- **Default to `0`, not `8.25`.** A store with no configured rate charging 8.25% is the same class of
  error as Feature 10's zero-cost-means-100%-margin: a plausible wrong number that nobody checks.
  Zero is visibly unconfigured, and Feature 5 T2 already chose zero for the same reason.
- Surface an unconfigured rate on the Feature 6 setup checklist rather than silently charging nothing
  forever.
- Check: set 6.5%, reload, ring a $10.00 item, and confirm $0.65 of tax and a "Tax (6.5%)" label —
  today both read 8.25% no matter what was typed.

**T2 — Items that are not taxed** (~15 min)
- Add `taxable: boolean` (default `true`) to products in `shared/schema.ts`, `client/src/lib/db.ts`
  (Dexie bump) and `server/schema.ts`, editable in the product editor. Default `true` keeps every
  existing row behaving exactly as it does today.
- Compute tax over the taxable subtotal only, in **one** place — the pricing module Feature 5 T1
  creates (`shared/pricing.ts`) — so the till, the server order path and any future channel agree.
  Do not add a second tax calculation to the POS page.
- A discount reduces the taxable base proportionally: tax applies to the discounted subtotal, which
  is the order of operations Feature 5 T3 already fixes. Do not re-decide it here.
- Check: a cart with one taxable $10 item and one exempt $10 item at 10% produces $1.00 of tax, not
  $2.00; and an order-level discount reduces the taxable base rather than the tax being taken on the
  pre-discount total.

**T3 — Tax-inclusive pricing** (~15 min)
- Add a `tax.inclusive` boolean setting. When true, the menu price already contains the tax and the
  tax line is *extracted* — `tax = round(total × rate / (100 + rate))` — rather than added. This is
  how VAT and GST jurisdictions price, and a POS that cannot express it is unusable outside North
  America.
- Implement it as one branch in the same pricing function as T2, not as a second path. The receipt
  must say which mode it was — "Tax included" versus a separate line — because those are different
  claims about what the customer paid.
- Check: a $10.00 inclusive price at 10% yields a $10.00 total with $0.91 of tax; the same price
  exclusive yields $11.00 with $1.00; and rounding across a three-line cart still sums exactly to the
  order total with no stray cent.

**T4 — Stamp the rate on the sale, and report what was collected** (~15 min)
- Add `taxRatePct` and `taxInclusive` to the `Sale` row, written at every place a sale is created
  (`pos.tsx:446`, `shared/api-handlers.ts:464`, `server/bom-engine.ts:440`). Nullable for existing
  rows; do not backfill a guess about what an old sale was charged.
- Feature 20's receipt reads them rather than the current setting, so a reprint after a rate change
  still shows what the customer actually paid. Without this, every historical receipt silently
  rewrites itself the day the rate changes.
- Add tax collected for the period to the reports page — operators file this monthly or quarterly and
  currently have to derive it by hand. It is a sum of `taxCents` over Feature 13's window; do not
  recompute it from rates.
- Check: change the store rate after ringing a sale, then reprint that sale and confirm it still
  shows the old rate and the same tax; and confirm the period's tax total equals the sum of the
  stored `taxCents`, not a rate applied to revenue.

### Non-goals

Multiple tax jurisdictions and rate tables, address- or location-based rate lookup (a rate per
location is Feature 3's shape once locations exist), tax categories beyond one taxable flag, tax
holidays, exemption certificates and tax-exempt customers, filing or remittance, and integration with
any tax service. **Rounding is per order, not per line**, matching what the code does today — this
feature must not quietly change it, and if a jurisdiction requires per-line rounding that is a
separate, deliberate change with its own tests.

### Definition of done

The rate an operator types is the rate their customers are charged, exempt items are not taxed,
inclusive pricing works, and every sale carries the rate it was rung at so old receipts and old
periods still tell the truth after the rate changes.

---

## Feature 20 — The receipt: what the customer gets, and finding a sale after it closed

**Status:** planned
**Vision pillar:** #1 — "setup **and operate**". A customer asking for a receipt is not an edge case,
and neither is a manager asking what was in yesterday's $84 order.
**Depends on:** nothing. Composes with Feature 12 (a reversal prints its own receipt) and Feature 16
(tender and change appear as lines) without requiring either.
**Unblocks:** Feature 12 T3, which voids "from the recent-sales view the POS already renders" — that
view currently cannot show what is in a sale.
**Added:** 2026-08-10

### The finding

**Two gaps that are the same gap.**

**1. The customer gets nothing.** A grep across `client/src`, `server` and `shared` for
`window.print`, `Printer`, `escpos`, `bluetooth`, `sendReceipt` or `customerEmail` returns **no hits
of any kind**. There is no printed receipt, no emailed receipt, no PDF, and nowhere to type a
customer's address. The sale is recorded and the transaction ends silently. In most jurisdictions a
receipt on request is not optional, and for the customer it is the only evidence the sale happened.

**2. A closed sale's contents are unreachable.** `linesJson` is rendered in exactly one place in the
entire client — `order-receipts.tsx:97`, inside the open-orders rail, which filters
`closedAt === null && customerName !== undefined && status === "completed"` (`:142`). The moment an
order is closed it drops out of that rail and its items become invisible. The Recent tab
(`pos.tsx:873-886`) shows total, time and payment method and nothing else; there is no tap target, no
detail view, and no search.

So the data is all there and none of it can be looked at. That is why these are one feature: the
thing a customer needs handed to them and the thing a manager needs to look up are **the same
rendering of the same sale**, and building either one separately produces two formatters that
disagree about what a receipt says.

Two smaller things worth fixing while in there: `sales.slice(0, 20)` (`pos.tsx:873`) silently
truncates — the same dishonesty Feature 13 T3 calls out for reports — and the rail's
`customerName !== undefined` filter means a sale rung without a name never appears as an open order
at all.

### The shape

One pure formatter, three exits.

```
shared/receipt.ts  →  on-screen detail  |  browser print  |  email body
```

Printing is `window.print()` against a receipt-width print stylesheet. That reaches any AirPrint or
network printer the tablet can already see, needs no dependency, no driver, and no native plugin.

```
ponytail: window.print() and an HTML email. No ESC/POS, no Bluetooth pairing, no
cash-drawer kick, no PDF library. A thermal printer needs a Capacitor plugin and
a paired device — that is a hardware feature, and it is worth building only once
an operator with one in front of them asks for it.
```

### Tasks

**T1 — A sale you can open** (~15 min)
- Make the Recent tab rows tappable, opening a detail view of the sale: every line with its
  modifiers and line total, the subtotal, discounts, tax, total, payment method, time, and — once
  Feature 19 T2 lands — who rang it. Read `linesJson`; do not recompute anything from products,
  because a sale must render as it was rung even if the menu has changed since.
- Replace `slice(0, 20)` with either a real "load more" or an explicit "showing the last 20 of N"
  label. A list that ends without saying it ended is a list an operator will trust wrongly.
- Add a search over the day's sales by amount, time or customer name. Finding a specific sale is the
  precondition for every correction workflow, including Feature 12's voids.
- Check: a sale rung with two items and a modifier opens and shows both lines, the modifier, and
  totals that match the stored `totalCents` exactly — not a recomputation that happens to agree.

**T2 — One formatter, and a receipt that prints** (~15 min)
- Add `shared/receipt.ts`: a pure function from a `Sale` (plus store name, address and any footer
  from store settings) to the receipt's ordered lines. No DOM, no formatting decisions duplicated in
  the page — the on-screen detail from T1 renders the same structure the print and email paths use.
- Take the money numbers **from the sale row**, never re-derive them. A receipt that recomputes tax
  is a receipt that will one day disagree with what the customer was charged, and the sale row is the
  record of what actually happened.
- Add a Print action on the detail view using a print stylesheet at receipt width (`@media print`,
  ~80mm). Everything else on the page is hidden in that stylesheet; that is the whole implementation.
- Check: printing to PDF from the browser produces a receipt whose total equals `sale.totalCents`,
  and the same sale rendered on screen and in the print preview shows identical lines.

**T3 — Email it, without collecting a customer database** (~15 min)
- Add an Email action taking an address at send time. **Do not store it on the sale and do not create
  a customers table** — a receipt address is a one-time delivery detail, and the moment it is
  persisted it is personal data this app has no policy for, no deletion path for, and (until
  Feature 17) no safe place to keep.
- Reuse the transport already built at `server/routes.ts:1196` for schedule publishing rather than
  constructing a second one, and reuse T2's formatter for the body. **Feature 17 applies**: the SMTP
  password stays write-only, and this path must not read it back to send.
- Fail honestly. If email is not configured the action says so — the same 400 the publish route
  already returns (`routes.ts:1195`) — rather than reporting a receipt sent to nobody. That is the
  Feature 7 rule, and this is a customer-facing promise.
- Check: with email configured, sending delivers a receipt whose total matches; with it
  unconfigured, the action reports that clearly and no sale record is modified either way.

**T4 — A reprint is marked as one** (~15 min)
- Every copy after the first prints **DUPLICATE**. An indistinguishable second original is a
  refund-fraud instrument in any store that accepts a printed receipt as proof of purchase, and this
  is one line in the formatter.
- Make the composition explicit rather than deferring it: Feature 16's `tenderedCents` /
  `changeCents` render as "Cash tendered / Change" lines when present, and Feature 12's reversals
  render as their own receipt showing the original sale id and the word VOID or REFUND. Both are
  `if present` branches in `shared/receipt.ts` — write them now so neither feature has to reopen this
  file, and both are inert until those features land.
- Note in the module that the receipt is a rendering, never a record: it reads a sale and writes
  nothing. If a task here starts mutating the sale, the seam is wrong.
- Check: the second print of the same sale carries the duplicate marking and the first does not; a
  sale with no tender data renders with no tender lines rather than blank ones.

### Non-goals

Thermal and ESC/POS printers, Bluetooth pairing, cash-drawer kick, kitchen tickets and any kitchen
display (a real feature, and a different one — what the kitchen needs is not what the customer gets),
PDF generation, receipt templating or branding beyond a store name and footer, SMS delivery, digital
receipt QR codes, customer accounts and loyalty, and storing customer contact details. Also out:
reprinting from anywhere other than the sale itself.

### Definition of done

A cashier can find any sale from the till, see exactly what was in it, hand the customer a printed or
emailed copy that matches what they were charged to the cent, and every copy after the first says so.

---

## Feature 19 — Who did that: attribution, and the log every autopsy needs

**Status:** planned
**Vision pillar:** #6 — *"an autopilot mode where an AI agent takes over… With enough logging, it
produces autopsies of its decisions taken in the past **and even taken by the operator** to
self-improve its decision making."* This is the only pillar with no coverage anywhere in the plan,
and the logging that sentence rests on does not exist.
**Depends on:** T1–T3 depend on nothing and are shippable today. T4 needs Feature 2 (the agent
bridge).
**Unblocks:** Feature 12 T3 (voids require an employee to attribute them to — there is currently no
such thing), Feature 14 (per-cashier numbers), Feature 15 T2 (the ledger's `employeeId`)
**Added:** 2026-08-10

### The finding

**Nothing in this system records who did anything.**

`employeeId` appears on exactly two entities — time punches (`client/src/lib/db.ts:135`) and
schedule shifts (`shared/schema.ts:227`). Not on sales (`db.ts:142-156` — `Sale` has
`customerName` and no cashier), not on inventory adjustments, not on price changes, not on anything
the generic CRUD layer writes. `grep -rin "auditLog\|actorId\|createdBy\|changedBy"` across
`client/src`, `server` and `shared` returns nothing at all.

**There is not even a current user to attribute to.** The only notion of one is
`selectedEmployeeId` in `client/src/components/app-shell.tsx:57` — React state, scoped to the time
clock dialog, and **cleared to `""` on submit** (`:85`). It exists for the length of one clock-in and
is then gone. Nothing else in the app can ask who is at the till, because at no point is the answer
stored.

The consequences are already written into this plan as assumptions that do not hold:

- **Feature 12 T3** requires a void to record "who and why", calling an unattributed void
  "indistinguishable from a cashier pocketing cash". There is no actor to record.
- **Feature 15 T2** puts `employeeId` on every ledger row. Nothing can supply it.
- **Feature 14** costs labour per employee while every sale that employee rang is anonymous, so
  "which shifts are productive" is unanswerable from data the system already holds.
- **Pillar #6's autopsy** is a review of decisions and their outcomes. The system currently retains
  the outcome (a price is now $6.50) and discards the decision (who changed it, from what, when,
  why) — which is precisely the half an autopsy is made of.

And the thing that looks like identity is not. `pin-protection.tsx:16` defaults `requiredPin` to
`"1234"`, compares it in the browser, and prints the PIN on its own dialog. It gates a screen; it
identifies nobody. Feature 4 already names this as its own problem — **this feature must not try to
fix it**, and must not pretend the actor it records is authenticated. An attributed action log on a
trusted device is a shift-log, not a security control, and it is still the thing that makes an
autopsy possible.

### The seam with Feature 15

Feature 15's ledger answers *how much of what moved and why*. This feature answers *who decided*.
Do not build a second ledger: **inventory movements stay in F15's `inventoryLedger` and simply carry
the actor this feature defines.** The action log covers the decisions that are not stock movements —
a price edited, a menu applied, a void, a discount, a restore, a setting changed. If a task here
finds itself logging quantities, the seam was cut in the wrong place.

```
ponytail: one append-only table, written at a handful of existing choke points,
with a free-text summary rather than a structured diff. No event bus, no
interceptor layer, no per-field change tracking. A structured before/after is
the upgrade when something actually queries it — today nothing does, and a diff
nobody reads is a schema to maintain for free.
```

### Tasks

**T1 — A current employee that outlives a dialog** (~15 min)
- Move the active employee out of `app-shell.tsx:57` into the store, persisted the way the app
  already persists device-local state (the `cornerpos_` `localStorage` convention `sync.ts` uses).
  The till is a shared device; who is on it is device state, not component state.
- Show it where the operator can see and change it — the app shell header already renders the time
  clock, so the same place. Clearing it on clock-out is correct; clearing it on submit
  (`app-shell.tsx:85`) is the bug.
- Keep working with no employee set. A single-operator store that never created an employee record
  must still be able to sell; attribution is `null`, and `null` is an honest answer that the reports
  in T4 must render as "unattributed" rather than dropping.
- Check: select an employee, reload the page, and confirm they are still the active one; clock out
  and confirm they are not.

**T2 — Sales carry the cashier** (~15 min)
- Add `employeeId` (nullable) to `Sale` in `shared/schema.ts`, `client/src/lib/db.ts` (Dexie version
  bump) and `server/schema.ts`, and set it from T1's active employee in all three places a sale is
  created — `pos.tsx:446`, `shared/api-handlers.ts:464`, `server/bom-engine.ts:440`. Existing rows
  stay null; do not backfill a guess.
- This is what Feature 12 T3's void attribution and Feature 14's per-employee view both need. It is
  four lines and it unblocks two features.
- Check: a sale rung with an employee selected reads back with their id; one rung with none reads
  back null rather than an empty string, and both render.

**T3 — The action log** (~15 min)
- Add an append-only `actionLog` table: `id`, `at`, `actorKind` (`EMPLOYEE` | `AGENT` | `SYSTEM`),
  `actorId`, `action` (a short constant, e.g. `PRICE_CHANGED`, `MENU_APPLIED`, `SALE_VOIDED`,
  `SETTING_CHANGED`, `BACKUP_RESTORED`, `DEMO_CLEARED`), `targetType`, `targetId`, `summary` (human
  readable, e.g. "Latte / Large $5.00 → $5.50"), and `detail` (nullable JSON).
- Write it at the choke points that already exist rather than adding an interception layer: the
  variant update path, `menu/apply` (Feature 1, one entry per apply with its change count — not one
  per change, or a 60-product menu buries the log), the settings `PUT` handler, and the restore path
  in `settings.tsx`. Inventory movements are **not** here; they are Feature 15's ledger rows.
- Append-only in the same sense Feature 12 uses: no update, no delete, no soft-delete field. A log
  the app can edit is a log that proves nothing. Say so in a comment on the table.
- Check: changing one variant's price writes exactly one row whose `summary` contains both the old
  and the new price; restoring a backup writes exactly one row; and nothing in the codebase updates
  or deletes a row in this table.

**T4 — Agent actions in the same log, and somewhere to read it** (~15 min)
- Feature 2's MCP endpoint sets `actorKind: "AGENT"` with an actor id identifying the connection, so
  an operator can see what the agent did next to what their staff did, in one list, in order. **That
  single list is what pillar #6's autopsy reads** — a separate agent log would make "what happened
  Tuesday" a join the operator has to perform in their head.
- Show it on the Settings page (or a Reports tab): most recent first, filterable by actor. Pair each
  `MENU_APPLIED` row with its change count so an operator can see "the agent changed 14 prices" and
  go look.
- Document in `docs/agent-setup.md` that every agent write is logged and attributed — an operator
  deciding whether to trust an agent with their menu should be told where to check what it did.
- **Not in this feature:** acting on the log. Autopilot, recommendations derived from past decisions,
  and any self-improvement loop are pillar #6's later half; this is the record they would need to
  exist first.
- Check: an `apply_menu` through the MCP endpoint appears in the log as an agent action with the
  number of changes, and a price changed by hand in the same minute appears beside it as an employee
  action.

### Non-goals

Authentication and real identity (Feature 4 — and the hardcoded `1234` in `pin-protection.tsx` is
its problem, not this one), per-field change diffs, log retention or rotation, tamper-evidence
(hash chaining a log an operator's own device writes is theatre), permissions and roles, undo from
the log, and the autopilot itself. Also out: logging reads. Who *looked* at a report is a
surveillance feature, not an operational one, and it would bury the writes that matter.

### Definition of done

A sale records who rang it, the decisions that change money or the menu leave an append-only row
naming who made them — staff or agent — and an operator can open one list and see what happened to
their store yesterday and who did it.

---

## Feature 18 — Profitability: the vision pillar with no expenses to subtract

**Status:** planned
**Vision pillar:** #5 — *"The store operator can view profitability over any period of time which
Store-One calculates by tracking **all revenues and expenses**. The platform offers AI overviews of
what affected profitability during that period and a few recommendations to improve."* Nothing in the
plan has claimed this pillar; Features 10, 13 and 14 build three of its inputs and stop there.
**Depends on:** T1 and T2 depend on nothing and are shippable today. T3 needs Feature 13 (real
revenue), Feature 10 + 11 (honest COGS) and Feature 14 (labour); T4 needs Feature 2 (the agent
bridge).
**Added:** 2026-08-10

### The finding

**The system cannot record a single expense that is not an ingredient.** `grep -rin
"expense\|overhead\|rent\|utilit"` across `client/src`, `server` and `shared` returns nothing. The
only money-out record in the schema is `invoices` + `invoiceLineItems`
(`client/src/lib/db.ts:87-105`), and every line item is tied to an `inventoryItemId` — a supplier
delivery, nothing else.

So rent, utilities, insurance, card processing fees, equipment repairs, licences, marketing, the
accountant's bill — none of them can be entered anywhere. Pillar #5's "all revenues and expenses" is,
today, "some revenues and the food."

That matters more than a missing form. Features 10, 13 and 14 are each building one line of a P&L
without anywhere for the lines to meet: F13 makes revenue real, F10 makes COGS real, F14 makes labour
real. Prime cost — F14 names it as "the obvious next step" and deliberately does not build it — is
those last two over the first. **Profit is that, minus everything this feature is about.** Ship
prime cost alone and an operator reads a healthy number while the rent quietly eats it.

### The trap: purchases are not COGS

The one modelling decision that makes or breaks this feature, and the easiest one to get backwards.

Supplier invoices are **inventory purchases**. Recipe depletion is **consumption**. They are
different numbers over any period shorter than forever: a store that buys a pallet of flour in March
has a large March invoice and a small March flour cost.

- COGS on the P&L is **consumption** — the recipe cost of what was actually sold (Feature 10),
  reconciled against what actually left the shelf (Feature 15's ledger).
- Invoices are a balance-sheet movement: cash out, inventory up. **They must not also appear as an
  expense line**, or every pallet is counted twice — once when bought, once when sold.

State this in the module and in the docs. A P&L that double-counts purchases is not slightly wrong;
it swings between wildly profitable and wildly unprofitable with the delivery schedule, and it looks
plausible in both directions.

```
ponytail: one flat expenses table and a P&L computed on the fly from the four
sources. No chart of accounts, no double-entry, no journals, no accounting
periods to close. The upgrade when an accountant is actually involved is an
export to their software, not a general ledger in this repo.
```

### Tasks

**T1 — Somewhere to put the rent** (~15 min)
- Add an `expenses` table (`shared/schema.ts`, `client/src/lib/db.ts` with a Dexie version bump, and
  the `crudEntities` array in `shared/api-handlers.ts` — each entry there is one line and generates
  full CRUD, so do not hand-write routes): `id`, `date`, `amountCents`, `category`, `vendor`, `note`,
  plus the standard `updatedAt` / `deletedAt`.
- Categories as one exported constant, not string literals: rent, utilities, insurance, fees
  (payment processing and bank), repairs and maintenance, marketing, professional services, supplies,
  other. Short and fixed — an operator picking from nine buttons will categorise; one typing free
  text will not, and then the report cannot group.
- **Do not model recurrence.** Monthly rent is twelve rows a year, entered in seconds. A recurrence
  engine is a scheduler, a generator, and an edit-the-series problem, for a saving of eleven clicks.
- Check: create, list by date window, and soft-delete an expense; assert a deleted expense is absent
  from the window.

**T2 — Enter one where the operator already is** (~15 min)
- Add an expenses view beside the existing invoice intake (`client/src/components/admin-invoice-
  intake.tsx` is the money-out screen operators already know) — date, amount, category, vendor, note.
  Amount edits in dollars and stores cents, like the rest of the app.
- Show the current month's total by category as it is entered. An operator who cannot see the running
  total has no way to notice they entered $4,500 rent as $45.00.
- **Put the purchases-are-not-expenses rule on the screen**, one line: supplier invoices are recorded
  under Invoices and appear as cost of goods when the stock is sold. Otherwise the first thing an
  operator does is enter their Sysco invoice here as well, and every number downstream doubles.
- Check: entering an expense updates the category total immediately, and the invoice screen is
  unchanged by it.

**T3 — `GET /api/reports/profit-and-loss?since=&until=`** (~15 min)
- In `shared/api-handlers.ts`, composing what the other features built: revenue from `salesSeries`
  (Feature 13 T1), COGS from `costVariant` over the period's product mix (Feature 10 T1), labour from
  `laborCostCents` (Feature 14 T2), expenses by category from T1. Return the lines, the totals, prime
  cost, and net profit — plus each as a percentage of revenue, which is the form operators manage
  against.
- **Reuse, do not re-derive.** If this task computes revenue or cost by walking sales itself, the
  earlier features were built wrong and that is worth knowing before this one lands.
- Honesty, the same rule the whole plan runs on: return `unknowns` — variants with no known cost
  (F10), employees with no pay rate (F14), unclosed punches (F14), windows containing over-drawn
  stock (F15) — and never fold an unknown into a zero. A net profit computed with three unpriced
  ingredients must say so next to the number.
- Include the **previous equivalent period** and the delta per line. "What affected profitability"
  is a comparison; a single column cannot answer it.
- Check: a window with one sale, one expense and one shift returns revenue, COGS, labour and expense
  lines that reconcile to the net figure exactly; and a variant with no cost appears in `unknowns`
  rather than raising the margin.

**T4 — The overview, written by the agent rather than by a new dependency** (~15 min)
- Add the P&L to `client/src/pages/reports.tsx` as its own tab, worst deltas first, with the unknowns
  visible rather than swept up.
- Add `profit_and_loss` to the Feature 2 MCP tool table. **That is where pillar #5's "AI overview and
  a few recommendations" comes from** — the endpoint returns the facts and the period-over-period
  deltas, the agent already connected to the store narrates them. Do not add an LLM dependency to
  this repo to generate prose about numbers an agent can already read; this codebase's job is to make
  the numbers true.
- Describe the tool so the agent knows the trap: purchases are not expenses, and unknowns are not
  zeros. A tool description that omits both invites a confident wrong summary of someone's business.
- Check: after adding an expense, `profit_and_loss` reflects it in the category line and in net
  profit with no other call, and the previous-period delta moves by the same amount.

### Non-goals

Double-entry bookkeeping, a chart of accounts, accounts payable and receivable, cash-flow statements,
balance sheets, depreciation, tax filing, payroll runs (Feature 14's non-goal and still one),
multi-location consolidation (needs Feature 3), recurring-expense scheduling, receipt capture or OCR,
and export to accounting software — that last one is the natural next feature and is what makes the
"accounting add-on" of pillar #3 real, but it is an integration, not a report.

Also explicitly not here: **the autopilot of pillar #6.** An agent that acts on these numbers needs
them trusted first, and the decision log that pillar's "autopsies" require is its own feature.

### Definition of done

An operator enters their rent, opens Reports, and sees for any window what came in, what the food
cost, what the labour cost, what everything else cost, and what was left — with anything the system
cannot compute honestly named rather than counted as zero, and with the previous period beside it so
the number means something.

---

## Feature 17 — The SMTP password is in the backup, and in every settings response

**Status:** T1 done — `SECRET_SETTING_FIELDS`, `redactSetting` and `mergeSettingSecrets` live in
`shared/schema.ts`; both settings read handlers redact, and `PUT` merges a marker or absent secret
over the stored value (`shared/api-handlers.ts:479-524`, tests in `shared/api-handlers.test.ts`).
T2 done — `redactSettingsRows` / `mergeRestoredSettings` in `shared/backup.ts` (tested); `buildSnapshot`
redacts as the snapshot is built and `confirmRestore` merges a redacted secret over the device's own,
both keyed off the same map. `BACKUP_TABLES` untouched.
T3–T4 remain: the Settings email card still loads the password into an input.
**Vision pillar:** #3 — third-party services need credentials, and this plan is about to add more of
them (Feature 16's integrations, Feature 4's API tokens). Also #1: losing an operator's email
account is not a foundation.
**Depends on:** nothing. Feature 7 T3's settings API is shipped and is where the problem lives.
**Relationship to Feature 4:** complementary, not covered by it. Feature 4 stops strangers reaching
the server; this stops the credential being handed out, copied into backups, and typed into a form
field in the first place.
**Added:** 2026-08-09

### The finding

The app stores SMTP credentials so it can email published schedules
(`server/routes.ts:1183-1210` builds a `nodemailer` transport from the `emailConfig` setting). The
credential is real and it is handled as if it were a display preference.

**1. Every settings response contains the password.** `GET /api/settings`
(`shared/api-handlers.ts:467-472`) returns

```ts
{ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) }
```

— every key, every value, `emailConfig.password` among them. `GET /api/settings/:key` returns the
same for a single key. There is no redaction of any kind, and (until Feature 4) no authentication in
front of it: anyone who can reach the server can read the operator's mail password with one
unauthenticated `GET`.

**2. The Settings page fetches the password back into a form field.** `settings.tsx:109` loads
`emailConfig` into React state, `:580` binds `emailConfig.password` to an input, and `saveEmailConfig`
(`:134-137`) posts the whole object back. The secret round-trips through the browser on every visit
to the page, whether or not anyone intends to change it.

**3. It is in every backup.** `BACKUP_TABLES` is derived from `db.tables` (`client/src/lib/db.ts:462`)
— which is exactly the property that makes Feature 9 correct, and it means the `settings` table, and
therefore the password, is inside every snapshot uploaded by `client/src/lib/backup.ts:32`. Feature 9
T3 already noted that a mistyped client code can pull *another* store's backup; that path now also
moves a live SMTP credential between stores.

**4. What is *not* wrong** — worth stating so nobody fixes the wrong thing: `settings` is absent from
`SYNC_CATEGORY_TABLES` (`shared/schema.ts:31-36`), so the credential does not travel over sync. One
channel, not three.

This is not a hypothetical exposure. A mail password is reusable, is often the operator's real
business account, and is the kind of loss a small restaurant does not detect for months.

### The shape

A secret is **write-only through the API**: it can be set and replaced, never read back. That single
rule fixes all three paths at once — a value the API will not emit cannot appear in a list response,
cannot be pre-filled into a form, and cannot be copied into a snapshot.

```
ponytail: one exported map of key -> secret field paths, and redaction at the
two exits (settings responses, backup snapshots). No secrets manager, no
envelope encryption, no KMS. Encrypting at rest is the upgrade if the database
itself becomes the threat model — today the leak is that we hand it out.
```

### Tasks

**T1 — Redact on the way out, preserve on the way in** (~15 min)
- Add `SECRET_SETTING_FIELDS` to `shared/schema.ts` (or beside the settings handlers): a map of
  setting key → field paths that must never be returned. Today: `emailConfig` → `["password"]`.
- Redact in **both** settings read handlers (`shared/api-handlers.ts:467`, `:478`). Return the field
  as an explicit marker — `"__SET__"` when a value exists, `null`/absent when it does not — never the
  value and never a fake string of asterisks that a client might save back verbatim.
- On `PUT`, a secret field arriving as the marker or absent means **keep what is stored**; any other
  value replaces it. Without that merge the first save from a redacted form blanks the password, and
  the operator finds out when the schedule email silently stops going out.
- Check: set a password, `GET /api/settings` and `GET /api/settings/emailConfig`, and assert the
  plaintext appears in neither body; then `PUT` the redacted object back unchanged and assert
  `POST /api/schedule/publish` still authenticates against the mail server.

**T2 — Keep secrets out of the snapshot** (~15 min)
- Strip the same fields in `client/src/lib/backup.ts:32` as the snapshot is built, using the map from
  T1 — **do not hand-maintain a second list**, and do not exclude the `settings` table wholesale:
  hours of operation and the tax rate belong in a backup, the password does not.
- Do not touch `BACKUP_TABLES`' derivation from `db.tables`. That property is what Feature 9 T1
  deliberately chose so a new table cannot fall out of backups; redaction belongs at the field level,
  below it.
- On restore, a redacted secret means **leave the stored value alone** — the same rule as T1's `PUT`,
  and the same rule Feature 9 T2 already applies to absent tables. Restoring a backup must not wipe
  the mail configuration on a working device.
- Check: back up a database with a configured password, read the uploaded snapshot, and assert the
  plaintext is absent; restore it onto a device that has a password set and assert that password
  still works afterwards.

**T3 — A credential field that is not a text box holding a secret** (~15 min)
- Rework the email card in `client/src/pages/settings.tsx:505-610`: when a password is stored, show
  "Configured" with a **Replace** action rather than loading the value into an input. An empty box
  the operator must not clear is a trap; a stated status with a deliberate replace is not.
- Add a **Send test email** action so configuration can be verified without ever reading the secret
  back. Right now the only way to find out whether the settings work is to publish a schedule to real
  staff. Reuse the transport built at `server/routes.ts:1196` rather than constructing a second one.
- Check: with a password stored, the rendered page contains the marker and not the plaintext (view
  source, not just the input's masking — `type="password"` hides a value it still ships to the
  browser); the test email sends; and saving the form without touching the field leaves it working.

**T4 — Make the rule outlive this feature** (~15 min)
- One assertion in the settings tests: for every key in `SECRET_SETTING_FIELDS`, no read handler
  response contains the stored value. That is what stops the next credential — a Stripe key, a
  supplier API token — from being added as an ordinary setting and re-opening this exact hole.
- Point the neighbouring features at the same mechanism rather than inventing their own: Feature 16
  T3 stores integration connection state under `integrations.<id>` and any credential it grows
  belongs in this map; Feature 4 T1 stores token *hashes* and shows the plaintext once, which is the
  same rule applied to a value the server never needs back.
- Document it in `docs/local-setup.md`: what is stored, what a backup contains, and — plainly — that
  until Feature 4 lands the settings API is unauthenticated, so an operator should not put a
  credential they care about on a server reachable from anything but their own network.
- Check: adding a fake secret key to the map and a matching setting makes the assertion fail until
  redaction covers it.

### Non-goals

Encryption at rest, a secrets manager or vault, OAuth flows in place of stored passwords, per-user
credentials, rotation policy, and audit logging of who read what. Also out of scope: moving
`emailConfig` to environment variables — the operator configures it from the Settings page, and an
env var is not something a restaurant owner can edit.

### Definition of done

No API response and no backup snapshot contains a stored credential, an operator can verify their
email configuration without reading the password back, and a test fails if the next secret is added
as a plain setting.

---

## Feature 16 — Taking money: a card button that survives a reload, and an integrations page that does not lie

**Status:** done — T1–T4 complete. Accepted tender is a store setting that survives a reload, a cash
sale records what was handed over and the change given, the Integrations page describes a roadmap
instead of simulating one, and the dead second POS is deleted.

T1 done — accepted tender is the `payments.methods` setting (`TENDER_METHODS_KEY`,
`tenderMethods`, `validateSetting` in `shared/schema.ts`), the payment dialog renders one button per
accepted method with no `(Setup Integration)` label, and the API rejects an empty list
(`shared/api-handlers.test.ts`). `pos.tsx` no longer reads `integrations` at all — T3 still has to
delete the state and its fake toggle.
T2 done — `tenderedCents` / `changeCents` on `Sale` (Dexie v11, `admin_sales` columns added by both
the bootstrap and an `ALTER … IF NOT EXISTS`), a cash sale asks what was handed over with quick
amounts from `tenderSuggestions`, change comes from `changeDueCents` (never negative; an
under-tender disables Record Sale), and a non-cash sale records `tendered = total, change = 0`.
Tests in `shared/tender.test.ts`.
T3 done — the six providers live in `shared/integrations.ts`, each `status: "planned"`, and each card
says "Not available yet" with a disabled button. `toggleIntegration` and the `integrations` state are
deleted from both stores, and the page points at Settings → Payment Methods for taking cards.
T4 done — `client/src/pages/home.tsx` (1,141 lines of parallel cart, pricing and payment code,
imported by nothing) is deleted. Nothing was salvaged: everything in it exists in `pos.tsx`.
**Vision pillar:** #3 — *"optional add-on features that the operator can setup and pay for later. The
operator can optionally integrate 3rd party vendors."* This pillar has a page, a nav entry, and no
implementation. Also #1: "setup **and operate**" — operating a till means taking the money.
**Depends on:** nothing unshipped. Feature 7 T3 already landed store settings on both servers, which
is where T1's configuration belongs. **This feature is implementable today.**
**Added:** 2026-08-09

### The finding

**The Integrations page is a prop.** `client/src/pages/integrations.tsx` renders six provider cards
defined as object literals inside the component body (`:13-23`) — Sysco Connect, US Foods, Local
Farms API, Stripe Terminal, Square Reader, Toast Connect. Connecting one calls `toggleIntegration`,
which is:

```ts
// client/src/lib/store.tsx:236-241
const toggleIntegration = useCallback((id: string) => {
  setIntegrations(prev => {
    if (prev.includes(id)) return prev.filter(i => i !== id);
    toast({ title: "Integration Connected", description: "Successfully linked to provider." });
```

`setIntegrations` is React `useState<string[]>([])` (`store.tsx:129`). No network call, no
persistence, no credential, no provider on the other end. The toast says *"Successfully linked to
provider"* about a provider that was never contacted, and the whole thing **evaporates on reload**.
On the admin path it is worse: `admin-store.tsx:129` declares the same field with no setter at all,
so it is permanently `[]`.

This is the Feature 7 failure again — reporting success for something that did not happen — except
here it is the one page the product points at for pillar #3.

**And it is load-bearing.** `pos.tsx:133` computes
`hasPaymentIntegration = integrations.some(id => id.startsWith('pay_'))`, and that flag gates the
**Card** button in the payment dialog (`pos.tsx:922-928`, `disabled={!hasPaymentIntegration}`, with
the label *"(Setup Integration)"*), while `handleConfirmOrder` forces `Cash` when it is false
(`:350`). So:

- Every reload puts the till back to **cash only**. A store that takes cards has to re-click a fake
  toggle each time the tablet restarts, and nothing on screen explains that.
- The gate protects nothing. "Connecting" Stripe Terminal starts no payment flow, charges no card,
  and returns no authorisation — it only unlocks the ability to *label* a sale as Card.

The two facts together are the real defect: **whether a store can record a card sale depends on
ephemeral React state**, and the honest version of that decision — "this store accepts cards" — is
not stored anywhere.

**Cash is not recorded either.** A grep for `tender`, `changeDue`, `amountPaid` or `cashGiven`
across `client/src`, `server` and `shared` returns nothing. The payment dialog shows Total Due and
two buttons (`pos.tsx:900-960`); it never asks what the customer handed over, so there is no change
due to hand back and no expected drawer figure at close. A cash sale records the total and nothing
about the money.

**A second, dead copy of all of this exists.** `client/src/pages/home.tsx` is 1,141 lines with its
own cart, its own `paymentMethod` state (`:97`), and its own sale-recording path (`:274`). It is
imported by nothing — `App.tsx` routes `/` to `pos.tsx` and never mentions `home`. Any fix to the
payment path has a coin-flip chance of being applied to the file that does not run.

### The shape

What a store accepts is **configuration**, not an integration status. Most small operators take cards
on a standalone terminal from their bank and want the POS to record the tender — that is a supported
setup, not a missing feature, and the current design has no way to express it.

```
ponytail: accepted tender types are a store setting and a string on the sale.
No processor SDK, no payment state machine, no auth/capture, no webhooks. The
upgrade when a real terminal lands is one integration whose status flips to
'available' — the setting and the sale field do not change shape.
```

### Tasks

**T1 — Accepted tender types become a store setting** (~15 min)
- Store `payments.methods` (default `["Cash", "Card"]`) through the settings API Feature 7 T3 put on
  both servers (`GET`/`PUT /api/settings/:key`). Add it to the Settings page beside the other store
  configuration, not to the Integrations page — this is a property of the business, not of a vendor.
- Replace `hasPaymentIntegration` (`pos.tsx:133`) with a read of that setting. Render one button per
  accepted method rather than a hardcoded Card/Cash pair, and delete the `(Setup Integration)`
  label — it points at a page that cannot deliver what it promises.
- A store must be left with at least one method. Saving an empty list is the one input here that can
  brick a till, so reject it rather than trusting the UI to prevent it.
- Check: enable Card, reload the page, and confirm Card is still selectable — that single assertion
  is the whole bug. Then set the store to cash-only and confirm Card cannot be chosen.

**T2 — Cash tender and change due** (~15 min)
- Add `tenderedCents` and `changeCents` to `Sale` (`shared/schema.ts`, `client/src/lib/db.ts`, and
  the Dexie version bump), both nullable so existing rows stay readable.
- In the payment dialog, a Cash sale asks for the amount tendered — with quick buttons for the exact
  total and the next round notes — and shows the change due before the sale is recorded. Change is
  `tendered - total`, computed in one place and never negative: an under-tender is a blocked
  confirm, not a negative change.
- A non-cash sale records `tenderedCents = totalCents` and `changeCents = 0`. Not null — the day's
  cash expectation is a sum over this column, and a null in the middle of it is a hole nobody can
  distinguish from a zero.
- Check: $20.00 against a $13.75 total shows $6.25 and stores both numbers; $10.00 against $13.75
  cannot be confirmed; a card sale stores tendered equal to the total.

**T3 — An integrations page that states what is true** (~15 min)
- Move the six provider literals out of the component into `shared/integrations.ts`, each with a
  `status: "available" | "planned"`. **Every one of them is `planned` today** — none has an
  implementation — so each card says so plainly and offers no toggle. A disabled card that says
  "not available yet" is honest; a working toggle that persists nothing is not.
- Delete `toggleIntegration` and the `integrations` state from both stores (`store.tsx:129, 236-241`,
  `admin-store.tsx:129`) once nothing reads them. Leaving a fake toggle behind because it is "only
  a demo" is how `hasPaymentIntegration` came to gate real money.
- When an integration does become `available`, its connected-state lives in store settings under
  `integrations.<id>`, the same mechanism as T1 — **no credentials in `localStorage`**, and no new
  table for a list that is currently six rows long.
- Keep the page and its nav entry. Pillar #3 is a real promise and the page is where an operator will
  look for it; the fix is for it to describe a roadmap rather than simulate a product.
- Check: no click anywhere on the page produces a "Successfully linked" toast, and a reload changes
  nothing about what the page shows.

**T4 — Delete the dead second POS** (~15 min)
- Remove `client/src/pages/home.tsx`. Confirm it first — `grep -rn "pages/home" client/src` returns
  nothing and `App.tsx` routes `/` to `pos.tsx` — then delete it rather than leaving 1,141 lines of
  parallel cart, pricing and payment code for the next reader to fix by mistake.
- If any of it is genuinely wanted, take that part into `pos.tsx` in this task and delete the rest.
  What must not happen is the file surviving as a reference copy; that is how the two depletion
  copies in Feature 15 came about.
- Check: `npm run check` is clean and the app builds with the file gone.

### Non-goals

Real processor integration (Stripe/Square terminal handshakes, auth/capture, webhooks, refunds to a
card), tips and tip-outs, split tender across two methods on one sale, gift cards, and offline card
queuing. **Cash-drawer reconciliation — an opening float, a shift close, and an over/short figure —
is the obvious next feature** and is why T2 stores the tender rather than only the change: without
that column there is nothing to reconcile against. Feature 12 lists it as a non-goal too; whichever
of these lands first, the drawer is its own entry, not a fifth task here.

### Definition of done

A store configures which payment methods it accepts, that survives a reload, a cash sale shows the
change the customer is owed and records what they handed over, the Integrations page says truthfully
that nothing is connected yet, and there is exactly one POS page in the codebase.

---

## Feature 15 — Depletion that leaves a record: one engine, one ledger

**Status:** done — T1–T4 complete. One depletion engine, an append-only ledger written in the same
transaction as the sale, quantities that are allowed to go negative and say so, and waste, physical
counts and the unexplained remainder between them.

T1 done — the walk lives in `shared/depletion.ts`, called by both paths; `bom-engine.ts`
re-exports it and the till's copy (`resolveSubRecipe` + the walk in `handleRecordSale`) is deleted.
The server's bare `else` is gone: a BOM row pointing at nothing deducts from nothing. Fixture
assertions in `server/depletion.test.ts` pin a seeded drink's deltas, written out by hand from the
seed rows.
T2 done — `inventoryLedger` (Dexie v12, `shared/ledger.ts`) with `ledgerRows` as the one place a
delta becomes a quantity and a row. `recordSale` writes the sale, the stock and the ledger in one
Dexie `rw` transaction, so the old "N un-awaited adjusts, then the sale" ordering is gone. Invoice
receives log `RECEIVE`, manual adjustments log `MANUAL`, on both the till and the local-server paths.
`BACKUP_TABLES` picks it up automatically — confirmed at runtime, 18 tables.
Still unlogged, for a later task: `updateInventoryItem` with an explicit `currentQuantity`
(`dexie-admin-storage.ts:260`) sets stock directly rather than by delta, and creating an item with an
opening quantity (`inventory.tsx:55`) writes stock with no opening row.
T3 done — the clamp is gone. T2 had already funnelled every quantity write through `ledgerRows`, so
this was one line there plus the two server sites (`storage.ts:714`, and the simulate preview's
projection in `bom-engine.ts`, which now warns "over-drawn" rather than "depleted"). Over-drawn is its
own state on the inventory page and in the reports stock table — never folded into "Low" — and no sale
is blocked on stock.
T4 done — waste (item, quantity, **required** reason from `WASTE_REASONS`, optional note) and a
physical count, both through the same ledger path; the count writes the gap as a `COUNT` row rather
than overwriting the quantity. `reconcile` (`shared/ledger.ts`, tested against the plan's check)
gives opening / received / sold / wasted / counted / unexplained per item, shown as "Where it went" on
the inventory page. An item nobody counted reads "not counted", never a zero variance.

**Found while doing T1, not fixed here:** BOM rows are attached only to a product's *small* variant
(`seed-data.ts:208-224`, `sourceId: V("mocha_s")`) while their `scaleFactorMatrix` keys every size.
The walk filters `sourceId === line.variantId`, so **a medium or large drink matches no BOM rows and
deducts nothing at all** — the scale factors never apply. Both copies behaved this way, so T1 changes
nothing about it, but it is a bigger hole in pillar #4 than the drift T1 closed: either the seed must
carry a row per variant, or the walk must resolve a product's recipe through its default variant.
**Vision pillar:** #4 — *"the depletion of the amount of recipe ingredients of the items are the most
accurate in the industry. This is imperative to accurate expense calculations and forecasts in COGS."*
This is the pillar the plan has never touched.
**Blocks:** Feature 12 T2 (its reversal negates the server's deduction map, which today is not the
code that did the deducting) and Feature 10 (COGS from recipes is only as true as depletion is)
**Added:** 2026-08-09

### The finding

Depletion works. It is also **implemented twice, reconciled never, and recorded nowhere.**

**1. Two copies of the same traversal.** `computeInventoryDeductions`
(`server/bom-engine.ts:203-293`) and `handleRecordSale` (`client/src/pages/pos.tsx:373-436`, with
`resolveSubRecipe` at `:354`) are the same algorithm written out twice — same depth-5 recursion
guard, same `ancestors` cycle check, same `sfm[variant.id] ?? sfm[variant.name] ?? 1` scale lookup,
same `overrideModifierGroupId` skip, same modifier `quantityPerUse` fallback. The server copy is a
pure function returning a `Map`; the POS copy calls `adjustInventory` as it walks.

They have already drifted. In the sub-recipe walk the POS copy writes only
`else if (subEntry.inventoryItemId)` (`pos.tsx:367`) while the server copy has a bare `else`
(`bom-engine.ts:224`) — so a BOM row with neither a `sourceProductId` nor an `inventoryItemId`
produces a phantom deduction keyed by an empty string on the server and nothing on the tablet. That
is the drift found by reading; the point of this feature is that there is no mechanism to find the
next one, because **only the POS copy runs on real sales** (`bom-engine.ts` has exactly one
importer, `server/routes.ts:16`, for test orders).

**2. The deduction is not atomic with the sale, and happens first.** `handleRecordSale` fires N
independent `adjustInventory` calls — `store.tsx:201` is fire-and-forget, returning `void` on an
un-awaited promise — and only then calls `addSale` (`pos.tsx:446`). There is no transaction. An app
closed, a tab crashed, or a failed write mid-loop leaves stock partly deducted for a sale that may
not exist, and nothing afterwards can tell which lines were applied.

**3. The overdraw is silently clamped away.** Both adjusters do
`Math.max(0, item.currentQuantity + delta)` (`client/src/lib/local-storage.ts:257`,
`client/src/lib/dexie-admin-storage.ts:266`). Sell ten lattes against four ounces of milk and the
item reads `0` — not `-36`. The shortfall is not flagged, not logged, not recoverable. That clamp
destroys precisely the signal pillar #4 is about: how far the recipe's prediction sits from reality.

**4. Nothing records *why* a quantity changed.** The Dexie schema (`client/src/lib/db.ts:194-211`)
has seventeen tables and none of them is a ledger. Invoices raise stock
(`createInvoiceWithLineItems`), sales lower it, an operator edits it by hand in
`client/src/pages/inventory.tsx` — and afterwards `currentQuantity` is a single number with no
history. An operator asking "where did forty ounces of milk go on Tuesday" has no way to be
answered, and neither does an agent.

**5. There is no way to record waste.** `grep -rin "waste\|spoilage\|spillage"` across `client/src`,
`server` and `shared` returns only CSS `shrink-0`. A dropped tray, a spoiled case, a comped drink —
every one of them silently becomes "the recipes must be wrong", because that is the only bucket the
system has.

Taken together: the number this product claims to be best-in-industry at is computed by a duplicated
function, written non-atomically, clamped at zero, and never explained.

### The shape

One engine, one append-only ledger, and an honest variance number. Not an inventory subsystem —
`currentQuantity` stays exactly where it is and stays the source of truth for what is on hand. The
ledger explains it; it does not replace it.

```
ponytail: the ledger is append-only rows, and currentQuantity stays a
materialised column. No event sourcing, no rebuild-from-log, no reconciliation
job. If the two ever disagree, the count in T4 is what fixes it. Rebuild-from-log
is the upgrade if and when the ledger is trusted more than the column.
```

### Tasks

**T1 — One depletion engine, called by both paths** (~15 min)
- Move `computeInventoryDeductions` (`server/bom-engine.ts:203-293`) into a new `shared/depletion.ts`
  verbatim — it is already pure and already takes preloaded data, so this is a cut and a paste plus
  an import. It must import nothing from `server/`.
- Delete the copy in `pos.tsx`: `handleRecordSale` calls the shared function to get the
  `Map<inventoryItemId, delta>` and then applies it, instead of walking the BOM itself.
  `resolveSubRecipe` (`pos.tsx:354`) goes with it.
- Take the server copy's bare `else` as the bug and keep the POS copy's `inventoryItemId` guard —
  a BOM row pointing at nothing must deduct from nothing, not from `""`.
- **Not to be confused with Feature 5 T1**, which extracts `allocateComboDiscounts` and the line
  pricing (`bom-engine.ts:295-335`) into `shared/pricing.ts`. Different region of the same file,
  different module. Either order works; whichever lands second rebases trivially.
- Check: for a seeded large mocha with an oat-milk modifier, the map returned by the shared function
  equals — key for key, number for number — the deltas the current `pos.tsx` would have applied.
  Write that as a fixture assertion, because it is the only proof the two copies were equivalent
  before one of them was deleted.

**T2 — The ledger, written in the same transaction as the sale** (~15 min)
- Add an `inventoryLedger` table to `client/src/lib/db.ts` (new Dexie version, following the v9/v10
  upgrades already there) and to `shared/schema.ts`: `id`, `inventoryItemId`, `delta`,
  `quantityAfter`, `reason` (`SALE` | `VOID` | `RECEIVE` | `WASTE` | `COUNT` | `MANUAL`),
  `refType`/`refId` (the sale, invoice or count that caused it), `note`, `employeeId`, `createdAt`.
  Add it to `BACKUP_TABLES` — it is derived from `db.tables` since Feature 9 T1, so this is free, but
  confirm it rather than assuming.
- Wrap sale recording in one Dexie `rw` transaction: write the sale, apply every delta, append one
  ledger row per delta. Either all of it lands or none of it does. Today the sale is written *after*
  the stock moves; inside a transaction that ordering stops mattering, which is the point.
- Route the two existing stock writers through it too: `createInvoiceWithLineItems` logs `RECEIVE`,
  the inventory page's manual edit logs `MANUAL`. A ledger with a hole in it is worse than none,
  because the hole looks like theft.
- Check: recording a two-line sale writes exactly one sale row and one ledger row per distinct
  inventory item, and forcing a mid-transaction failure leaves the sale absent **and** stock
  untouched.

**T3 — Let stock go negative, and say so** (~15 min)
- Remove the `Math.max(0, …)` clamp from both adjusters (`local-storage.ts:257`,
  `dexie-admin-storage.ts:266`). A negative `currentQuantity` is information: the recipe says you used
  more than you had, so either the count is stale or the recipe is wrong. Clamping deletes the
  question.
- Both copies must change together — server and tablet disagreeing about what "out of stock" means
  is the same class of bug as Feature 11 T2's two invoice paths.
- Surface it where stock already is: `client/src/pages/inventory.tsx:37` already computes a low-stock
  count off `lowStockThreshold`; negative items are a distinct, louder state and must not be folded
  into "low".
- **Do not block a sale on insufficient stock.** A till that refuses to sell a coffee because the
  system thinks the beans ran out is a till the staff will work around, and then the data is worse.
  Record the truth, do not enforce it.
- Check: selling more than is on hand leaves a negative quantity and a ledger row whose
  `quantityAfter` matches it; the inventory page shows the item as over-drawn rather than as zero.

**T4 — Waste, a physical count, and the variance between them** (~15 min)
- Add a waste entry on the inventory page: item, quantity, a **required** reason from a short fixed
  list (spoiled, dropped, comped, prep loss), optional note. It writes a `WASTE` ledger row and
  adjusts stock through the same path as everything else. Required, because an optional reason field
  is an empty one — the same finding as Feature 12 T2.
- Add a physical count: the operator types what is actually on the shelf, and the difference between
  that and `currentQuantity` is written as one `COUNT` row. **The count is the truth and the variance
  is the finding** — do not silently overwrite the quantity without recording what the gap was.
- Show, per item over a window: opening, received, sold (theoretical), wasted, counted, and the
  unexplained remainder. That last column is the number pillar #4 is actually claiming to be best at,
  and it is unavailable today at any price.
- Check: an item received 100, sold 40 by recipe, wasted 5 and counted at 50 reports an unexplained
  variance of 5 — not 0, and not an error.

### Non-goals

Par levels, reorder points, and purchase-order generation (that is the inventory add-on in pillar #3
and its own feature); yield and waste *factors* on recipes, which Features 10 and 11 both defer and
which this feature makes measurable rather than replaces; multi-location stock transfers (needs
Feature 3); lot tracking, expiry dates and FIFO/weighted-average valuation; and rebuilding
`currentQuantity` from the ledger. Also explicitly out: **blocking sales on stock levels**, and any
automatic "your recipe is wrong" correction — surfacing the variance is the feature, acting on it is
the operator's call until pillar #6 exists.

### Definition of done

Both servers deplete through one function, every change to a quantity has a row saying what caused
it, an over-sale shows as negative rather than zero, and an operator can see for any item what the
recipes predicted, what was thrown away, what was actually counted, and how much is still
unexplained.

---

## Feature 14 — Labour: the second-biggest number, and nobody can even type a wage

**Status:** done — T1–T4 complete. A wage an operator can set, hours with an explicit answer for the
punch nobody closed, labour cost and percentage on the reports page, and rostered against paid.

T1 done — the employee dialog has a **pay rate per hour** field, edited in dollars and
stored in cents through `shared/money.ts` (`parseDollarsToCents` / `centsToDollarsInput`, tested). The
hardcoded `1500` is gone: a new employee cannot be saved without either a rate or an explicit
**Unpaid** tick, and the rate is shown in the employee table so a wage nobody set is visible rather
than assumed. Existing rows are not backfilled.
T2 done — `shared/labor.ts`: `hoursWorked` and `laborCost` (named for what it returns — a record, not a
bare number — plus `laborPct` for T3). Punches are clamped to the window, so a shift over midnight
splits across the two days. An open punch inside the 16-hour cutoff counts to `now` and is listed as
`inProgress`; one past the cutoff is **not billed** and comes back in `unclosedPunches` with the
employee named. Hours belonging to someone with no wage set are reported as hours but not priced, in
`hoursWithUnknownRate` / `unknownRateEmployees`, and `laborPct` returns null rather than a ratio built
on them. Tests in `shared/labor.test.ts`, including the plan's 40-hour and midnight checks.
T3 done — the Sales Trends tab carries **Labour Cost**, **Labour % of Revenue** and **Hours Worked**
for the same window as the revenue above them, from `laborCost`/`laborPct`. Any window with an
unclosed punch says so beside the numbers, names who and for how long, and states that those hours are
*not* included; unset pay rates get their own caveat with a link to the employees page; shifts still
running are called out as counted-to-now.
T4 done — `scheduledVsActual` in `shared/labor.ts` and a **Rostered vs paid (this week)** table on the
reports page: rostered hours, paid hours, variance (biggest overrun first) and cost per employee.
Everyone in *either* list gets a row, so a shift nobody turned up for shows as variance instead of
vanishing. Shifts are fetched from `GET /api/schedule/shifts?weekStart=` and a failed request degrades
to actual-only **and says so**, rather than rendering an empty roster as though nobody was scheduled.
Punches stay local — Feature 7 T4's split is untouched.

**Feature 14 is complete.**

**Seam, decided in T2:** `Employee.payRate` is a non-null number, so `0` is the only way to say
"unpaid" *and* the value an old row with no rate already has — T1 reads `0` as a deliberate "Unpaid".
`shared/labor.ts` takes `payRate: number | null` so it already handles the distinction: `0` costs
nothing knowingly, `null` is unknown and named. Making the schema field nullable is now a one-line
change if an operator ever needs "never set" to read differently on screen — deliberately **not** done
here, because it would rewrite every stored employee row for a display nicety.

(The note that stood here described Feature 11 T1, not this feature — it has moved to Feature 11,
which is now done.)
**Vision pillar:** #1 — "the best foundation". Feature 10 is the growth feature; this is the feature
that makes Feature 10's numbers true.
**Blocks:** Feature 10 (do this first, or ship a margin report that is confidently wrong)
**Added:** 2026-08-09

### The finding

Labour is the second-largest line in a restaurant's P&L, usually within a few points of COGS. The
codebase has employees, pay rates, time punches and a full drag-and-drop schedule — and computes
nothing from any of it.

**1. `payRate` is multiplied by nothing, anywhere.** Grep it across `client/`, `server/` and
`shared/`: it is declared (`shared/schema.ts:147`), seeded (`server/seed-data.ts:255-258` at 2200,
1600, 1550 and 1400), stored, and round-tripped through both storage layers. It is never an operand.

**2. There is no way to enter one.** The employee dialog in `client/src/pages/employees.tsx` renders
exactly four fields — Name (`:189`), Role (`:193`), Email (`:203`), Access PIN (`:215`). There is no
pay-rate input. `payRate` is set to a hardcoded `1500` when the dialog opens for a new employee
(`:55`) and otherwise carried through untouched, so **every employee an operator creates in the app
is silently $15.00/hour**, and nothing on screen ever says so. A labour report built today would
report confident numbers about a wage nobody chose.

**3. Nothing closes an open punch.** Clocking in writes `{ timeIn: Date.now() }` with no `timeOut`
(`client/src/components/app-shell.tsx:76-81`); clocking out sets it (`:73`). `activePunch` is found
by `!tp.timeOut` (`:60`). A closing shift where someone forgets to clock out leaves a punch open
forever — and the naive `now - timeIn` is then 60 unpaid-looking hours by Monday. Any hours
calculation has to decide what an open punch means *before* it can produce a number.

**4. The data is split across the client/server line.** Employees and time punches are **client-only
by Feature 7 T4's deliberate decision** — the server answers 501 (`server/routes.ts:643, 648`).
Schedule shifts are the opposite: real server routes at `server/routes.ts:1125-1159`, fetched over
HTTP by `client/src/pages/schedule.tsx:139`. Actual hours and scheduled hours therefore live on
opposite sides of that line, and this feature must not quietly relocate either one.

### The shape

Actual labour cost is one multiply — `hours × payRate` — over data that already exists. What this
feature is really about is the three honesty problems around it: a wage nobody set, a punch nobody
closed, and a percentage whose denominator is currently `Math.random()`.

### Tasks

**T1 — A wage an operator can actually set** (~15 min)
- Add a pay-rate field to the employee dialog (`client/src/pages/employees.tsx:189-220`), beside the
  existing four. Label it with its unit — **per hour** — and edit in dollars while storing cents, the
  way the rest of the app treats money.
- Delete the hardcoded `1500` default at `:55`. A new employee should start empty and be **required**
  to have a rate before saving, or be explicitly marked unpaid; inventing a plausible wage is exactly
  the "flattering lie" failure Feature 10 and Feature 11 both got caught by.
- Existing rows keep whatever they have. Do not backfill 1500 onto them — a wrong wage that looks
  deliberate is worse than a blank one.
- Check: create an employee, set $18.50, reload, and confirm `payRate === 1850`. Then confirm an
  employee saved before this change still reads back unchanged.

**T2 — Hours, with an explicit answer for the punch nobody closed** (~15 min)
- Add `shared/labor.ts` with `hoursWorked(punches, { since, until })` and
  `laborCostCents(punches, employees, window)`, pure over the types in `shared/schema.ts:154-161`.
- Clamp every punch to the window so a shift spanning midnight is split across days rather than
  counted twice or dropped.
- **Open punches:** a punch with no `timeOut` whose `timeIn` is within the current shift counts to
  `now` and is reported as *in progress*. One older than a configurable cutoff (default 16 hours) is
  **not** silently billed — it is returned in an `unclosedPunches` list for the operator to fix,
  exactly as Feature 10 returns `unknownIngredients` rather than costing them at zero. Return
  `{ costCents, hours, inProgress, unclosedPunches }`, never a bare number.
- Employees with no `payRate` yield hours but unknown cost, and must appear in the unknown list
  rather than contributing zero.
- Check: a punch open for 40 hours does not add 40 hours to the total and does appear in
  `unclosedPunches`; a punch crossing midnight splits correctly across two days.

**T3 — Labour on the reports page, as cost and as a percentage** (~15 min)
- Add labour to `client/src/pages/reports.tsx`: cost for the selected window and **labour as a
  percentage of revenue**, which is the form operators actually manage against. `employees` is
  already destructured there (`reports.tsx:105`) and currently unused; `timePunches` comes off the
  same `useStore()` (`client/src/lib/store.tsx:251-252`).
- **This is why Feature 13 comes first.** Labour percent divides by revenue, and until Feature 13
  lands that denominator is `generateMockSalesData()`. Shipping this against the current page
  produces a labour percentage that changes on every render.
- Any window containing an unclosed punch must say so next to the number rather than quietly
  under-reporting it.
- Check: with seeded punches the labour percentage equals `laborCostCents / revenueCents` for the
  same window, and two consecutive loads agree.

**T4 — Scheduled versus actual** (~15 min)
- The schedule already holds intent: `scheduleShifts` (`server/schema.ts:157`) with `weekStart`,
  `dayOfWeek`, `startMinutes`, `endMinutes`. Scheduled hours are `(endMinutes - startMinutes) / 60`
  summed per employee per week, and scheduled cost is that times `payRate`.
- Show scheduled versus actual for the week, per employee, with the variance. "You rostered 38 hours
  and paid 44" is the single most actionable labour number a small operator gets, and it is the one
  an agent should be able to read before it is trusted to touch a schedule (pillar #2).
- Shifts come from the server (`GET /api/schedule/shifts?weekStart=`) while punches are local —
  fetch the week rather than assuming a local table, and degrade to actual-only if that call fails.
  Do **not** "fix" the split by moving punches server-side; that reverses Feature 7 T4 and is its own
  feature.
- Check: a week with a rostered shift and no matching punch shows the full shift as variance rather
  than being omitted, and the page still renders actual hours when the shifts request fails.

### Non-goals

Payroll runs, tax withholding, overtime rules (they are jurisdictional and belong nowhere near a
first pass), break tracking, tips and tip-outs, salaried staff, labour cost attributed per menu item
— Feature 10 already lists that as a non-goal and it stays one — and moving employees or punches to
the server. **Prime cost** (Feature 10's COGS percentage plus this feature's labour percentage) is
the obvious next step and deliberately not bundled here: it is one addition once both numbers are
trustworthy, and worthless before then.

### Definition of done

An operator can set a wage, see what they actually paid in labour for a period, see it as a
percentage of real revenue, and see where the week's hours diverged from the roster — with forgotten
clock-outs surfaced as something to fix rather than folded silently into the total.

---

## Feature 13 — Reports that show what actually happened

**Status:** done — T1–T4 complete. `shared/reports.ts` (`salesSeries`, `salesSummary`,
`productMix`, tested), both report endpoints rewired to it, and `reports.tsx` reading the `sales`
that were already in scope. `Math.random` is gone from the page and a test keeps it gone.

Deviations worth knowing:

- **`sales-summary` also returns a `series` now**, and both endpoints take `?since=`/`?until=`.
  The scalars alone could not answer what the page's granularity selector asks, and two
  endpoints returning different views of the same rows is how they drift apart.
- **Each granularity carries its own range** (hourly = today, daily = 14 days, monthly = 12
  months). Not in the plan, but unavoidable once the data is real: hourly over months of sales
  stacks every 09:00 the shop has ever traded under one repeated label.
- **Empty buckets are omitted, not zero-filled.** `salesSeries` returns `[]` for a store with no
  sales and the page renders the empty state from that, so T4 needed no separate empty check.
- The `.slice(0, 8)` on product mix is **gone rather than labelled** — the list is short enough
  that truncating it bought nothing.
**Vision pillar:** #1 — "the best foundation". An operator cannot grow on numbers that were invented.
**Blocks:** Feature 10 (its T3 adds a margins table "alongside the existing reports", and its T2
joins against product-mix volumes — both of those neighbours are currently random)
**Added:** 2026-08-09

### The finding

**The Reports page does not report. It generates random numbers.**

`client/src/pages/reports.tsx` calls no API at all — grep it for `useQuery`, `fetch`, or `/api/` and
there are zero hits. Two of its three tabs are fabricated:

| Tab | What it shows | Reality |
|---|---|---|
| Sales | revenue chart, plus **Total Sales / Transactions / Avg Check** KPI cards | `generateMockSalesData()` at `reports.tsx:38-62` — `Math.random()` in all three granularities. The KPIs at `:115-123` are sums of that random series. |
| Product Mix | per-product quantity and revenue, sorted by revenue | `reports.tsx:125-138` — real product *names*, but `quantity` and `revenue` are `Math.floor(Math.random() * 100) + 20`. |
| Inventory | on-hand and low-stock | **Real.** Reads `inventory` from the store (`reports.tsx:105`). |

Line 105 destructures `sales` and `employees` from `useStore()` and then never uses either. The real
sales are sitting in scope, unread, while the chart above them is dice.

**The real computations already exist and are ignored.** `shared/api-handlers.ts` implements
`/api/reports/sales-summary` (`:684`) and `/api/reports/product-mix` (`:712`); the latter already
walks `sale.linesJson` and accumulates true per-variant quantity and revenue — precisely the numbers
the page is faking twenty lines of `Math.random()` to approximate. Nothing is missing but the wiring.

**Why this outranks the remaining feature backlog.** A demo that invents its numbers is a demo
problem. This is shipped in the operator-facing Reports page with no "sample data" label anywhere,
and Feature 10 is about to build the margin report — the number that decides whether there is a
second location — *next to it*, and to join against its volumes. A correct margin on a random volume
is a wrong answer with a credible face.

### The gap the endpoints do not cover

`sales-summary` returns four scalars over **all sales, ever**. It has no date window and no time
bucketing, so it cannot answer what the page's hourly/daily/monthly selector asks. That is the one
piece of genuinely new logic here; everything else in this feature is deletion and wiring.

### Tasks

**T1 — One computation, shared by the page and the endpoint** (~15 min)
- Create `shared/reports.ts` with two pure functions over `Sale[]`:
  `salesSeries(sales, { granularity, since, until })` → `{ label, revenueCents, transactions }[]`,
  and `productMix(sales)` → the existing per-variant shape.
- Move the bodies of the two handlers (`api-handlers.ts:685-709`, `:715-746`) into them and have the
  handlers call them. `productMix` is a straight lift — do not rewrite it, and keep its
  `sale.linesJson` guard and its revenue-descending sort.
- Bucket by `sale.createdAt` in **local time**, since "hourly" means the operator's trading day, not
  UTC. Say so in a comment; it is the kind of thing that silently shifts a whole chart by hours.
- Check: `productMix` over a hand-built two-sale fixture returns the expected quantity and revenue,
  and `salesSeries` over sales spanning a day boundary puts each in the right bucket.

**T2 — Point the sales tab at real sales, and delete the generator** (~15 min)
- Replace `generateMockSalesData` (`reports.tsx:38-62`, and the `:113` call) with `salesSeries` over
  the `sales` already destructured at `:105`. Delete the function — leaving it behind means it gets
  used again.
- The KPI totals at `:115-123` then follow from real data with no change to their arithmetic.
  `avgCheck` already guards divide-by-zero; keep that.
- Check: with seeded demo sales the chart totals equal the sum of `sales[].totalCents` for the
  window, and the page renders identical numbers on two consecutive loads. Today it does not — it is
  different dice every render, which is also the fastest way to demonstrate the bug.

**T3 — Point product mix at real lines, and delete the other generator** (~15 min)
- Replace `reports.tsx:125-138` with `productMix(sales)`. It returns per-*variant* rows while the tab
  currently shows per-*product*; aggregate by `productId` in the page rather than adding a second
  function, and keep the existing `showIngredientProducts` filter working against the real rows.
- Drop the `.slice(0, 8)` or make it an explicit "top 8 by revenue" label. Silently truncating a
  report is the same class of dishonesty as inventing it — the operator cannot tell the list ended.
- Check: a product sold twice shows quantity 2 and revenue equal to its two line totals; a product
  never sold does not appear at all rather than appearing with a random quantity.

**T4 — An empty store must look empty** (~15 min)
- A new operator has no sales. The chart must say "No sales yet" rather than drawing a flat line at
  zero, and the KPI cards must show `—` rather than `$0.00` — the whole point of Feature 6 is that
  day one is a real state, and a zeroed report is indistinguishable from a business that sold nothing
  all week.
- Add `shared/reports.test.ts` covering the empty case and the fixture from T1, and assert
  `Math.random` appears nowhere in `reports.tsx`. That last check is one line and it is what stops
  this regressing the next time someone needs a chart to look good in a screenshot.
- Check: `npm test` passes with an empty sales array, and the page with no sales shows the empty
  state rather than zeros.

### Non-goals

Date-range pickers beyond the existing granularity selector, comparison periods ("vs last week"),
export, charting the inventory tab (it is already honest), and the labour/payroll side of the P&L —
`employees.payRate` (`shared/schema.ts:147`) is stored, seeded, and edited but multiplied by nothing
anywhere in the codebase, and `timePunches` are client-only by Feature 7 T4's deliberate decision.
**Labour cost is Feature 14**, which depends on this one for its denominator; with Feature 10's
margins it is what makes prime cost reachable.

### Definition of done

Every number on the Reports page traces to a row in the database. `Math.random()` does not appear in
`client/src/pages/reports.tsx`. Two consecutive loads of the page show the same figures, and a store
with no sales says so instead of reporting zeros.

---

## Feature 12 — Voids and refunds: a till has to be able to take a mistake back

**Status:** planned
**Vision pillar:** #1 — "setup **and operate**". Operating a till means correcting it.
**Added:** 2026-08-09

### The finding

There is no way to void a sale or issue a refund. Searching `server/`, `shared/`, `pos.tsx`, and
`order-receipts.tsx` for refund, void, comp, or cancel returns nothing but TypeScript `Promise<void>`
signatures.

`adminSales.status` (`server/schema.ts:138`) defaults to `"completed"` and is written with that
literal in all three places a sale is created — `client/src/pages/pos.tsx:453`,
`shared/api-handlers.ts:464`, and `server/bom-engine.ts:440`. It is read once, as a filter in
`order-receipts.tsx:142`. **No other status value exists in the codebase.** The field is a constant.

This is not an edge case. A cashier rings the wrong item, a customer sends a dish back, a card is
charged twice — every one of these happens in a restaurant's first week, and today the only recourse
in this system is `deletedAt`, the soft-delete used by the generic CRUD layer.

**Soft-deleting a sale would be the wrong fix**, and it is the fix this codebase makes easy. Sales
are financial records. Removing one from the list silently changes historical revenue: yesterday's
totals, already reported and possibly already filed, quietly become different numbers. Accounting
does not delete; it posts a reversing entry. `deleteSale` does not currently exist, and it should
stay that way.

### The feature

A void or refund **appends a reversing record**; the original sale is never modified or removed.

- **Void** — the original was never really a sale (wrong entry, immediate correction). Full reversal.
- **Refund** — the sale happened and money goes back. Full reversal, but it remains a real
  transaction that occurred, and it must be visible as such.

Both produce a new sale row with negative amounts, `status` of `"void"` or `"refund"`, and a
`reversesSaleId` pointing at the original. Revenue for any period is then simply the sum of
everything — reversals net themselves out, and no report needs to learn about special cases.

### Non-negotiables

- **Never mutate or soft-delete a completed sale.** The original row is immutable after close.
- **Inventory must be returned.** A voided latte puts the milk back. `computeInventoryDeductions`
  (`server/bom-engine.ts:203`) already produces the deduction map — apply it negated. Do not write a
  second traversal; the same rule as Features 10 and 11.
- **Every reversal records who and why.** Voids are the single most common till-theft vector in food
  service, and an unattributed void is indistinguishable from a cashier pocketing cash. Employee
  attribution and a reason are the whole audit value of this feature, not paperwork on top of it.

### Tasks

**T1 — Schema and status vocabulary** (~15 min)
- Add to `adminSales` (and the Dexie schema in `client/src/lib/db.ts`): `reversesSaleId` (text,
  nullable), `voidReason` (text, nullable), `voidedByEmployeeId` (text, nullable).
- Define the status values in one exported constant — `"completed" | "void" | "refund"` — rather
  than as string literals in the three places sales are created. Replace those literals with it.
- Do **not** add a `deleteSale` method anywhere, and add a comment on the sales table saying why:
  reversals are append-only.
- Check: existing sales read back as `"completed"` with null reversal fields, and the type refuses
  an unknown status.

**T2 — The reversal endpoint** (~15 min)
- `POST /api/admin/sales/:id/reverse` taking `{ type: "void" | "refund", reason, employeeId }`, in
  `shared/api-handlers.ts` so both servers expose it.
- Create a new sale row: amounts negated, `linesJson` copied from the original with negated
  quantities, `reversesSaleId` set, status set, reason and employee recorded.
- Return inventory by applying the negated deduction map from `computeInventoryDeductions`.
- **Reject a second reversal of the same sale.** Query for an existing row with
  `reversesSaleId = :id` first and 409 if present. A double-tap on a slow tablet must not refund
  twice — this is the check the whole endpoint lives or dies on.
- Require a non-empty reason. An optional audit field is an empty audit field.
- Check: reversing produces exactly one new row, the original is byte-identical afterwards,
  inventory returns to its pre-sale level, and a second reversal attempt 409s.

**T3 — Do it from the till** (~15 min)
- Add void/refund to the recent-sales view the POS already renders (`order-receipts.tsx` filters
  sales at line 142). Reason and employee are required inputs, not optional prompts.
- Show reversed sales struck through with their reversal linked, rather than hiding them. An
  operator asking "where did that $40 order go" needs to see the answer, and a disappeared sale is
  how a theft looks from the outside.
- Gate behind the existing `pin-protection.tsx` component. Note it currently validates a hardcoded
  `1234` client-side (see Feature 4) — this task should use it as-is and **not** invent a second
  auth mechanism; it gets real when that PIN does.
- Check: voiding from the till shows the reversal immediately and the day's total drops by exactly
  the voided amount.

**T4 — Make every report agree** (~15 min)
- `sales-summary` and `product-mix` (`shared/api-handlers.ts:504, 534`) currently sum all sales.
  With negative reversal rows they net out automatically — **verify that rather than assuming it**,
  particularly `product-mix`, which aggregates quantities and must not count a voided item as sold.
- Feature 10's margin report must exclude reversed sales from volume weighting, or a heavily-voided
  item looks like a strong seller.
- Add `void_sale` to the Feature 2 MCP tool table — but describe it as requiring explicit operator
  confirmation. An agent that can silently reverse transactions is a liability, and this is the one
  tool in the plan that moves money.
- Check: a day with one sale and one void reports zero revenue and zero units sold, not one of each.

### Non-goals

Partial and line-level refunds (this cut reverses whole sales only), payment-processor integration
to actually return funds to a card, cash-drawer reconciliation, tip adjustment, and reopening a
closed sale for editing. **Partial refunds are the obvious next step** and the schema above supports
them — `linesJson` on the reversal is already a subset-capable structure.

### Definition of done

A cashier can void a mis-rung order with a reason attached, the original sale is still in the record,
inventory comes back, and the day's totals are correct without anything having been deleted.

---

## Feature 11 — Purchase units vs stocking units: the bug that makes every cost wrong

**Status:** done — T1–T4 complete. `shared/units.ts` (the one conversion, tested), both copies
of the receive path, the pack-size question in `admin-invoice-intake.tsx` and the inventory
editor, corrected seed data in both copies, and `server/seed-data.test.ts` as the plausibility
check.

Three things differed from the plan as written:

- **Quantity had the same bug as price, and the plan only named price.** With a factor set,
  receiving one gallon added `1` to an on-hand count measured in ounces. `stockUnitsReceived`
  sits beside `costPerStockUnit` and both receive paths call it. Fixing the price alone would
  have left a sibling of this exact bug, newly reachable *because* the factor now exists.
- **T4's plausibility flag went into a test, not a report.** Feature 10 does not exist yet, so
  there is no margin report to flag anything in. `server/seed-data.test.ts` asserts no demo item
  costs more in ingredients than it sells for and that food cost stays under 60%; all three of
  its checks fail against the pre-correction data. **Feature 10 T3 still owes the operator-facing
  version of that flag**, with the link to the item.
- **The factor is written on invoice save, not per keystroke**, via a new
  `updateInventoryItemAsync` on the store. It must land before `createInvoiceWithLineItems`
  runs, because the receive path reads the factor off the item to convert the price it stores —
  the existing fire-and-forget `updateInventoryItem` would have raced it.

Seed prices are written as their derivation (`450 / 128` for milk by the gallon) so the number
and its reasoning cannot drift apart.
**Vision pillar:** #1 — Feature 10 is unusable without this
**Blocks:** Feature 10 (margins computed on today's data are off by orders of magnitude)
**Added:** 2026-08-09

### The finding

Feature 10 named a unit hazard and left it for later. Checking how `lastPurchasePrice` is maintained
showed it is not a hazard — it is a live, structural error, and the demo data demonstrates it.

The good news first: the invoice→cost link works. `createInvoiceWithLineItems`
(`server/storage.ts:910`, mirrored at `client/src/lib/local-storage.ts:444-497`) writes
`lastPurchasePrice: lineItem.unitPriceCents` when an invoice is recorded. Costs do get maintained.

The problem is **what unit that number is in**. `unitPriceCents` is the price per unit *as
purchased* — a case, a gallon, a sack. `inventoryItems.unitOfMeasure` is the unit the item is
*stocked and consumed* in, and `billOfMaterials.quantityDeducted` is expressed in that stocking
unit. Nothing converts between them. The invoice's per-case price is written straight into the field
that costing multiplies by a per-ounce recipe quantity.

The seeded demo data shows exactly what this produces:

| Item | `unitOfMeasure` | `lastPurchasePrice` | What the number really is | Implied |
|---|---|---|---|---|
| Whole Milk | `oz` | `450` | $4.50 per gallon | **$4.50 per ounce** |
| Espresso Beans | `oz` | `1200` | $12.00 per bag | **$12.00 per ounce** |
| Matcha Powder | `tsp` | `2500` | $25.00 per tin | **$25.00 per teaspoon** |
| All-Purpose Flour | `oz` | `300` | $3.00 per bag | **$3.00 per ounce** |

A 12 oz latte would cost `12 × $4.50 = $54` in milk alone. The chocolate chip cookie
(`server/seed-data.ts:230`) deducts 2 oz of flour, costing $6.00 of flour in a $2.75 cookie.

So Feature 10 built on today's data would not be slightly off — it would report that essentially the
entire menu loses money, and it would be *believable enough to act on*. That is worse than no margin
report, and it is why this feature blocks that one.

### The fix, and what not to build

Two fields on the inventory item and one division:

- `purchaseUnit` — free text label, e.g. `"gallon"`, `"case of 24"`. Display only.
- `stockUnitsPerPurchaseUnit` — a number. "One gallon is 128 oz" → `128`.

```
costPerStockUnit = unitPriceCents / stockUnitsPerPurchaseUnit
```

**Do not build a unit-conversion system.** No `convert-units` dependency, no ounce/gram/litre
conversion graph, no unit ontology. The operator knows their own pack sizes; one number they type
once per item beats a library that has to guess whether "oz" means weight or volume — a distinction
that genuinely matters for flour versus milk and that no generic converter can resolve.

```
ponytail: one conversion factor per item, entered by the operator. No unit
algebra, no dimension checking. If suppliers start changing pack sizes often
enough that this drifts, the upgrade is a factor per invoice line, not a
units library.
```

### Tasks

**T1 — Add the fields, defaulting to no-op** (~15 min)
- Add `purchaseUnit: text` (nullable) and `stockUnitsPerPurchaseUnit: doublePrecision NOT NULL
  DEFAULT 1` to `adminInventoryItems` in `server/schema.ts` and to the Dexie schema in
  `client/src/lib/db.ts`. Generate the migration with `drizzle-kit`.
- **A default of `1` makes existing behaviour bit-identical** — dividing by one changes nothing. The
  data stays as wrong as it is today until an operator supplies a real factor, and nothing breaks on
  the way there. Never default this to `0`; a division by zero here would take out costing entirely.
- Check: migration applies to a seeded database, every existing row reads back `1`, and current cost
  arithmetic is unchanged.

**T2 — Store cost per stocking unit** (~15 min)
- In both copies of `createInvoiceWithLineItems` (`server/storage.ts:882`,
  `client/src/lib/local-storage.ts`), write
  `lastPurchasePrice = unitPriceCents / stockUnitsPerPurchaseUnit` instead of the raw unit price.
  These two implementations must stay in step — a divergence here means the server and the tablet
  disagree about what every item costs.
- Guard the divisor: treat null, zero, or negative as `1` and record that the conversion was skipped.
  Silently producing `Infinity` into a money field is the failure mode to design out.
- Add a comment on the `lastPurchasePrice` field in both schemas stating its unit is **cents per
  stocking unit**. The absence of that sentence is the root cause of this entire feature.
- Check: an invoice line for one gallon at $4.50 against an item stocked in `oz` with a factor of
  128 stores `≈3.5` cents per ounce, not `450`.

**T3 — Ask for the factor where the operator already is** (~15 min)
- Surface both fields in the inventory editor and in `admin-invoice-intake.tsx`, phrased as a
  question rather than a schema field: *"You bought 1 gallon. How many oz is that?"* The operator is
  looking at the physical case when recording the invoice — that is the moment they can answer.
- Show the derived per-stocking-unit cost immediately after entry so an implausible number is
  visible while it is still cheap to fix.
- Do not block invoice recording on it. An operator entering invoices at 11pm must be able to finish;
  an unset factor means the cost stays unconverted and the item is flagged, exactly like Feature 10's
  unknown-cost rows.
- Check: entering a factor updates the displayed per-unit cost live, and leaving it blank still
  records the invoice.

**T4 — Fix the demo data, and flag implausible costs** (~15 min)
- Correct `server/seed-data.ts` and `client/src/lib/seed-data.ts` (the two copies) so the demo
  catalogue carries honest per-stocking-unit costs and realistic factors. The demo data currently
  encodes the bug, so anyone building Feature 10 against it would conclude their maths was broken.
- Add a plausibility flag to Feature 10's margin report: an item whose ingredient cost exceeds its
  selling price is either genuinely underpriced or has a bad conversion factor. Say both, and link to
  the item. This is a signal, not a hard error — some loss-leaders are real.
- Check: after correction, the demo latte's milk cost is cents rather than dollars, and the seeded
  menu reports plausible margins end to end.

### Non-goals

Yield and waste factors (Feature 10 already defers these), per-invoice pack sizes, unit conversion
between measurement systems, and any automatic inference of pack size from supplier descriptions.

### Definition of done

`lastPurchasePrice` means cents per stocking unit everywhere, it is documented as such in both
schemas, and the demo menu produces margins a restaurant operator would recognise as real.

---

## Feature 10 — Menu margins: the number that decides whether there is a second location

**Status:** T1 done — `shared/pricing.ts` has `costVariant`, `sumIngredientCosts` and `marginPct`, all
built on Feature 15 T1's `shared/depletion.ts` rather than a second BOM walk. An unpriced ingredient
is named, never treated as free, and `marginPct` returns null rather than stating a margin on an
unknown cost. `product-wizard.tsx`'s `renderProfitability` now uses the same functions instead of its
own arithmetic, so there is one costing implementation. Tests in `shared/pricing.test.ts`.
T2 done — `GET /api/reports/menu-margins` in `shared/api-handlers.ts` (so both servers expose it; the
Express server serves it because sales have lived there since Feature 7 T2), one row per variant with
`priceCents`, `costCents`, `marginCents`, `marginPct`, `costKnown` and the unknown ingredient names,
worst margin first, unknown-cost rows last, ties broken by volume. `?since=`/`?until=` narrows the
volumes through the same `productMix` the mix report uses, and carries `quantity` plus
`contributionCents` — a variant that sold nothing still gets a row, because it is still priced wrong.
T3 done — a **Margins** tab on the reports page, computed from the same `menuMargins` the endpoint
uses over the page's window, worst first, with unknown-cost rows flagged and their unpriced
ingredients linked to `/inventory?item=<id>` (which now opens that item).
T4 partially done — **blocked on Feature 2**, which has not been built: there is no `shared/mcp.ts` tool
table to register `menu_margins` in and no `docs/agent-setup.md` to document it in. What did not need
Feature 2 has landed: the endpoint is documented in `docs/api-reference.md` with the honesty rules an
agent has to respect, the read-propose-preview-apply loop written out, and the task's check covered as
an API test — a price change is reflected by the next `menu-margins` call with nothing else in between.
The MCP registration is recorded as a bullet on Feature 2 T1 so it is not lost.

**Fixed while doing T3, worth calling out:** a variant with *no* recipe rows costed as 0 and therefore
showed a **100% margin** — the exact lie the honesty requirement above is about, and the common case,
because the seed attaches BOM rows to each product's small variant only (see the finding under Feature
15). `Cost` now carries `hasRecipe`, so no-recipe rows read as unknown and cannot lead the report.

**Found while doing T2:** `server/routes.ts:708-720` still returns 501 for `sales-summary` and
`product-mix` saying "sales data is stored client-side" — untrue since Feature 7 T2, and now
inconsistent with `menu-margins`, which serves the same sales rows from the same server. One-line fix
each, in whichever feature owns it next.
**Vision pillar:** #1 — the guiding star itself, "boost their business into getting a second location"
**Depends on:** ~~Feature 5 T1~~ — **satisfied**: Feature 15 T1 moved `computeInventoryDeductions`
into `shared/depletion.ts`, which is the extraction this needed. Feature 5 T1 can still take the
pricing/discount region of `bom-engine.ts` into this same file.
**Added:** 2026-08-09

### The finding

Features 1–9 are foundation, plumbing, and bug fixes. Necessary, but none of them help a business
*grow*, which is what VISION.md actually asks for. This is the gap.

**Nothing in the codebase computes cost, margin, or profit.** A grep for those words across
`server/`, `shared/`, and the reports page returns only CSS `margin` properties.

> **Correction (Feature 11).** True for `server/` and `shared/`, but not for the client:
> `renderProfitability()` at `client/src/components/product-wizard.tsx:1601` already computes
> `quantity × lastPurchasePrice` per BOM line and renders a margin percentage. T1 below must reuse
> or replace it rather than become a second implementation — and it is currently wrong by the unit
> bug Feature 11 fixes. **Land Feature 11 first.** The three report
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
- **Land Feature 13 first.** Two of the three tabs this table would sit beside are `Math.random()`
  today, and T2's product-mix join reads volumes that the page fabricates.
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

### The unit hazard — now Feature 11, and it blocks this feature

`lastPurchasePrice` currently holds the price per *purchased* unit while `quantityDeducted` is in
*stocking* units, with no conversion. Margins computed on today's data are wrong by orders of
magnitude — see Feature 11, which must land first. T1 should still surface the item's
`unitOfMeasure` in its output so any residual mismatch stays visible.

### Definition of done

An operator opens Reports and sees, worst first, which menu items make money and which do not — with
anything the system cannot cost honestly labelled as unknown rather than flattered.

---

## Feature 9 — A backup that contains everything, and a restore that cannot wipe you

**Status:** done — T1–T4 complete. `shared/backup.ts` (pure restore planning, tested),
`client/src/lib/backup.ts` (snapshot + auto-backup timer), rewritten backup/restore in
`client/src/pages/settings.tsx`.

One deviation from T1 as written: rather than a hand-written `BACKUP_TABLES` array plus an assertion
that it covers the schema, the list is **derived** — `db.tables.map(t => t.name)`. The bug being
fixed was three hand-maintained copies of one list drifting apart; a fourth copy with a test guarding
it is still a copy. A derived list cannot drift, so a table added to the schema is backed up with no
further action and there is nothing for an assertion to catch. Verified that Dexie populates
`db.tables` before `open()` and accumulates it across `version()` calls, which is what makes this
safe at module scope.
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

~~Feature 8's non-goals state that no restore path is exercised anywhere.~~ **Resolved** — Feature 8's
non-goals now read "Backup and restore are handled by Feature 9", which is correct. Restore does
exist in `settings.tsx` and does write snapshots back into Dexie; the real problems were the three
above, not the absence of a restore.

### Non-goals

Server-side backup scheduling, multiple retained backup versions (`getLatestBackup` returns only the
most recent, so there is exactly one restore point per client — worth revisiting, but a schema and
retention question), point-in-time recovery, and export to a file the operator holds themselves.

### Definition of done

A backup contains every table the app stores, restoring one cannot delete data it is not replacing,
restore asks first, and a store that has not been backed up in weeks says so.

---

## Feature 8 — Sync that converges, and a conflict policy that is written down

**Status:** T1 done — the string comparison is replaced by `sameSyncedFields` / `sameDeletedState`
(`shared/sync-compare.ts`): an explicit per-table field list, with `undefined` and `null` treated as
equal and nested objects compared by value rather than by key order. Server-only columns are outside
the list, so `createdAt` — and `locationId` when Feature 3 lands — can never register as a difference.
T2 done — `resolveConflict(tableName, pos, admin)` and `resolveByRecency` in `shared/sync-compare.ts`
carry the policy by name, each returning a winner **and a reason**. Admin wins for the admin-owned
tables even against a newer device edit (stated, with the why: the back office authors the menu,
devices consume it); tables with no admin counterpart are last-write-wins on `updatedAt`, ties to the
incoming record, as the old `>=` already did. `ADMIN_OWNED_TABLES` is now one list shared by the server
and `client/src/lib/sync.ts`, which had its own copy. The `updatedAt` fallback is fixed: a record with
no timestamp reads as `0` — the oldest thing in the system — rather than `Date.now()`, which made it
win every comparison it entered.
T3 done — `server/sync-convergence.test.ts` runs the real thing against a real Postgres: two syncs with
nothing changed in between, and the second pushes and pulls **nothing**. Then one field changes and
exactly one record moves (with the admin value winning), the next round is quiet again, and a
soft-delete on both sides at different timestamps is agreement rather than a conflict. It skips loudly
without a `DATABASE_URL` instead of passing quietly, and `initDb` moved to `server/init-db.ts` so a test
can create the schema without starting a listener. Verified load-bearing by restoring the old
`JSON.stringify` comparison, which makes it fail.

**Fixed while running it — a boot-breaking bug shipped in Feature 16 T2:** `initDb` ran
`ALTER TABLE admin_sales ADD COLUMN …` *before* `CREATE TABLE IF NOT EXISTS admin_sales`, so on a
**fresh** database `initDb()` threw `relation "admin_sales" does not exist` and the server never
finished booting. Nothing in the suite could have caught it; the first actual `initDb()` run did.
T4 done as the investigation it was framed as — **finding written, fix deferred to Feature 26.**
`server/sales-writers.test.ts` pins today's behaviour against a real database: a POS sale synced under
the `sales` group is stored as a `syncRecords` blob and **never reaches `admin_sales`**, which is the
only table `adminStorage.listSales()` reads — so it is invisible to `sales-summary`, `product-mix` and
the `menu-margins` endpoint. Arriving by both paths leaves one `admin_sales` row and one orphaned blob
with no link in either direction. Routing that through one owner touches the code path carrying the
business's revenue records, which is more than a 15-minute change, so per this task's own instruction
the deliverable is the finding plus **Feature 26** below rather than a rushed fix.

**Feature 8 is complete** (T1–T4).

**Confirmation, and one correction to the analysis above.** A live sync could not be run here (no
Postgres in this environment), so the failure is reproduced deterministically in
`shared/sync-compare.test.ts` instead of by temporary logging: the first test builds the same product
as each side builds it and asserts the old `JSON.stringify` comparison says they differ while the new
one says they agree.

Reading the code, the **field-set** half of the prediction is only partly right: the client `Product`
and `Variant` interfaces do carry `createdAt`, so those field sets match. Where it does hold is
`inventoryItems` — `purchaseUnit` and `unitsPerPurchase` are optional client-side and NOT NULL
server-side, so a pre-v10 row genuinely has no such keys. The **general** mechanism is key order, and
it is worse than "the two sides were built by different machinery": `syncRecords.data` is `jsonb`, which
does not preserve key order, and `client/src/lib/sync.ts:136` writes a server record into Dexie with
`table.put(change.data)` — the server's order — then pushes it back verbatim. So a record that has been
through the server once compares unequal to its own admin row from then on.
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

**Status:** done — T1–T4 complete. Sales persist on the Express server and survive a restart;
store settings are reachable from both servers; employees and time punches answer 501 rather than
faking success. Four things differed from the plan as written, all verified against a live Postgres:

- **`admin_sales` was never created.** It is defined in `server/schema.ts` but absent from the boot
  DDL in `server/index.ts`, so T2's delegation would have failed on any fresh database. Added.
- **T3's premise was wrong.** `storeSettings` was not unreachable — `server/routes.ts` already had
  `GET /api/settings`, `GET /api/settings/:key` and `PUT /api/settings/:key`. The real gap was that
  they were Express-only. Those handlers moved into `shared/api-handlers.ts` (backed by a Dexie
  table, schema v9) rather than adding a second `/api/admin/settings` alongside them.
- **The settings key regex allows mixed case**, `/^[A-Za-z0-9._-]{1,64}$/`. The plan's lowercase-only
  version would have rejected `hoursOfOperation` and `emailConfig`, both already in use by
  `client/src/pages/settings.tsx`.
- **Employees took the 501**, the outcome this feature's T4 names as legitimate. Recorded in
  `server/routes.ts` next to the adapter.

Verified end to end by `scripts/check-sales-persistence.sh` (post a sale, restart the server,
confirm it survived).
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
- Kill the hardcoded `taxRate = 0.08`. Read the rate from the `tax.ratePct` store setting via the
  `getSetting` method Feature 7 T3 added to `ApiAdminStorage` (the HTTP path is `/api/settings/:key`,
  not `/api/admin/settings/:key`), defaulting to `0` — the
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

(`adminSales` needs the column like the rest. **Updated by Feature 7 T2:** sales now actually persist
through the Express adapter, so scoping this table is no longer theoretical — unscoped, every
location reads and writes one another's sales. Note also that its `CREATE TABLE` lives in the boot
DDL in `server/index.ts`, not in a migration, so T1's column has to be added in both places.)

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
| `menu_margins` | `GET /api/reports/menu-margins` (**shipped**, Feature 10 T2) | both |
| `get_settings` / `set_setting` | `GET`/`PUT /api/settings/:key` (Feature 7 T3) | both |

**`menu_margins` is Feature 10 T4's outstanding half** — the endpoint and its documentation exist
(`docs/api-reference.md` > Reports), so this is a table entry plus a description. Describe it as the
read an agent must do **before** proposing any price change or discount: an agent that applies 20% off
an item running a 15% margin is a liability, and rows with `costKnown: false` are a data-entry task,
not a pricing finding. It is available on **both** servers, unlike the two report tools above it,
because costing reads the menu and recipes the Express server owns.

**Updated by Feature 7 T2.** The reason `sales_summary` and `product_mix` are local-only was "the
Express adapter's `listSales()` returns `[]`". That is no longer true — sales persist on the Express
server now. The two report *routes* are still Express-side 501s (`server/routes.ts`), so the
capability split above still holds, but T3's capability probing must decide it from the report routes
rather than from `listSales()`, which no longer distinguishes the two adapters.

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

**Status:** done — T1–T4 complete. `shared/menu-blueprint.ts`, `POST /api/admin/menu/apply` on
both servers, documented in `docs/api-reference.md`. Caveat: applying is not transactional (see
the Errors note in that doc) — a mid-flight failure leaves the menu partly updated, recoverable by
re-applying the same blueprint.
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
