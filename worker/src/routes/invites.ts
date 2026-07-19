import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc, and, isNull } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import { createAuth } from "../auth";
import { serveMediaObject } from "../media-response";

export const invites = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Note: NOT gated on usedAt — the link is meant to keep working indefinitely
// for anonymous playback even after someone's turned it into an account
// (accept() is idempotent via onConflictDoNothing), so a bookmarked/reshared
// link doesn't mysteriously stop working. usedAt still exists to mark which
// invites have converted to an account, e.g. for the pending-invites list.
function isLive(invite: { expiresAt: Date | null }) {
  return !invite.expiresAt || invite.expiresAt.getTime() > Date.now();
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
  const body = await c.req.json<{ name: string; releaseId: string }>();
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);

  const db = drizzle(c.env.DB, { schema });

  const [release] = await db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.id, body.releaseId));
  if (!release) return c.json({ error: "release not found" }, 404);

  const token = crypto.randomUUID();
  await db.insert(schema.invites).values({
    token,
    name: body.name.trim(),
    email: "", // set later if/when the visitor creates an account
    releaseId: body.releaseId,
  });

  return c.json({
    token,
    url: `${c.env.BETTER_AUTH_URL}/pressing/invite/${token}`,
  });
});

// Owner: previously-created links for a release that haven't been turned
// into an account yet — so a link copied once isn't lost forever if you
// close the share panel without pasting it somewhere.
invites.use("/for-release/:releaseId", requireAuth, requireOwner);
invites.get("/for-release/:releaseId", async (c) => {
  const releaseId = c.req.param("releaseId");
  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.releaseId, releaseId), isNull(schema.invites.usedAt)));

  return c.json({
    invites: rows.map((inv) => ({
      token: inv.token,
      name: inv.name,
      email: inv.email || null,
      url: `${c.env.BETTER_AUTH_URL}/pressing/invite/${inv.token}`,
    })),
  });
});

// POST, not DELETE on "/:token" — that path is also the public GET lookup
// below, and `.use("/:token", ...)` would gate every method on it, not just
// one. A distinct path sidesteps that entirely.
invites.use("/:token/revoke", requireAuth, requireOwner);
invites.post("/:token/revoke", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB, { schema });
  await db.delete(schema.invites).where(eq(schema.invites.token, token));
  return c.json({ ok: true });
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
    name: invite.name,
    release: release
      ? { title: release.title, artist: release.artist, type: release.type }
      : null,
  });
});

// Public: serves the release's artwork so shared invite links unfurl with a
// real image in iMessage/Slack/etc. — scoped by invite token, same trust
// model as the invite-info lookup above (the token is the capability, not a
// guessable release id).
invites.get("/:token/artwork", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const token = c.req.param("token");

  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return c.notFound();

  const [release] = await db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.id, invite.releaseId));
  if (!release?.artworkKey) return c.notFound();

  const obj = await c.env.MEDIA.get(release.artworkKey);
  if (!obj || !obj.body) return c.notFound();

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

// Public: the release + tracks for the invite's landing page, so visiting
// the link can play immediately — no account, no email step. Same shape as
// the authenticated release-detail endpoint, minus anything owner-only.
invites.get("/:token/tracks", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const token = c.req.param("token");

  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) {
    return c.json({ error: "invite not found or expired" }, 410);
  }

  const [release] = await db.select().from(schema.releases).where(eq(schema.releases.id, invite.releaseId));
  if (!release) return c.json({ error: "not found" }, 404);

  const trackRows = await db
    .select()
    .from(schema.tracks)
    .where(eq(schema.tracks.releaseId, release.id))
    .orderBy(asc(schema.tracks.position));

  const tracks = [];
  for (const track of trackRows) {
    const versionRows = await db
      .select()
      .from(schema.trackVersions)
      .where(eq(schema.trackVersions.trackId, track.id));
    tracks.push({ ...track, versions: versionRows });
  }

  return c.json({ release, tracks });
});

async function loadStreamableVersion(env: Env, token: string, versionId: string) {
  const db = drizzle(env.DB, { schema });
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return null;

  const [row] = await db
    .select({ version: schema.trackVersions, releaseId: schema.tracks.releaseId })
    .from(schema.trackVersions)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.trackVersions.trackId))
    .where(eq(schema.trackVersions.id, versionId));
  if (!row || row.releaseId !== invite.releaseId) return null;

  return row.version;
}

// Public: same Range-request streaming as the authenticated route, scoped
// by invite token instead of a session — this is what lets a shared link
// play without logging in.
invites.get("/:token/stream/:versionId", async (c) => {
  const version = await loadStreamableVersion(c.env, c.req.param("token"), c.req.param("versionId"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (version.status !== "ready" || !version.streamKey) {
    return c.json({ error: "still processing" }, 425);
  }
  return serveMediaObject(c.env, version.streamKey, c.req.header("Range") ?? null);
});

invites.get("/:token/stream/:versionId/peaks", async (c) => {
  const version = await loadStreamableVersion(c.env, c.req.param("token"), c.req.param("versionId"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!version.peaksKey) return c.json({ error: "still processing" }, 425);

  const obj = await c.env.MEDIA.get(version.peaksKey);
  if (!obj || !obj.body) return c.json({ error: "not found" }, 404);

  return new Response(obj.body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
  });
});

// Public: logs an anonymous (no-account) play against the invite rather
// than a user, so the owner's listen-activity view still shows it.
invites.post("/:token/listen", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB, { schema });

  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ trackId: string }>();
  const [track] = await db.select().from(schema.tracks).where(eq(schema.tracks.id, body.trackId));
  if (!track || track.releaseId !== invite.releaseId) return c.json({ error: "not found" }, 404);

  await db.insert(schema.anonymousListens).values({
    id: crypto.randomUUID(),
    inviteToken: token,
    trackId: body.trackId,
  });

  return c.json({ ok: true }, 201);
});

// Public: the visitor supplies their own email here (the owner never has to
// know it up front) — this is what actually proves email ownership via a
// real better-auth magic-link sign-in. The invite token alone never does.
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

  const body = await c.req.json<{ email: string }>();
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return c.json({ error: "a valid email is required" }, 400);
  }

  await db.update(schema.invites).set({ email }).where(eq(schema.invites.token, token));

  const auth = createAuth(c.env);
  await auth.api.signInMagicLink({
    headers: c.req.raw.headers,
    body: {
      email,
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
