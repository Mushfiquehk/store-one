import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db";
import { channelTokens, channels } from "./schema";
import {
  CHANNEL_AUTH_FAILURE,
  CHANNEL_TOKEN_BYTES,
  CHANNEL_TOKEN_PREFIX,
  bearerToken,
  looksLikeChannelToken,
  tokenIsUsable,
} from "../../packages/domain/channel-auth";

/**
 * Channel tokens: issued here, hashed here, and never readable back.
 *
 * **Why SHA-256 and not scrypt.** Feature 4 specified scrypt, correctly, for
 * employee PINs — a four-digit PIN has about 13 bits of entropy and a slow KDF
 * is the only thing standing between a stolen table and every PIN in it. A
 * channel token is 256 bits from the system CSPRNG. There is no dictionary to
 * run against it and no amount of GPU that helps, so the slow hash would buy
 * nothing and cost a KDF on every storefront request.
 *
 * The other half of that trade is why it *has* to be a fast, unsalted hash:
 * a request arrives carrying one token and we need the row for it. A per-row
 * random salt would mean reading every token in the table and hashing the
 * candidate against each, which is both slow and worse — it makes the work
 * proportional to how many tokens exist.
 */

/** A new token. Returned once, to the caller, and never obtainable again. */
export function generateChannelToken(): string {
  return CHANNEL_TOKEN_PREFIX + randomBytes(CHANNEL_TOKEN_BYTES).toString("base64url");
}

export function hashChannelToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type ResolvedChannel = {
  channelKey: string;
  locationId: string | null;
  tokenId: string;
};

/**
 * Resolve a presented token to the channel it belongs to, or null.
 *
 * Null for every reason there is: not shaped like a token, no such token,
 * revoked, or pointing at a channel that has been withdrawn or deactivated. The
 * caller cannot tell which, and that is deliberate — see CHANNEL_AUTH_FAILURE.
 */
export async function resolveChannelToken(presented: string | null): Promise<ResolvedChannel | null> {
  if (!looksLikeChannelToken(presented)) return null;

  const hash = hashChannelToken(presented as string);
  const [row] = await db
    .select({
      id: channelTokens.id,
      channelKey: channelTokens.channelKey,
      tokenHash: channelTokens.tokenHash,
      revokedAt: channelTokens.revokedAt,
    })
    .from(channelTokens)
    .where(eq(channelTokens.tokenHash, hash))
    .limit(1);

  if (!row) return null;

  // The index lookup already matched, so this compares two equal strings in the
  // happy path. It is here for the case it is not: a constant-time compare costs
  // nothing and removes any argument about what the database did on the way.
  const a = Buffer.from(row.tokenHash, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const now = Date.now();
  if (!tokenIsUsable(row, now)) return null;

  // A token is only as live as the channel behind it. Withdrawing or
  // deactivating a channel has to stop its storefront, or "active" means
  // nothing and deleting a channel leaves its key working.
  const [channel] = await db
    .select({ key: channels.key, locationId: channels.locationId, active: channels.active, deletedAt: channels.deletedAt })
    .from(channels)
    .where(and(eq(channels.key, row.channelKey)))
    .limit(1);
  if (!channel || channel.deletedAt !== null || !channel.active) return null;

  // Best-effort: a failed bookkeeping write must not fail the request it was
  // recording. Same rule the action log follows.
  void db
    .update(channelTokens)
    .set({ lastUsedAt: now })
    .where(eq(channelTokens.id, row.id))
    .catch(() => {});

  return { channelKey: channel.key, locationId: channel.locationId, tokenId: row.id };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      channel?: ResolvedChannel;
    }
  }
}

/**
 * Gate for everything under /api/channel. Attaches the resolved channel to the
 * request, or answers with the one failure body.
 */
export async function requireChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const resolved = await resolveChannelToken(bearerToken(req.headers.authorization));
  if (!resolved) {
    res.status(401).json(CHANNEL_AUTH_FAILURE);
    return;
  }
  req.channel = resolved;
  next();
}

/** Issue a token for a channel. The plaintext is returned once and not stored. */
export async function issueChannelToken(channelKey: string, label: string) {
  const token = generateChannelToken();
  const row = {
    id: `chtok_${randomBytes(9).toString("base64url")}`,
    channelKey,
    tokenHash: hashChannelToken(token),
    label,
    createdAt: Date.now(),
    lastUsedAt: null as number | null,
    revokedAt: null as number | null,
  };
  await db.insert(channelTokens).values(row);
  const { tokenHash: _hash, ...rest } = row;
  return { ...rest, token };
}

export async function listChannelTokens(channelKey: string) {
  const rows = await db
    .select({
      id: channelTokens.id,
      channelKey: channelTokens.channelKey,
      label: channelTokens.label,
      createdAt: channelTokens.createdAt,
      lastUsedAt: channelTokens.lastUsedAt,
      revokedAt: channelTokens.revokedAt,
    })
    .from(channelTokens)
    .where(eq(channelTokens.channelKey, channelKey));
  return rows;
}

/** Revoke rather than delete: a token that was used has a history worth keeping. */
export async function revokeChannelToken(channelKey: string, id: string): Promise<boolean> {
  const updated = await db
    .update(channelTokens)
    .set({ revokedAt: Date.now() })
    .where(and(eq(channelTokens.id, id), eq(channelTokens.channelKey, channelKey)))
    .returning({ id: channelTokens.id });
  return updated.length > 0;
}
