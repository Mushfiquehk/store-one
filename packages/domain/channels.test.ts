import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POS_CHANNEL,
  POS_CHANNEL_KEY,
  channelDeleteError,
  channelFromInput,
  isProtectedChannel,
  validateChannel,
  type Channel,
} from "./channels";

const stored = (over: Partial<Channel> = {}): Channel => ({
  key: "web",
  name: "The shop",
  kind: "storefront",
  locationId: null,
  brandId: null,
  active: true,
  updatedAt: 1,
  deletedAt: null,
  ...over,
});

const pos = (): Channel => ({ ...DEFAULT_POS_CHANNEL, updatedAt: 1 });

test("a channel key is a slug — what fits in a URL and an env var", () => {
  const ok = ["web", "catering", "pos", "drive-thru", "a"];
  for (const key of ok) {
    assert.equal(validateChannel({ key, name: "x", kind: "storefront" }), null, key);
  }
  const bad = ["", "Web", "1web", "web_two", "web channel", "-web", "a".repeat(33), "wéb"];
  for (const key of bad) {
    assert.match(
      validateChannel({ key, name: "x", kind: "storefront" }) ?? "",
      /channel key/,
      `expected ${JSON.stringify(key)} to be rejected`,
    );
  }
});

test("a channel needs a name that is not blank space", () => {
  assert.match(validateChannel({ key: "web", kind: "storefront", name: "   " }) ?? "", /needs a name/);
  assert.match(validateChannel({ key: "web", kind: "storefront" }) ?? "", /needs a name/);
});

test("a channel kind is one of the two, and the error says which", () => {
  const err = validateChannel({ key: "web", name: "x", kind: "kiosk" }) ?? "";
  assert.match(err, /pos, storefront/);
});

test("a key cannot be changed, because a sale that happened on it still names it", () => {
  const err = validateChannel({ key: "shop" }, stored({ key: "web" })) ?? "";
  assert.match(err, /cannot be changed/);
  // Sending the same key back is an edit that changes nothing, not a rename.
  assert.equal(validateChannel({ key: "web", name: "Renamed" }, stored({ key: "web" })), null);
});

test("an edit only has to carry what it changes", () => {
  assert.equal(validateChannel({ name: "New name" }, stored()), null);
  assert.equal(validateChannel({ active: false }, stored()), null);
});

test("the till cannot be deleted, deactivated, or turned into a storefront", () => {
  assert.ok(isProtectedChannel(POS_CHANNEL_KEY));
  assert.ok(!isProtectedChannel("web"));

  assert.match(channelDeleteError(POS_CHANNEL_KEY) ?? "", /cannot be deleted/);
  assert.equal(channelDeleteError("web"), null);

  assert.match(validateChannel({ active: false }, pos()) ?? "", /cannot be deactivated/);
  assert.match(validateChannel({ kind: "storefront" }, pos()) ?? "", /kind cannot be changed/);

  // Renaming the till is fine — what it is called is not what it is.
  assert.equal(validateChannel({ name: "Counter 1" }, pos()), null);
});

test("a storefront may be deactivated — one being stood up is inactive, not absent", () => {
  assert.equal(validateChannel({ active: false }, stored()), null);
});

test("locationId and brandId are optional strings, and null is a real answer", () => {
  assert.equal(validateChannel({ key: "web", name: "x", kind: "storefront", locationId: null, brandId: null }), null);
  assert.match(validateChannel({ key: "web", name: "x", kind: "storefront", brandId: 7 }) ?? "", /brandId/);
});

test("a created channel is active by default and carries the timestamp it was made at", () => {
  const row = channelFromInput({ key: "web", name: "  The shop  ", kind: "storefront" }, 1234);
  assert.deepEqual(row, {
    key: "web",
    name: "The shop",
    kind: "storefront",
    locationId: null,
    brandId: null,
    active: true,
    updatedAt: 1234,
    deletedAt: null,
  });
});

test("the seeded till channel is valid by its own rules", () => {
  assert.equal(validateChannel({ ...DEFAULT_POS_CHANNEL }), null);
  assert.equal(DEFAULT_POS_CHANNEL.kind, "pos");
  assert.equal(DEFAULT_POS_CHANNEL.active, true);
});
