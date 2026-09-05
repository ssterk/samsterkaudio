import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, ne } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import { hasReleaseAccess } from "../access";
import { serveMediaObject } from "../media-response";

export const trackVersions = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Streams the request body directly into R2 — never buffered in the Worker,
// so upload size isn't bounded by isolate memory.
trackVersions.use("/:id/upload", requireAuth, requireOwner);
trackVersions.put("/:id/upload", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const [version] = await db
    .select()
    .from(schema.trackVersions)
    .where(eq(schema.trackVersions.id, id));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!c.req.raw.body) return c.json({ error: "request body required" }, 400);

  await c.env.MEDIA.put(version.originalKey, c.req.raw.body, {
    httpMetadata: { contentType: c.req.header("Content-Type") ?? "application/octet-stream" },
  });

  await c.env.PROCESS_QUEUE.send({ trackVersionId: id });

  return c.json({ ok: true });
});

// Promotes this version to "active" (what plays by default for anyone
// without a version explicitly selected) and demotes its siblings — exactly
// one active version per track at a time.
trackVersions.use("/:id/activate", requireAuth, requireOwner);
trackVersions.post("/:id/activate", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const [version] = await db.select().from(schema.trackVersions).where(eq(schema.trackVersions.id, id));
  if (!version) return c.json({ error: "not found" }, 404);

  await db
    .update(schema.trackVersions)
    .set({ active: false })
    .where(and(eq(schema.trackVersions.trackId, version.trackId), ne(schema.trackVersions.id, id)));
  await db.update(schema.trackVersions).set({ active: true }).where(eq(schema.trackVersions.id, id));

  return c.json({ ok: true });
});

trackVersions.use("/:id", requireAuth, requireOwner);
trackVersions.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const [version] = await db.select().from(schema.trackVersions).where(eq(schema.trackVersions.id, id));
  if (!version) return c.json({ error: "not found" }, 404);

  const siblingCount = await db
    .select({ id: schema.trackVersions.id })
    .from(schema.trackVersions)
    .where(eq(schema.trackVersions.trackId, version.trackId));
  if (siblingCount.length <= 1) {
    return c.json({ error: "can't delete a track's only version" }, 400);
  }

  await db.delete(schema.trackVersions).where(eq(schema.trackVersions.id, id));
  if (version.active) {
    const [next] = await db
      .select()
      .from(schema.trackVersions)
      .where(eq(schema.trackVersions.trackId, version.trackId));
    if (next) await db.update(schema.trackVersions).set({ active: true }).where(eq(schema.trackVersions.id, next.id));
  }

  // Best-effort — the DB row is the source of truth either way.
  await Promise.all(
    [version.originalKey, version.streamKey, version.peaksKey]
      .filter((key): key is string => !!key)
      .map((key) => c.env.MEDIA.delete(key).catch(() => {})),
  );

  return c.json({ ok: true });
});

async function loadDownloadableVersion(
  c: { env: Env; get: (k: "session") => AppVariables["session"] },
  id: string,
) {
  const db = drizzle(c.env.DB, { schema });
  const [row] = await db
    .select({
      version: schema.trackVersions,
      releaseId: schema.tracks.releaseId,
      trackTitle: schema.tracks.title,
    })
    .from(schema.trackVersions)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.trackVersions.trackId))
    .where(eq(schema.trackVersions.id, id));
  if (!row) return null;

  const session = c.get("session");
  if (session.user.role === "owner") return row;
  if (!(await hasReleaseAccess(c.env, session.user, row.releaseId))) return null;

  const [access] = await db
    .select()
    .from(schema.releaseAccess)
    .where(and(eq(schema.releaseAccess.releaseId, row.releaseId), eq(schema.releaseAccess.userId, session.user.id)));
  if (!access?.canDownload) return null;

  return row;
}

trackVersions.use("/:id/download", requireAuth);
trackVersions.get("/:id/download", async (c) => {
  const row = await loadDownloadableVersion(c, c.req.param("id"));
  if (!row) return c.json({ error: "not found" }, 404);

  const ext = row.version.originalKey.match(/\.([^./]+)$/)?.[1] ?? "wav";
  return serveMediaObject(c.env, row.version.originalKey, null, "application/octet-stream", `${row.trackTitle} (${row.version.label}).${ext}`);
});
