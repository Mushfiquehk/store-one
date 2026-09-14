import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_AUTH_FAILURE,
  CHANNEL_TOKEN_PREFIX,
  bearerToken,
  looksLikeChannelToken,
  redactToken,
  tokenIsUsable,
} from "./channel-auth";

const token = (body = "a".repeat(43)) => `${CHANNEL_TOKEN_PREFIX}${body}`;

test("a token is pulled out of a Bearer header, and only out of one", () => {
  assert.equal(bearerToken(`Bearer ${token()}`), token());
  assert.equal(bearerToken(`  Bearer   ${token()}  `), token());
  // A bare token with no scheme is a misconfiguration, not a token.
  assert.equal(bearerToken(token()), null);
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(""), null);
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken(null), null);
  // Two values is not one token.
  assert.equal(bearerToken(`Bearer ${token()} ${token()}`), null);
});

test("the shape filter accepts our tokens and rejects everything else", () => {
  assert.ok(looksLikeChannelToken(token()));
  assert.ok(looksLikeChannelToken(`${CHANNEL_TOKEN_PREFIX}${"A-b_9".padEnd(43, "x")}`));

  assert.ok(!looksLikeChannelToken(""));
  assert.ok(!looksLikeChannelToken("so_ch_short"));
  assert.ok(!looksLikeChannelToken(`${CHANNEL_TOKEN_PREFIX}${"a".repeat(44)}`));
  assert.ok(!looksLikeChannelToken(`wrong_${"a".repeat(43)}`));
  // No padding, and nothing outside base64url.
  assert.ok(!looksLikeChannelToken(`${CHANNEL_TOKEN_PREFIX}${"a".repeat(42)}=`));
  assert.ok(!looksLikeChannelToken(`${CHANNEL_TOKEN_PREFIX}${"a".repeat(42)}+`));
  assert.ok(!looksLikeChannelToken(null));
});

test("the prefix is greppable, so a leaked secret is recognisable on sight", () => {
  assert.match(CHANNEL_TOKEN_PREFIX, /^so_ch_$/);
  assert.ok(token().startsWith(CHANNEL_TOKEN_PREFIX));
});

test("there is exactly one failure message, so the API is not an oracle", () => {
  // The value matters less than the fact that there is only one of it. A test
  // that pinned each rejection to its own message would be a test that made the
  // enumeration bug permanent.
  assert.equal(Object.keys(CHANNEL_AUTH_FAILURE).length, 1);
  assert.equal(typeof CHANNEL_AUTH_FAILURE.error, "string");
  assert.doesNotMatch(
    CHANNEL_AUTH_FAILURE.error,
    /revoked|unknown|expired|not found|no such/i,
    "the failure message distinguishes why a token failed, which is what makes it an oracle",
  );
});

test("a token row reads back without its hash", () => {
  const row = {
    id: "t1", channelKey: "web", label: "prod", createdAt: 1,
    lastUsedAt: null, revokedAt: null, tokenHash: "deadbeef",
  };
  const out = redactToken(row);
  assert.equal("tokenHash" in out, false);
  assert.equal(JSON.stringify(out).includes("deadbeef"), false);
  assert.equal(out.channelKey, "web");
});

test("a revoked token stops working at the moment it was revoked", () => {
  assert.ok(tokenIsUsable({ revokedAt: null }, 100));
  assert.ok(!tokenIsUsable({ revokedAt: 100 }, 100));
  assert.ok(!tokenIsUsable({ revokedAt: 50 }, 100));
  // Revoked with a future timestamp is still live until then.
  assert.ok(tokenIsUsable({ revokedAt: 150 }, 100));
});
