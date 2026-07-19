import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth } from "../middleware";
import { hasReleaseAccess } from "../access";
import { serveMediaObject } from "../media-response";

export const stream = new Hono<{ Bindings: Env; Variables: AppVariables }>();

stream.use("/:id", requireAuth);
stream.use("/:id/peaks", requireAuth);

async function loadAccessibleVersion(c: { env: Env; get: (k: "session") => AppVariables["session"] }, id: string) {
  const db = drizzle(c.env.DB, { schema });
  const [row] = await db
    .select({ version: schema.trackVersions, releaseId: schema.tracks.releaseId })
    .from(schema.trackVersions)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.trackVersions.trackId))
    .where(eq(schema.trackVersions.id, id));
  if (!row) return null;

  const session = c.get("session");
  if (!(await hasReleaseAccess(c.env, session.user, row.releaseId))) return null;
  return row.version;
}

stream.get("/:id", async (c) => {
  const version = await loadAccessibleVersion(c, c.req.param("id"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (version.status !== "ready" || !version.streamKey) {
    return c.json({ error: "still processing" }, 425);
  }
  return serveMediaObject(c.env, version.streamKey, c.req.header("Range") ?? null);
});

stream.get("/:id/peaks", async (c) => {
  const version = await loadAccessibleVersion(c, c.req.param("id"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!version.peaksKey) return c.json({ error: "still processing" }, 425);

  const obj = await c.env.MEDIA.get(version.peaksKey);
  if (!obj || !obj.body) return c.json({ error: "not found" }, 404);

  return new Response(obj.body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
  });
});
