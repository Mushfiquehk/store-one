/**
 * What a channel token looks like, and what the core says when one does not
 * work. The hashing and the database lookup live in apps/core — this is the part
 * that has to be agreed on by both ends and tested without either.
 */

/**
 * The prefix exists to be greppable. A secret that looks like any other opaque
 * string ends up committed, and a distinctive prefix is what lets a scanner —
 * ours, GitHub's, or a person reading a diff — recognise one on sight.
 */
export const CHANNEL_TOKEN_PREFIX = "so_ch_";

/** Bytes of randomness behind a token. 32 is 256 bits. */
export const CHANNEL_TOKEN_BYTES = 32;

/**
 * The one thing the core says when a request does not carry a usable token.
 *
 * **Byte-identical for every failure**, and that is the whole point. If an
 * unknown token said "no such token" and a revoked one said "revoked", the pair
 * would be an oracle: anybody could test guesses against it and learn which
 * strings had ever been real tokens. The same sentence for all of them tells an
 * attacker nothing they did not already know, and tells an operator with a
 * broken deployment exactly as much as they need — which is to go and look at
 * the token they configured.
 */
export const CHANNEL_AUTH_FAILURE = {
  error: "That channel token is not valid. Check STOREONE_CHANNEL_TOKEN on the deployment that sent this request.",
} as const;

/** The header a storefront presents its token in. */
export const CHANNEL_TOKEN_HEADER = "authorization";

/**
 * Pull the token out of an `Authorization: Bearer <token>` header.
 * Returns null for anything that is not one — including a bare token with no
 * scheme, which is a misconfiguration worth failing on rather than guessing at.
 */
export function bearerToken(header: string | undefined | null): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer[ ]+(\S+)$/.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Whether a string is shaped like one of our tokens. A cheap filter before the
 * database is touched, never a substitute for looking it up — shape is not
 * authority.
 */
export function looksLikeChannelToken(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  // base64url of 32 bytes is 43 characters, with no padding.
  return new RegExp(`^${CHANNEL_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(value);
}

export type ChannelTokenRecord = {
  id: string;
  channelKey: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

/**
 * What the admin is allowed to read back about a token: everything except the
 * hash. The plaintext is shown once, at creation, and never stored — so there is
 * nothing here for a leaked settings response to give away.
 */
export function redactToken(row: ChannelTokenRecord & { tokenHash?: string }): ChannelTokenRecord {
  const { tokenHash: _hash, ...rest } = row;
  return rest;
}

/** Whether a stored token may still be used. */
export function tokenIsUsable(row: Pick<ChannelTokenRecord, "revokedAt">, now: number): boolean {
  return row.revokedAt === null || row.revokedAt > now;
}
