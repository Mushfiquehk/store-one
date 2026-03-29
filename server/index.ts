import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes";
import { db } from "./db";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use(router);

const isDev = process.env.NODE_ENV !== "production";

if (!isDev) {
  const publicDir = path.resolve(__dirname, "../dist/public");
  app.use(express.static(publicDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "3001", 10);
const serverPort = isDev ? 3001 : port;

async function initDb() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      snapshot JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sync_records (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT,
      UNIQUE(client_id, table_name, record_id)
    )
  `);
}

initDb()
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
