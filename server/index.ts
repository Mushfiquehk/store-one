import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes";
import { db } from "./db";
import { initDb } from "./init-db";
import { sql } from "drizzle-orm";
import { adminProducts } from "./schema";
import { getDemoAdminData, getDemoSeedRecords, DEMO_PREFIX_VALUE } from "./seed-data";
import { storage, adminStorage } from "./storage";
import { syncRecords } from "./schema";
import { eq, and } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use(router);

const isDev = process.env.NODE_ENV !== "production";

if (!isDev) {
  const publicDir = path.resolve(__dirname, "../dist/public");
  app.use(express.static(publicDir));
  // ponytail: regex, not "*" — Express 5 rejects bare wildcard strings
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "5000", 10);
const serverPort = isDev ? 3001 : port;


async function autoSeedIfEmpty() {
  const existing = await db.select({ id: adminProducts.id }).from(adminProducts).limit(1);
  if (existing.length > 0) return;

  console.log("No admin data found — auto-seeding demo data…");

  const clientCode = "demo-client";
  const client = await storage.getOrCreateClient(clientCode, "Demo Client");
  const seedRecordsList = getDemoSeedRecords();

  await db.transaction(async (tx) => {
    for (const record of seedRecordsList) {
      const exists = await tx
        .select()
        .from(syncRecords)
        .where(
          and(
            eq(syncRecords.clientId, client.id),
            eq(syncRecords.tableName, record.tableName),
            eq(syncRecords.recordId, record.recordId),
          )
        )
        .limit(1);

      if (exists.length === 0) {
        await tx.insert(syncRecords).values({
          clientId: client.id,
          tableName: record.tableName,
          recordId: record.recordId,
          data: record.data,
          updatedAt: record.updatedAt,
          deletedAt: record.deletedAt,
        });
      }
    }
  });

  const adminData = getDemoAdminData();
  for (const p of adminData.products) {
    await adminStorage.createProduct(p as unknown as Record<string, unknown>);
  }
  for (const v of adminData.variants) {
    await adminStorage.createVariant(v as unknown as Record<string, unknown>);
  }
  for (const ii of adminData.inventoryItems) {
    await adminStorage.createInventoryItem(ii as unknown as Record<string, unknown>);
  }
  for (const mg of adminData.modifierGroups) {
    await adminStorage.createModifierGroup(mg as unknown as Record<string, unknown>);
  }
  for (const m of adminData.modifiers) {
    await adminStorage.createModifier(m as unknown as Record<string, unknown>);
  }
  for (const b of adminData.bomEntries) {
    await adminStorage.createBom(b as unknown as Record<string, unknown>);
  }
  const pmgByProduct = new Map<string, typeof adminData.productModifierGroups>();
  for (const pmg of adminData.productModifierGroups) {
    const arr = pmgByProduct.get(pmg.productId) || [];
    arr.push(pmg);
    pmgByProduct.set(pmg.productId, arr);
  }
  for (const [productId, pmgs] of pmgByProduct) {
    await adminStorage.setProductModifierGroups(productId, pmgs.map(p => p.modifierGroupId));
    for (const pmg of pmgs) {
      if (pmg.scaleFactors) {
        await adminStorage.setProductModifierGroupScaleFactors(productId, pmg.modifierGroupId, pmg.scaleFactors);
      }
    }
  }

  console.log("Auto-seed complete: sync records + admin tables populated");
}

initDb()
  .then(() => autoSeedIfEmpty())
  .then(() => {
    app.listen(serverPort, "0.0.0.0", () => {
      console.log(`Server running on port ${serverPort}`);
    });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to initialize database:", message);
    process.exit(1);
  });
