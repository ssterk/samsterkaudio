import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc, and, isNull } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import { createAuth } from "../auth";
import { serveMediaObject } from "../media-response";
import { hashInvitePassword, verifyInvitePassword, signInviteUnlock, verifyInviteUnlock } from "../invite-password";

export const invites = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function unlockCookieName(token: string) {
  return `pi_unlock_${token}`;
}

// Password-protected invites gate everything that actually exposes audio
// (tracks list, stream, peaks, download, listen logging) behind this — the
// info lookup and artwork stay open so a locked link still unfurls nicely.
async function requireUnlocked(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  token: string,
  invite: { passwordHash: string | null },
): Promise<boolean> {
  if (!invite.passwordHash) return true;
  return verifyInviteUnlock(c.env.BETTER_AUTH_SECRET, token, getCookie(c, unlockCookieName(token)));
}

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
  const body = await c.req.json<{ name: string; releaseId: string; canDownload?: boolean; password?: string }>();
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
    canDownload: !!body.canDownload,
    passwordHash: body.password?.trim() ? await hashInvitePassword(body.password.trim()) : null,
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
      canDownload: inv.canDownload,
      passwordProtected: !!inv.passwordHash,
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
    passwordProtected: !!invite.passwordHash,
    unlocked: await requireUnlocked(c, token, invite),
  });
});

// Public: checks a submitted password against a protected invite and, on
// success, sets a signed cookie so the rest of this invite's endpoints treat
// the visitor as unlocked without re-checking the password every request.
invites.post("/:token/unlock", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB, { schema });

  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return c.json({ error: "invite not found or expired" }, 410);
  if (!invite.passwordHash) return c.json({ ok: true });

  const body = await c.req.json<{ password: string }>();
  if (!(await verifyInvitePassword(body.password ?? "", invite.passwordHash))) {
    return c.json({ error: "incorrect password" }, 401);
  }

  setCookie(c, unlockCookieName(token), await signInviteUnlock(c.env.BETTER_AUTH_SECRET, token), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: `/api/pressing/invites/${token}`,
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ ok: true });
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
  if (!(await requireUnlocked(c, token, invite))) {
    return c.json({ error: "password required" }, 401);
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

  return c.json({ release, tracks, canDownload: invite.canDownload });
});

async function loadStreamableVersion(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  token: string,
  versionId: string,
) {
  const db = drizzle(c.env.DB, { schema });
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return null;
  if (!(await requireUnlocked(c, token, invite))) return "locked" as const;

  const [row] = await db
    .select({ version: schema.trackVersions, releaseId: schema.tracks.releaseId, trackTitle: schema.tracks.title })
    .from(schema.trackVersions)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.trackVersions.trackId))
    .where(eq(schema.trackVersions.id, versionId));
  if (!row || row.releaseId !== invite.releaseId) return null;

  return { ...row, invite };
}

// Public: same Range-request streaming as the authenticated route, scoped
// by invite token instead of a session — this is what lets a shared link
// play without logging in.
invites.get("/:token/stream/:versionId", async (c) => {
  const row = await loadStreamableVersion(c, c.req.param("token"), c.req.param("versionId"));
  if (row === "locked") return c.json({ error: "password required" }, 401);
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.version.status !== "ready" || !row.version.streamKey) {
    return c.json({ error: "still processing" }, 425);
  }
  return serveMediaObject(c.env, row.version.streamKey, c.req.header("Range") ?? null);
});

invites.get("/:token/stream/:versionId/peaks", async (c) => {
  const row = await loadStreamableVersion(c, c.req.param("token"), c.req.param("versionId"));
  if (row === "locked") return c.json({ error: "password required" }, 401);
  if (!row) return c.json({ error: "not found" }, 404);
  if (!row.version.peaksKey) return c.json({ error: "still processing" }, 425);

  const obj = await c.env.MEDIA.get(row.version.peaksKey);
  if (!obj || !obj.body) return c.json({ error: "not found" }, 404);

  return new Response(obj.body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
  });
});

// Public: download, gated on the invite's own canDownload flag rather than
// an account's — a share link's download permission is a property of that
// link, not of whoever happens to click it anonymously.
invites.get("/:token/download/:versionId", async (c) => {
  const row = await loadStreamableVersion(c, c.req.param("token"), c.req.param("versionId"));
  if (row === "locked") return c.json({ error: "password required" }, 401);
  if (!row) return c.json({ error: "not found" }, 404);
  if (!row.invite.canDownload) return c.json({ error: "downloads not permitted for this link" }, 403);

  const ext = row.version.originalKey.match(/\.([^./]+)$/)?.[1] ?? "wav";
  return serveMediaObject(c.env, row.version.originalKey, null, "application/octet-stream", `${row.trackTitle} (${row.version.label}).${ext}`);
});

// Public: logs an anonymous (no-account) play against the invite rather
// than a user, so the owner's listen-activity view still shows it.
invites.post("/:token/listen", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB, { schema });

  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite || !isLive(invite)) return c.json({ error: "not found" }, 404);
  if (!(await requireUnlocked(c, token, invite))) return c.json({ error: "password required" }, 401);

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

// Requires a session — established either via the web's magic-link flow
// above (which sets invite.email first) or the mobile app's email-code
// sign-in (see mobile/src/lib/auth-client.ts), which never sets it
// separately. So: an unclaimed invite (email still "") is claimed by
// whoever accepts it first, signed in as whatever email they used; a
// claimed invite only accepts that same email again.
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
  if (invite.email && invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return c.json({ error: "this invite was issued to a different email" }, 403);
  }

  await db
    .insert(schema.releaseAccess)
    .values({ releaseId: invite.releaseId, userId: session.user.id })
    .onConflictDoNothing();

  await db
    .update(schema.invites)
    .set({ usedAt: new Date(), email: invite.email || session.user.email.toLowerCase() })
    .where(eq(schema.invites.token, token));

  return c.json({ releaseId: invite.releaseId });
});
