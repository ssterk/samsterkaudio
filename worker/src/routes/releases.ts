import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc, and, gt, ne, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import { hasReleaseAccess } from "../access";

export const releases = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// See the comment on invites.ts's `.use()` calls — middleware is applied
// this way rather than as an inline handler argument.
releases.use("/", requireAuth);
releases.get("/", async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB, { schema });

  const rows =
    session.user.role === "owner"
      ? await db.select().from(schema.releases)
      : await db
          .select({
            id: schema.releases.id,
            title: schema.releases.title,
            artist: schema.releases.artist,
            type: schema.releases.type,
            artworkKey: schema.releases.artworkKey,
            createdAt: schema.releases.createdAt,
          })
          .from(schema.releases)
          .innerJoin(
            schema.releaseAccess,
            eq(schema.releaseAccess.releaseId, schema.releases.id),
          )
          .where(eq(schema.releaseAccess.userId, session.user.id));

  // Unread comment count per release: comments from other people, created
  // after this user's last visit to that release (or ever, if never visited).
  const releasesWithUnread = [];
  for (const release of rows) {
    const [view] = await db
      .select()
      .from(schema.releaseViews)
      .where(and(eq(schema.releaseViews.releaseId, release.id), eq(schema.releaseViews.userId, session.user.id)));
    const since = view?.lastViewedAt ?? new Date(0);

    const trackRows = await db
      .select({ id: schema.tracks.id })
      .from(schema.tracks)
      .where(eq(schema.tracks.releaseId, release.id));
    const trackIds = trackRows.map((t) => t.id);

    let unreadCount = 0;
    if (trackIds.length > 0) {
      const unread = await db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(
          and(
            inArray(schema.comments.trackId, trackIds),
            gt(schema.comments.createdAt, since),
            ne(schema.comments.userId, session.user.id),
          ),
        );
      unreadCount = unread.length;
    }
    releasesWithUnread.push({ ...release, unreadCount });
  }

  return c.json({ releases: releasesWithUnread });
});

