// The sales computations, in one place, so the Reports page and the API endpoints cannot
// disagree about what a number means. Pure over rows — no store, no fetch, no clock beyond
// the window the caller passes in.

export type ReportSaleLine = {
  variantId?: string;
  productId?: string;
  productName?: string;
  variantName?: string;
  qty?: number;
  unitPrice?: number;
};

export type ReportSale = {
  createdAt?: number;
  totalCents?: number;
  taxCents?: number;
  // Dexie stores this as an array; a row that came off the wire may still be a JSON string.
  linesJson?: ReportSaleLine[] | string;
  /**
   * A sale rung by `/api/orders/simulate` to check a recipe, not by a customer. Visible as a
   * sale, excluded from every report in this file — a test order counted as revenue is the
   * same class of lie as an unpriced ingredient counted as free.
   */
  isTestOrder?: boolean | null;
  /** What this sale was charged at. Reports read the stamped tax, never a current rate. */
  taxRatePct?: number | null;
  taxInclusive?: boolean | null;
};

/** Real trade only. Every report here starts from this, so none of them can forget. */
export function realSales(sales: ReportSale[]): ReportSale[] {
  return sales.filter(sale => !sale.isTestOrder);
}

export type Granularity = "hourly" | "daily" | "monthly";

export type SalesWindow = {
  granularity: Granularity;
  since?: number;
  until?: number;
  /**
   * Emit every bucket across the window, including the ones with no sales.
   *
   * Off by default because a bare list of buckets should not invent rows. On for a chart:
   * an x-axis is a continuous range, so dropping a closed Monday draws Sunday next to
   * Tuesday and the line reads as uninterrupted trading. Needs `since`.
   */
  fill?: boolean;
};

export type SalesBucket = {
  label: string;
  /** Sort key — the bucket's start, so callers never re-parse the label. */
  startedAt: number;
  revenueCents: number;
  transactions: number;
};

export type ProductMixRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  quantity: number;
  revenueCents: number;
};

function lines(sale: ReportSale): ReportSaleLine[] {
  const raw = sale.linesJson;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Buckets are LOCAL time on purpose: "hourly" means the operator's trading day, not UTC.
// A shop closing at 11pm local would otherwise see its evening land on tomorrow's date,
// and the whole chart shifts by the timezone offset without anything looking wrong.
function bucketStart(at: number, granularity: Granularity): number {
  const d = new Date(at);
  if (granularity === "hourly") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
  if (granularity === "daily") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(start: number, granularity: Granularity): string {
  const d = new Date(start);
  if (granularity === "hourly") return `${String(d.getHours()).padStart(2, "0")}:00`;
  if (granularity === "daily") return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Revenue and transaction count per time bucket, oldest first.
 *
 * Buckets with no sales are omitted rather than emitted as zero: a gap in trading is not
 * the same claim as "we took $0.00 that hour", and only the caller knows which it wants
 * to draw.
 */
export function salesSeries(allSales: ReportSale[], window: SalesWindow): SalesBucket[] {
  const sales = realSales(allSales);
  const { granularity, since, until, fill } = window;
  const buckets = new Map<number, SalesBucket>();

  const emptyBucket = (start: number): SalesBucket =>
    ({ label: bucketLabel(start, granularity), startedAt: start, revenueCents: 0, transactions: 0 });

  if (fill && since != null) {
    // Step by calendar unit rather than by a fixed number of milliseconds: a day is not
    // always 86400000 ms across a daylight-saving boundary, and months are never equal.
    const end = until ?? Date.now();
    let cursor = new Date(bucketStart(since, granularity));
    while (cursor.getTime() <= end) {
      buckets.set(cursor.getTime(), emptyBucket(cursor.getTime()));
      if (granularity === "hourly") cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), cursor.getHours() + 1);
      else if (granularity === "daily") cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  for (const sale of sales) {
    const at = sale.createdAt;
    if (typeof at !== "number") continue;
    if (since != null && at < since) continue;
    if (until != null && at > until) continue;

    const start = bucketStart(at, granularity);
    let bucket = buckets.get(start);
    if (!bucket) {
      bucket = emptyBucket(start);
      buckets.set(start, bucket);
    }
    bucket.revenueCents += sale.totalCents || 0;
    bucket.transactions += 1;
  }

  // Array.from, not spread: the project's tsc target predates iterating a Map directly.
  return Array.from(buckets.values()).sort((a, b) => a.startedAt - b.startedAt);
}

/** The four scalars the sales-summary endpoint has always returned, over a window. */
export function salesSummary(allSales: ReportSale[], window: { since?: number; until?: number } = {}) {
  const inWindow = realSales(allSales).filter(s => {
    const at = s.createdAt;
    if (typeof at !== "number") return false;
    if (window.since != null && at < window.since) return false;
    if (window.until != null && at > window.until) return false;
    return true;
  });

  let totalRevenueCents = 0;
  let totalTaxCents = 0;
  for (const sale of inWindow) {
    totalRevenueCents += sale.totalCents || 0;
    totalTaxCents += sale.taxCents || 0;
  }
  const totalSales = inWindow.length;

  return {
    totalSales,
    totalRevenueCents,
    totalTaxCents,
    averageOrderCents: totalSales > 0 ? Math.round(totalRevenueCents / totalSales) : 0,
  };
}

/**
 * Per-variant units and revenue, revenue-descending. Lifted from the product-mix handler,
 * including its guard against a sale with no lines.
 */
export function productMix(allSales: ReportSale[], window: { since?: number; until?: number } = {}): ProductMixRow[] {
  const mix: Record<string, ProductMixRow> = {};

  for (const sale of realSales(allSales)) {
    const at = sale.createdAt;
    if (window.since != null && (typeof at !== "number" || at < window.since)) continue;
    if (window.until != null && (typeof at !== "number" || at > window.until)) continue;

    for (const line of lines(sale)) {
      const key = line.variantId || "unknown";
      if (!mix[key]) {
        mix[key] = {
          variantId: key,
          productId: line.productId || "",
          productName: line.productName || "",
          variantName: line.variantName || "",
          quantity: 0,
          revenueCents: 0,
        };
      }
      mix[key].quantity += line.qty || 0;
      mix[key].revenueCents += (line.unitPrice || 0) * (line.qty || 0);
    }
  }

  return Object.values(mix).sort((a, b) => b.revenueCents - a.revenueCents);
}
