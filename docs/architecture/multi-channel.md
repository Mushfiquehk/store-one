# Multi-channel architecture: the POS, the console, and the storefronts

**Status:** proposed
**Added:** 2026-09-13
**Implemented by:** PLAN.md Features 27–35

Store-One today is one deployable pretending to be two. This document describes the
shape it needs so that a till, a central console and *any number* of storefronts can
be shipped, versioned and scaled apart from each other while still agreeing about what
a product costs.

It is an architecture document, not a feature. The features that build it are in
PLAN.md; the numbers in brackets below point at them.

---

## What is actually true today

Five findings shape everything here. Each was read out of the code, not assumed.

**1. The server cannot answer the two questions a storefront asks.**
`/api/orders/simulate` and `/api/reports/sales-summary` are `501` stubs
(`server/routes.ts:701-713`) whose message says sales live "client-side in IndexedDB,
not in the server PostgreSQL database". A storefront cannot price a cart against a
server that says that.

The engine is not missing, though — only the wiring is. `server/bom-engine.ts` already
carries `validateLineItems` and `processTestOrder`, and `/api/admin/test-orders` drives
them against Postgres. Pricing a cart server-side is a route pointed at an engine that
exists, which is why the storefront work does not have to wait for a rewrite.

**2. `shared/` is already the seam, and it is a good one.**
`shared/api-handlers.ts` defines `ApiAdminStorage` and `createApiHandlers(store)`, a
transport-agnostic handler layer implemented **twice** — by Postgres on the server and
by Dexie in the till (`client/src/lib/dexie-admin-storage.ts`). The same pricing, tax,
depletion and report code runs on both sides. The split into workspaces is mostly
recognising a boundary that already holds, rather than inventing one [F27].

**3. Nothing records where an order came from.**
A `Sale` (`shared/schema.ts`) knows its tax rate, its tender, and since Feature 19 who
rang it — but not *how* it arrived. There has only ever been one way, so the column was
never needed. The moment a storefront exists there are two, and a report that cannot
separate them is a report nobody can act on [F28].

**4. The catalogue has no customer-facing surface.**
No slug, no description, no image, no notion of a product being *published*. `Product`
carries `name`, `category`, `sortOrder`, `attributes.tags` — everything a till button
needs and nothing a web page needs. There is also no image support anywhere in the
repo: `grep imageUrl` over `server/schema.ts` and `shared/schema.ts` returns nothing
[F31, F32].

**5. Every product is on sale, always.**
There is no gate between "this row exists" and "a customer may buy this" beyond soft
deletion — PLAN Feature 24 says so at length. A storefront that inherits that rule sells
prep-only items, employee meals and open keys to the public [F31].

---

## The shape

```
                        ┌──────────────────────────────┐
                        │      packages/domain         │
                        │  pricing · tax · depletion   │
                        │  api-handlers · reports      │
                        │  (pure TS, no I/O)           │
                        └──────────────┬───────────────┘
                    imported by everything below
                                       │
     ┌─────────────────┬───────────────┼──────────────┬─────────────────┐
     │                 │               │              │                 │
┌────▼──────┐   ┌──────▼─────┐  ┌──────▼──────┐ ┌─────▼──────┐  ┌───────▼──────┐
│ apps/core │   │  apps/pos  │  │ apps/admin  │ │apps/store- │  │ apps/store-  │
│           │   │            │  │             │ │  front     │  │  front-two   │
│ Express + │◀──│ till, off- │  │  console    │ │  channel:  │  │  channel:    │
│ Postgres  │   │ line-first │  │             │ │  "web"     │  │  "catering"  │
│ HTTP API  │   │ (Dexie)    │  │             │ │            │  │              │
└───────────┘   └────────────┘  └─────────────┘ └─────┬──────┘  └──────┬───────┘
      ▲                                               │                │
      └───────────── HTTP + channel token ────────────┴────────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │      packages/design         │
                        │  brand tokens + primitives   │
                        │  (the Butterloom system)     │
                        └──────────────────────────────┘
```

Four deployables, two libraries, one npm workspace root [F27].

