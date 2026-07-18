import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc } from "drizzle-orm";
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

  return c.json({ releases: rows });
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
