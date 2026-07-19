import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth } from "../middleware";
import { hasReleaseAccess } from "../access";

export const tracks = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function loadTrackWithAccess(c: { env: Env; get: (k: "session") => AppVariables["session"] }, trackId: string) {
  const db = drizzle(c.env.DB, { schema });
  const [track] = await db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
  if (!track) return null;
  const session = c.get("session");
  if (!(await hasReleaseAccess(c.env, session.user, track.releaseId))) return null;
  return track;
}

tracks.use("/:id/comments", requireAuth);
tracks.get("/:id/comments", async (c) => {
  const trackId = c.req.param("id");
  const track = await loadTrackWithAccess(c, trackId);
  if (!track) return c.json({ error: "not found" }, 404);

  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({
      id: schema.comments.id,
      trackId: schema.comments.trackId,
      versionId: schema.comments.versionId,
      userId: schema.comments.userId,
      timestampMs: schema.comments.timestampMs,
      body: schema.comments.body,
      parentId: schema.comments.parentId,
      resolved: schema.comments.resolved,
      createdAt: schema.comments.createdAt,
      authorName: schema.user.name,
      authorEmail: schema.user.email,
      authorRole: schema.user.role,
    })
    .from(schema.comments)
    .innerJoin(schema.user, eq(schema.user.id, schema.comments.userId))
    .where(eq(schema.comments.trackId, trackId))
    .orderBy(asc(schema.comments.createdAt));

  return c.json({ comments: rows });
});

tracks.post("/:id/comments", async (c) => {
  const trackId = c.req.param("id");
  const track = await loadTrackWithAccess(c, trackId);
  if (!track) return c.json({ error: "not found" }, 404);

  const session = c.get("session");
  const body = await c.req.json<{ body: string; timestampMs?: number; parentId?: string; versionId?: string }>();
  if (!body.body?.trim()) return c.json({ error: "comment body is required" }, 400);

  const db = drizzle(c.env.DB, { schema });

  if (body.parentId) {
    const [parent] = await db.select().from(schema.comments).where(eq(schema.comments.id, body.parentId));
    if (!parent || parent.trackId !== trackId) return c.json({ error: "invalid parent comment" }, 400);
    if (parent.parentId) return c.json({ error: "replies can only be one level deep" }, 400);
  }

  const id = crypto.randomUUID();
  await db.insert(schema.comments).values({
    id,
    trackId,
    versionId: body.versionId,
    userId: session.user.id,
    timestampMs: body.timestampMs,
    body: body.body.trim(),
    parentId: body.parentId,
  });

  return c.json({ id }, 201);
});

tracks.use("/:id/listen", requireAuth);
tracks.post("/:id/listen", async (c) => {
  const trackId = c.req.param("id");
  const track = await loadTrackWithAccess(c, trackId);
  if (!track) return c.json({ error: "not found" }, 404);

  const session = c.get("session");
  const db = drizzle(c.env.DB, { schema });
  await db.insert(schema.listens).values({
    id: crypto.randomUUID(),
    userId: session.user.id,
    trackId,
  });

  return c.json({ ok: true }, 201);
});
