/**
 * A **Channel** is a named route by which orders reach the business.
 *
 * The till is one. Each storefront deployment is one. It exists so that "add
 * another storefront" is a row and a deployment rather than a fork — see
 * docs/architecture/multi-channel.md.
 *
 * Everything here is pure. The rules about what a channel may be called, which
 * one cannot be deleted, and what may be edited on it are decided once, in this
 * file, and enforced identically by the Postgres adapter and the till's Dexie
 * one. A rule that lived in only one of them would be a rule the other could
 * break.
 */

export type ChannelKind = "pos" | "storefront";

export const CHANNEL_KINDS: ChannelKind[] = ["pos", "storefront"];

export type Channel = {
  /**
   * The identity, and the primary key. A slug rather than a generated id
   * because it is what a storefront carries in its environment
   * (`STOREONE_CHANNEL_KEY`) and what a sale records — both are read by humans
   * far more often than they are read by code, and `channelKey: 'web'` in a
   * report says something that `channelKey: 'ch_01H8…'` does not.
   *
   * Immutable once created, for the same reason a product slug is: a sale that
   * happened on `web` must still say so after somebody renames the shop.
   */
  key: string;
  name: string;
  kind: ChannelKind;
  /** Which store's menu and stock it draws on. Null until Feature 3 lands locations. */
  locationId: string | null;
  /** Which brand identity it wears. Null takes the default brand (Feature 30). */
  brandId: string | null;
  /** Whether it may take orders. A storefront being stood up is inactive, not absent. */
  active: boolean;
  updatedAt: number;
  deletedAt: number | null;
};

/**
 * The till. Seeded into every database and never deletable: it is not a channel
 * an operator added, it is the one that was already there, and every sale ever
 * rung points at it.
 */
export const POS_CHANNEL_KEY = "pos";

/** Lower-case letters, digits and hyphens. What can live in a URL and an env var. */
const CHANNEL_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Channels that exist by construction rather than by an operator's choice.
 * Protected from deletion and from having their key or kind edited.
 */
export function isProtectedChannel(key: string): boolean {
  return key === POS_CHANNEL_KEY;
}

export const DEFAULT_POS_CHANNEL: Omit<Channel, "updatedAt"> = {
  key: POS_CHANNEL_KEY,
  name: "Front counter",
  kind: "pos",
  locationId: null,
  brandId: null,
  active: true,
  deletedAt: null,
};

/**
 * Validate a channel on the way in. Returns an error string, or null when the
 * value is acceptable.
 *
 * `existing` is the stored row when this is an edit, absent on a create. The
 * difference matters: a key is fixed once written, and the till's kind is fixed
 * forever.
 */
export function validateChannel(
  input: Record<string, unknown>,
  existing?: Channel | null,
): string | null {
  const key = typeof input.key === "string" ? input.key : existing?.key;
  if (typeof key !== "string" || !CHANNEL_KEY_RE.test(key)) {
    return "A channel key is lower-case letters, digits and hyphens, starting with a letter (max 32)";
  }
  if (existing && typeof input.key === "string" && input.key !== existing.key) {
    return "A channel key cannot be changed — a sale that happened on it still names it";
  }

  const name = input.name === undefined ? existing?.name : input.name;
  if (typeof name !== "string" || !name.trim()) return "A channel needs a name";

  const kind = input.kind === undefined ? existing?.kind : input.kind;
  if (typeof kind !== "string" || !CHANNEL_KINDS.includes(kind as ChannelKind)) {
    return `A channel kind is one of: ${CHANNEL_KINDS.join(", ")}`;
  }
  if (existing && isProtectedChannel(existing.key) && kind !== existing.kind) {
    return "The till's channel kind cannot be changed";
  }

  if (input.active !== undefined && typeof input.active !== "boolean") {
    return "active must be true or false";
  }
  if (existing && isProtectedChannel(existing.key) && input.active === false) {
    return "The till cannot be deactivated — it is where sales come from when nothing else is running";
  }

  for (const field of ["locationId", "brandId"] as const) {
    const v = input[field];
    if (v !== undefined && v !== null && typeof v !== "string") {
      return `${field} must be a string or null`;
    }
  }
  return null;
}

/** Why a channel may not be deleted, or null when it may. */
export function channelDeleteError(key: string): string | null {
  return isProtectedChannel(key)
    ? "The till's channel cannot be deleted — every sale ever rung points at it"
    : null;
}

/** Build the row to store from a validated create. */
export function channelFromInput(input: Record<string, unknown>, now: number): Channel {
  return {
    key: String(input.key),
    name: String(input.name).trim(),
    kind: input.kind as ChannelKind,
    locationId: (input.locationId as string | null | undefined) ?? null,
    brandId: (input.brandId as string | null | undefined) ?? null,
    active: input.active === undefined ? true : Boolean(input.active),
    updatedAt: now,
    deletedAt: null,
  };
}
