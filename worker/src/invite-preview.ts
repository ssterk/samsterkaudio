import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Env } from "./env";

// Used to render dynamic Open Graph tags for shared invite links (see
// index.ts) — kept separate from invites.ts's own live-ness check so the
// two don't drift, but duplicated rather than imported since invites.ts's
// `isLive` isn't exported and this needs to stay a tiny, dependency-free read.
export async function getInvitePreview(env: Env, token: string) {
  const db = drizzle(env.DB, { schema });
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite) return null;

  const isLive = !invite.usedAt && (!invite.expiresAt || invite.expiresAt.getTime() > Date.now());
  if (!isLive) return null;

  const [release] = await db.select().from(schema.releases).where(eq(schema.releases.id, invite.releaseId));
  if (!release) return null;

  return { release, hasArtwork: !!release.artworkKey };
}
