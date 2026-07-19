import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth } from "../middleware";
import { hasReleaseAccess } from "../access";

export const comments = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function loadCommentWithAccess(
  c: { env: Env; get: (k: "session") => AppVariables["session"] },
  commentId: string,
) {
  const db = drizzle(c.env.DB, { schema });
  const [row] = await db
    .select({ comment: schema.comments, releaseId: schema.tracks.releaseId })
    .from(schema.comments)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.comments.trackId))
    .where(eq(schema.comments.id, commentId));
  if (!row) return null;

  const session = c.get("session");
  if (!(await hasReleaseAccess(c.env, session.user, row.releaseId))) return null;
  return row.comment;
}

comments.use("/:id", requireAuth);

comments.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const comment = await loadCommentWithAccess(c, id);
  if (!comment) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ resolved: boolean }>();
  const db = drizzle(c.env.DB, { schema });
  await db.update(schema.comments).set({ resolved: body.resolved }).where(eq(schema.comments.id, id));

  return c.json({ ok: true });
});

comments.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const comment = await loadCommentWithAccess(c, id);
  if (!comment) return c.json({ error: "not found" }, 404);

  const session = c.get("session");
  if (comment.userId !== session.user.id && session.user.role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  await db.delete(schema.comments).where(eq(schema.comments.id, id));

  return c.json({ ok: true });
});
