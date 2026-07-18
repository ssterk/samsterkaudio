import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth } from "../middleware";
import { hasReleaseAccess } from "../access";

export const stream = new Hono<{ Bindings: Env; Variables: AppVariables }>();

stream.use("/:id", requireAuth);
stream.use("/:id/peaks", requireAuth);

function parseRange(rangeHeader: string | null, size: number): { offset: number; length: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;

  let start: number;
  let end: number;
  if (startStr === "") {
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === "" ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

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

  const head = await c.env.MEDIA.head(version.streamKey);
  if (!head) return c.json({ error: "file not found" }, 404);
  const size = head.size;

  const range = parseRange(c.req.header("Range") ?? null, size);
  const obj = range
    ? await c.env.MEDIA.get(version.streamKey, { range })
    : await c.env.MEDIA.get(version.streamKey);
  if (!obj || !obj.body) return c.json({ error: "file not found" }, 404);

  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "audio/wav");
  headers.set("Cache-Control", "private, max-age=3600");

  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(obj.body, { status: 200, headers });
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
