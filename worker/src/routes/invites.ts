import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import { createAuth } from "../auth";

export const invites = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isLive(invite: { usedAt: Date | null; expiresAt: Date }) {
  return !invite.usedAt && invite.expiresAt.getTime() > Date.now();
}

// Owner creates an invite for a release. There's no send pipeline yet (see
// auth.ts's sendMagicLink TODO) — this just mints the token/URL for the owner
// to share manually until Phase 5 wires up real email delivery.
//
// Middleware is applied via `.use()` rather than as an inline handler
// argument — with certain route/table combinations, Hono's multi-arg
// `post(path, mw, handler)` overload resolution combined with drizzle's
// query builder overloads confuses the TS checker into resolving unrelated
// `eq()` calls elsewhere in this file to `never`. `.use()` sidesteps it.
invites.use("/", requireAuth, requireOwner);
invites.post("/", async (c) => {
  const body = await c.req.json<{ email: string; releaseId: string }>();
  const db = drizzle(c.env.DB, { schema });

  const [release] = await db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.id, body.releaseId));
  if (!release) return c.json({ error: "release not found" }, 404);

  const token = crypto.randomUUID();
  await db.insert(schema.invites).values({
    token,
    email: body.email,
    releaseId: body.releaseId,
    expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
  });

  return c.json({
    token,
    url: `${c.env.BETTER_AUTH_URL}/pressing/invite/${token}`,
  });
});

// Public: lets the invite acceptance screen show what it's inviting the
// listener to before they sign in.
invites.get("/:token", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const token = c.req.param("token");

  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) {
    return c.json({ error: "invite not found or expired" }, 410);
  }

  const [release] = await db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.id, invite.releaseId));

  return c.json({
    email: invite.email,
    release: release
      ? { title: release.title, artist: release.artist, type: release.type }
      : null,
  });
});

// Public: triggers a real better-auth magic-link sign-in for the invite's
// email. Clicking that link is what actually proves email ownership and
// creates the session — the invite token alone never does.
invites.post("/:token/request-magic-link", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const token = c.req.param("token");

  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) {
    return c.json({ error: "invite not found or expired" }, 410);
  }

  const auth = createAuth(c.env);
  await auth.api.signInMagicLink({
    headers: c.req.raw.headers,
    body: {
      email: invite.email,
      callbackURL: `/pressing/invite/${token}/complete`,
    },
  });

  return c.json({ sent: true });
});

// Requires a session established by the magic link above; only grants access
// if the signed-in email matches the invite's email exactly.
invites.use("/:token/accept", requireAuth);
invites.post("/:token/accept", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const token = c.req.param("token");
  const session = c.get("session");

  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) {
    return c.json({ error: "invite not found or expired" }, 410);
  }
  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return c.json({ error: "this invite was issued to a different email" }, 403);
  }

  await db
    .insert(schema.releaseAccess)
    .values({ releaseId: invite.releaseId, userId: session.user.id })
    .onConflictDoNothing();

  await db
    .update(schema.invites)
    .set({ usedAt: new Date() })
    .where(eq(schema.invites.token, token));

  return c.json({ releaseId: invite.releaseId });
});