| Path | What it is | Deployable |
|---|---|---|
| `packages/domain` | Today's `shared/`. Pure logic, no I/O. The contract. | no — library |
| `packages/design` | The Butterloom design system: brand token contract, stylesheet, React primitives. | no — library |
| `apps/core` | Today's `server/`. Express + Drizzle + Postgres. The only thing that touches the database. | yes |
| `apps/pos` | Today's `client/`. The offline-first till. Unchanged in behaviour. | yes |
| `apps/admin` | The central console. Absorbs the catalogue, merchandising, brand and order administration. | yes |
| `apps/storefront` | A customer-facing storefront. **One per channel.** | yes, n times |

`packages/domain` is the load-bearing rule: **an app may not import another app.** If the
storefront needs something the till also needs, it moves into `domain`. That is the whole
mechanism by which these stay independently deployable, and it is enforced by the
workspace graph rather than by anybody remembering.

---

## The Channel

A **Channel** is a named route by which orders reach the business. The till is one. Each
storefront deployment is one. It is the primitive that makes "add another storefront" a
configuration change rather than a fork [F28].

```
channels
  key          'pos' | 'web' | 'catering' | …   (slug, immutable, the identity)
  name         what the operator calls it
  kind         'pos' | 'storefront'
  locationId   which store's menu and stock it draws on
  brandId      which brand identity it wears        → F30
  active       whether it may take orders
```

Three things hang off it:

**Authentication.** A channel token authenticates a storefront to the core. This is PLAN
Feature 4 (location API tokens) with the scope widened by one column — build them
together, and do not build the location-only version first.

**Attribution.** `admin_sales` gains `channelKey`. Unlike `employeeId` and `taxRatePct`,
which are deliberately left null on old rows because guessing them would be dishonest,
this one **is** backfilled to `'pos'`. It is not a guess: before channels existed there
was exactly one way for a sale to come into being, and the code that made it is the only
writer. An honest gap is for facts nobody recorded, not for facts the schema made
inevitable.

**Scope.** A channel sells a subset of the menu, wearing a brand, under its own domain.
Products are published to channels explicitly [F31], which is also the answer to finding
5: the till keeps selling everything, and the public sees only what was published to it.

---

## Brand identity is data, not a stylesheet

The Butterloom design system is built on CSS custom properties — `--paper`, `--ink`,
`--secondary`, `--tertiary`, `--hairline`, `--dot`, `--shot` — with a dark-mode block that
redefines exactly those tokens and nothing else. Every rule in its 400-line sheet reads
through them. That is not a coincidence worth admiring; it is a seam worth using.

So a **Brand** is a row, edited in the console, that fills in that token contract [F30]:

```
brands
  key, name, wordmark, tagline
  light   { paper, gridline, ink, secondary, tertiary, hairline, dot, shot }
  dark    { …the same eight… }
  type    { serif stack, label stack, base size }
  sealImageId  → the image pipeline [F32]
```

`packages/design` ships the stylesheet with a default palette, and each storefront asks
`GET /api/public/brand?channel=<key>` at boot and writes the returned tokens onto
`:root`. A second storefront in a different livery is a row and a deployment — no fork
of the sheet, no second copy of a rule.

Two constraints the console enforces, both lifted from comments in the Butterloom sheet
that read like scar tissue:

- **Contrast is validated, not trusted.** Butterloom's own `--tertiary` carries a comment
  explaining it is *not* the logo's `#83827b`, because that colour is 3.33:1 on paper and
  fails the 4.5:1 floor. An operator picking colours in an admin panel will walk into
  exactly that. The editor computes the ratio and refuses to save a palette that fails.
- **Both themes or neither.** A token defined only in the light block renders a dark-mode
  page that borrows half its palette from the wrong one. The editor edits the pair.

**The cost of the React SPA choice, stated plainly.** A storefront that renders in the
browser cannot be edge-cached as HTML, and brand tokens fetched at boot mean the first
paint uses the default palette before swapping to the operator's. Butterloom solved both
by server-rendering and inlining the sheet. Here the mitigations are: ship the token
defaults inline in the bundle's CSS so the swap is a change of palette rather than a flash
of unstyled text, and keep the catalogue read endpoints cacheable so the data arrives
fast even though the shell must boot first. If search ranking on the menu ever matters
commercially, prerendering the catalogue routes is the escape hatch, and nothing in this
architecture blocks it.

---

## How an online order becomes money

