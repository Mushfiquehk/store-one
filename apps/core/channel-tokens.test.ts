import { test, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Feature 28 T3, against a real Postgres.
 *
 * The property this file exists for is the last test: a revoked token and a
 * token that was never real must produce byte-identical answers. Everything
 * else here is scaffolding for that one.
 */
const DATABASE_URL = process.env.DATABASE_URL;

let openPool: { end: () => Promise<void> } | null = null;
after(async () => { await openPool?.end(); });

async function connect() {
  const { initDb } = await import("./init-db");
  const { pool } = await import("./db");
  const auth = await import("./channel-auth");
  const { channelStorage } = await import("./storage");
  openPool = pool;
  await initDb();
  return { auth, channelStorage };
}

async function aChannel(channelStorage: { create: (d: Record<string, unknown>) => Promise<unknown> }) {
  const key = `tok${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  await channelStorage.create({
    key, name: "Test shop", kind: "storefront",
    locationId: null, brandId: null, active: true,
    updatedAt: Date.now(), deletedAt: null,
  });
  return key;
}

test("a token is 256 bits, prefixed, and stored only as a hash", async t => {
  if (!DATABASE_URL) { t.skip("set DATABASE_URL to run the channel token tests"); return; }
  const { auth, channelStorage } = await connect();
  const key = await aChannel(channelStorage);

  const issued = await auth.issueChannelToken(key, "production");
  assert.match(issued.token, /^so_ch_[A-Za-z0-9_-]{43}$/);
  assert.equal("tokenHash" in issued, false, "the issue response carries the hash");

  // Listing never returns the plaintext or the hash.
  const listed = await auth.listChannelTokens(key);
  assert.equal(listed.length, 1);
  const serialised = JSON.stringify(listed);
  assert.equal(serialised.includes(issued.token), false, "the plaintext is readable back");
  assert.equal(serialised.includes("tokenHash"), false, "the hash is readable back");
  assert.equal(listed[0].label, "production");

  // Two tokens are never the same token.
  const second = await auth.issueChannelToken(key, "staging");
  assert.notEqual(second.token, issued.token);
});

test("a valid token resolves to its channel", async t => {
  if (!DATABASE_URL) { t.skip("set DATABASE_URL to run the channel token tests"); return; }
  const { auth, channelStorage } = await connect();
  const key = await aChannel(channelStorage);
  const { token } = await auth.issueChannelToken(key, "production");

  const resolved = await auth.resolveChannelToken(token);
  assert.ok(resolved, "a freshly issued token did not resolve");
  assert.equal(resolved.channelKey, key);
});

test("a token is only as live as the channel behind it", async t => {
  if (!DATABASE_URL) { t.skip("set DATABASE_URL to run the channel token tests"); return; }
  const { auth, channelStorage } = await connect();

  const deactivated = await aChannel(channelStorage);
  const a = await auth.issueChannelToken(deactivated, "x");
  assert.ok(await auth.resolveChannelToken(a.token));
  await channelStorage.update(deactivated, { active: false });
  assert.equal(await auth.resolveChannelToken(a.token), null, "a deactivated channel's token still works");

  const withdrawn = await aChannel(channelStorage);
  const b = await auth.issueChannelToken(withdrawn, "x");
  assert.ok(await auth.resolveChannelToken(b.token));
  await channelStorage.delete(withdrawn);
  assert.equal(await auth.resolveChannelToken(b.token), null, "a withdrawn channel's token still works");
});

test("a revoked token and a fabricated one are indistinguishable", async t => {
  if (!DATABASE_URL) { t.skip("set DATABASE_URL to run the channel token tests"); return; }
  const { auth, channelStorage } = await connect();
  const { CHANNEL_AUTH_FAILURE } = await import("../../packages/domain/channel-auth");
  const key = await aChannel(channelStorage);

  const issued = await auth.issueChannelToken(key, "production");
  await auth.revokeChannelToken(key, issued.id);

  // A token of the right shape that was never issued.
  const fabricated = auth.generateChannelToken();

  assert.equal(await auth.resolveChannelToken(issued.token), null, "a revoked token still resolves");
  assert.equal(await auth.resolveChannelToken(fabricated), null);

  // The middleware's answer, captured for each, must be the same bytes.
  const answer = async (token: string | null) => {
    const captured: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) { captured.status = code; return this; },
      json(body: unknown) { captured.body = body; return this; },
    };
    let nexted = false;
    await auth.requireChannel(
      { headers: token ? { authorization: `Bearer ${token}` } : {} } as never,
      res as never,
      (() => { nexted = true; }) as never,
    );
    return { nexted, status: captured.status, body: JSON.stringify(captured.body) };
  };

  const revoked = await answer(issued.token);
  const never = await answer(fabricated);
  const garbage = await answer("not-even-close");
  const missing = await answer(null);

  for (const [name, got] of [["revoked", revoked], ["fabricated", never], ["garbage", garbage], ["missing", missing]] as const) {
    assert.equal(got.nexted, false, `${name} was let through`);
    assert.equal(got.status, 401, `${name} did not answer 401`);
  }
  assert.equal(revoked.body, never.body, "a revoked token answers differently from one that never existed");
  assert.equal(revoked.body, garbage.body);
  assert.equal(revoked.body, missing.body);
  assert.equal(revoked.body, JSON.stringify(CHANNEL_AUTH_FAILURE));

  // And a live token on the same channel still works, so the gate is not simply shut.
  const live = await auth.issueChannelToken(key, "replacement");
  const ok = await answer(live.token);
  assert.equal(ok.nexted, true, "a valid token was rejected");
  assert.equal(ok.status, undefined);
});
