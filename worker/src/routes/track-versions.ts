import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";

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
