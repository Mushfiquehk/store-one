import { pgTable, serial, text, timestamp, jsonb, integer, bigint, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syncRecords = pgTable("sync_records", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
}, (table) => [
  unique("sync_records_client_table_record").on(table.clientId, table.tableName, table.recordId),
]);

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertBackupSchema = createInsertSchema(backups).omit({ id: true, createdAt: true });

export type InsertClient = z.infer<typeof insertClientSchema>;
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Client = typeof clients.$inferSelect;
export type Backup = typeof backups.$inferSelect;
export type SyncRecord = typeof syncRecords.$inferSelect;
