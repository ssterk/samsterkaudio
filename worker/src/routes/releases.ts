import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth } from "../middleware";

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