releases.use("/", requireOwner);
releases.post("/", async (c) => {
  const body = await c.req.json<{ title: string; artist: string; type: "single" | "ep" | "lp" }>();
  if (!body.title || !body.artist || !["single", "ep", "lp"].includes(body.type)) {
    return c.json({ error: "title, artist, and type (single/ep/lp) are required" }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const id = crypto.randomUUID();
  await db.insert(schema.releases).values({
    id,
    title: body.title,
    artist: body.artist,
    type: body.type,
  });

  return c.json({ id }, 201);
});

releases.use("/:id", requireAuth);
releases.get("/:id", async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");

  if (!(await hasReleaseAccess(c.env, session.user, id))) {
    return c.json({ error: "not found" }, 404);
  }

  const db = drizzle(c.env.DB, { schema });
  const [release] = await db.select().from(schema.releases).where(eq(schema.releases.id, id));
  if (!release) return c.json({ error: "not found" }, 404);

  const trackRows = await db
    .select()
    .from(schema.tracks)
    .where(eq(schema.tracks.releaseId, id))
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

releases.use("/:id/tracks", requireAuth, requireOwner);
releases.post("/:id/tracks", async (c) => {
  const releaseId = c.req.param("id");
  const body = await c.req.json<{ filename: string }>();
  if (!body.filename) return c.json({ error: "filename is required" }, 400);

  const db = drizzle(c.env.DB, { schema });
  const [release] = await db.select().from(schema.releases).where(eq(schema.releases.id, releaseId));
  if (!release) return c.json({ error: "release not found" }, 404);

  const existing = await db
    .select({ position: schema.tracks.position })
    .from(schema.tracks)
    .where(eq(schema.tracks.releaseId, releaseId));
  const nextPosition = existing.reduce((max, t) => Math.max(max, t.position), 0) + 1;

  // Filename fallback per the import spec: strip extension and any leading
  // track-number/dash prefix (e.g. "03 - Song Title.wav" -> "Song Title").
  const title = body.filename
    .replace(/\.[^./]+$/, "")
    .replace(/^\s*\d+[\s.\-_]+/, "")
    .trim() || body.filename;

  const ext = (body.filename.match(/\.([^./]+)$/)?.[1] ?? "wav").toLowerCase();

  const trackId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const originalKey = `releases/${releaseId}/tracks/${trackId}/original.${ext}`;

  await db.insert(schema.tracks).values({
    id: trackId,
    releaseId,
    position: nextPosition,
    title,
  });
  await db.insert(schema.trackVersions).values({
    id: versionId,
    trackId,
    label: "v1",
    originalKey,
    status: "pending",
  });

  return c.json({ trackId, versionId, uploadUrl: `/api/pressing/track-versions/${versionId}/upload` }, 201);
});

// Marks a release "read" for unread-comment-count purposes.
releases.use("/:id/view", requireAuth);
releases.post("/:id/view", async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");
  if (!(await hasReleaseAccess(c.env, session.user, id))) return c.json({ error: "not found" }, 404);

  const db = drizzle(c.env.DB, { schema });
  await db
    .insert(schema.releaseViews)
    .values({ releaseId: id, userId: session.user.id, lastViewedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.releaseViews.releaseId, schema.releaseViews.userId],
      set: { lastViewedAt: new Date() },
    });

  return c.json({ ok: true });
});

// Who currently has access to this release, for the share panel.
releases.use("/:id/access", requireAuth, requireOwner);
releases.get("/:id/access", async (c) => {
  const releaseId = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({
      userId: schema.releaseAccess.userId,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.releaseAccess)
    .innerJoin(schema.user, eq(schema.user.id, schema.releaseAccess.userId))
    .where(eq(schema.releaseAccess.releaseId, releaseId));

  return c.json({ access: rows });
});

releases.use("/:id/access/:userId", requireAuth, requireOwner);
releases.delete("/:id/access/:userId", async (c) => {
  const releaseId = c.req.param("id");
  const userId = c.req.param("userId");

  const db = drizzle(c.env.DB, { schema });
  await db
    .delete(schema.releaseAccess)
    .where(and(eq(schema.releaseAccess.releaseId, releaseId), eq(schema.releaseAccess.userId, userId)));

  return c.json({ ok: true });
});

// Listen activity for the owner: who played what, when, and how often.
releases.use("/:id/listens", requireAuth, requireOwner);
releases.get("/:id/listens", async (c) => {
  const releaseId = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const trackRows = await db
    .select({ id: schema.tracks.id, title: schema.tracks.title })
    .from(schema.tracks)
    .where(eq(schema.tracks.releaseId, releaseId));
  const trackTitles = new Map(trackRows.map((t) => [t.id, t.title]));
  const trackIds = trackRows.map((t) => t.id);

  if (trackIds.length === 0) return c.json({ listens: [], playCounts: {} });

  const listenRows = await db
    .select({
      id: schema.listens.id,
      trackId: schema.listens.trackId,
      listenedAt: schema.listens.listenedAt,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.listens)
    .innerJoin(schema.user, eq(schema.user.id, schema.listens.userId))
    .where(inArray(schema.listens.trackId, trackIds));

  // Link-only plays with no account — attributed to the invite's email
  // rather than a user.
  const anonListenRows = await db
    .select({
      id: schema.anonymousListens.id,
      trackId: schema.anonymousListens.trackId,
      listenedAt: schema.anonymousListens.listenedAt,
      email: schema.invites.email,
    })
    .from(schema.anonymousListens)
    .innerJoin(schema.invites, eq(schema.invites.token, schema.anonymousListens.inviteToken))
    .where(inArray(schema.anonymousListens.trackId, trackIds));

  type ListenRow = { id: string; trackId: string; listenedAt: Date; email: string; name: string | null; anonymous: boolean };
  const allListens: ListenRow[] = [
    ...listenRows.map((r) => ({ ...r, anonymous: false })),
    ...anonListenRows.map((r) => ({ ...r, name: null, anonymous: true })),
  ].sort((a, b) => b.listenedAt.getTime() - a.listenedAt.getTime());

  const playCounts: Record<string, number> = {};
  for (const row of allListens) {
    playCounts[row.trackId] = (playCounts[row.trackId] ?? 0) + 1;
  }

  return c.json({
    listens: allListens.map((r) => ({ ...r, trackTitle: trackTitles.get(r.trackId) ?? "" })),
    playCounts,
  });
});