The rule that makes this safe: **the storefront never computes a price.** It renders what
the core tells it and sends back ids and quantities. Modifier upcharges, combo
allocation, discounts, inclusive-vs-exclusive tax and rounding all live in `domain` and
run in `apps/core`. A storefront that does its own arithmetic is a storefront that
charges a different number than the till, and finding out which one was right happens at
the end of the quarter.

```
  customer                storefront               apps/core                    till
     │                        │                        │                         │
     │── add to cart ────────▶│ (cart is client-side)  │                         │
     │                        │── POST /orders/simulate ▶ prices it, returns      │
     │◀── totals ─────────────│◀─────────────────────── lines + tax + total      │
     │                        │                        │                         │
     │── place order ────────▶│── POST /channel/orders ▶ admin_sales             │
     │                        │   (channel token)      │   channel='web'          │
     │                        │                        │   fulfilment='placed'    │
     │◀── order page ─────────│                        │        │                │
     │                        │                        │        ├─ BOM depletion  │
     │                        │                        │        ├─ reports        │
     │                        │                        │        └─ sync ─────────▶│ accepts,
     │                        │                        │                          │ prepares
```

The cart is client-side and priced by the server on every change. Butterloom keeps carts
in `sessions` + `cart_items` tables because its pages are server-rendered and cached; an
SPA with a server pricing endpoint needs neither table. The trade-off is real and worth
naming: **a cart does not follow a customer to another device.** For a restaurant
ordering lunch that is the right trade; for a fashion catalogue it would not be.

An online order lands as a `Sale` with `channelKey`, so depletion, margins, the day's
reports and the close-of-day drawer all see it with no new code. What it additionally
needs — `fulfilmentState`, `fulfilmentType` (pickup or delivery), customer phone, an
`order_events` audit trail — is the part of Butterloom's order model worth absorbing
wholesale [F34].

**Payment is deliberately out of scope for v1.** An online order is placed unpaid and
settled at the till when the customer collects it. Taking card payments online needs a
gateway, and PLAN Feature 16 owns that ground. Shipping the ordering path first is what
makes the payment work testable when it arrives.

**The `status` collision must be resolved before F34.** `Sale.status` and `Sale.closedAt`
already carry lifecycle meaning, and PLAN Features 12 and 23 both flag a collision on
them. Adding a third writer without settling it is how a sale ends up in two states at
once.

---

## Why not the alternatives

**Why not a separate `orders` table, promoted to a Sale on acceptance?**
It is the cleaner lifecycle and it is what Butterloom does. It was not chosen because it
puts every report, every margin calculation and the drawer's cash expectation behind a
promotion step that can fail, and because Feature 26 has just finished establishing that
*sales having two writers and no owner* is a bug worth a whole feature to fix. Adding a
second order model the week that landed would be arguing with the codebase.

**Why not let the storefront read Postgres directly?**
It is less code today and it forfeits the entire point. Independent deployment means the
storefront can be redeployed, rolled back, or scaled without touching the core, and that
is only true while the database has exactly one writer.

**Why not keep the current directory layout and add two folders?**
Nothing would move, and nothing would stop `apps/storefront` importing from
`client/src/lib` six months from now. The workspace graph is the enforcement.

---

## Build order

Each phase leaves the tree deployable. Phase 0 is a pure restructure — if `npm test` and
`npm run check` do not pass unchanged at the end of it, stop and fix it there, because
every phase after builds on the assumption that the move changed no behaviour.

| Phase | Feature | Ships |
|---|---|---|
| 0 | F27 Workspaces | Nothing new. Same POS, four build targets. |
| 1 | F28 Channels | Channel registry, scoped tokens, `channelKey` on sales. |
| 2 | F29 Design package | The Butterloom system as a library, with a styleguide route. |
| 3 | F30 Brand identity | Operator-editable brand, contrast-validated, served over HTTP. |
| 4 | F31 Merchandising | Slugs, descriptions, and what each channel publishes. |
| 5 | F32 Photographs | The image pipeline the menu has never had. |
| 6 | F33 Storefront: browse | A menu a customer can read, in the operator's brand. |
| 7 | F34 Checkout | An online order that reaches the till. |
| 8 | F35 Second storefront | The seam proven by standing up channel two from config. |

F29 and F30 depend on nothing but F27, so they can run beside F28 and F31. F32 blocks the
good version of F33 but not the first one — a storefront with no photographs is a real
storefront, and the plan is ordered so it can ship before the encoder does.
