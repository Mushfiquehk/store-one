import { db } from "./db";
import { adminSales, syncRecords } from "./schema";
import { eq, inArray } from "drizzle-orm";
import { adminStorage } from "./storage";
import { SALES_TABLE } from "../shared/sync-compare";

/**
 * Promote sales that only ever existed as sync blobs into `admin_sales` rows.
 *
 * Feature 26 T2 fixed new syncs. This is the history: every install that has been running
 * has real sales sitting in `syncRecords` and nowhere else, which means its revenue reports
 * have been understated by exactly those sales. Runs on boot, idempotent — a sale that
 * already has a row is left alone, so restarting the server does not change any number.
 *
 * ponytail: a one-pass promotion on startup, not a migration framework. It is cheap because
 * it only looks at rows whose id is missing from admin_sales, and it will find nothing at all
 * on the second boot.
 */
export async function backfillSyncedSales(): Promise<{ promoted: number; alreadyPresent: number }> {
  const blobs = await db.select().from(syncRecords).where(eq(syncRecords.tableName, SALES_TABLE));
  if (blobs.length === 0) return { promoted: 0, alreadyPresent: 0 };

  const ids = [...new Set(blobs.map(b => b.recordId))];
  const existing = await db.select({ id: adminSales.id }).from(adminSales).where(inArray(adminSales.id, ids));
  const have = new Set(existing.map(r => r.id));

  let promoted = 0;
  // Newest blob per id wins, so a sale that synced more than once promotes its latest state.
  const newestById = new Map<string, typeof blobs[number]>();
  for (const blob of blobs) {
    const seen = newestById.get(blob.recordId);
    if (!seen || blob.updatedAt > seen.updatedAt) newestById.set(blob.recordId, blob);
  }

  for (const [recordId, blob] of newestById) {
    if (have.has(recordId)) continue;
    const data = blob.data as Record<string, unknown>;
    await adminStorage.createSale({ ...data, id: recordId });
    if (blob.deletedAt != null) {
      // A sale that was voided on the device must not be promoted as a live one.
      await db.update(adminSales)
        .set({ deletedAt: blob.deletedAt, updatedAt: blob.updatedAt })
        .where(eq(adminSales.id, recordId));
    }
    promoted++;
  }

  return { promoted, alreadyPresent: newestById.size - promoted };
}
