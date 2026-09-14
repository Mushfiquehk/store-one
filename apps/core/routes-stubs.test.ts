import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { router } from "./routes";

/**
 * Employees used to answer 200 with the payload echoed back while persisting nothing. The
 * assertion that matters is the status code and that no echo comes back — a caller must be able
 * to tell "saved" from "discarded".
 *
 * Sales are covered separately: since T2 they persist for real, so their check needs a database
 * and lives in the end-to-end script rather than here.
 *
 * No database is touched: pg.Pool connects lazily and a 501 route never queries.
 */
let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => server.close());

test("POST /api/admin/employees answers 501 and does not echo the payload back", async () => {
  const res = await fetch(`${baseUrl}/api/admin/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "emp_1", name: "Sam" }),
  });

  assert.equal(res.status, 501);
  const body = await res.json();
  assert.match(body.error, /Nothing was saved/);
  assert.equal(body.id, undefined);
});

// Reads lied too, just more quietly: an empty list reads as "no employees yet".
test("employee reads answer 501 rather than an empty list", async () => {
  for (const path of ["/api/admin/employees", "/api/admin/time-punches"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 501, `${path} should not answer 200`);
    assert.match((await res.json()).error, /not available/);
  }
});

test("the 501 says where the data actually lives", async () => {
  const res = await fetch(`${baseUrl}/api/admin/employees/emp_1`);
  assert.equal(res.status, 501);
  assert.match((await res.json()).error, /127\.0\.0\.1:8080/);
});
