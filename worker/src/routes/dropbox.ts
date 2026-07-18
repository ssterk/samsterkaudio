import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Env } from "../env";
import type { AppVariables } from "../middleware";
import { requireAuth, requireOwner } from "../middleware";
import {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  saveConnection,
  getConnection,
  disconnect as disconnectDropbox,
  getAccessToken,
  listFolder,
  downloadFile,
  getAccountEmail,
} from "../dropbox/client";

export const dropbox = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const STATE_COOKIE = "dropbox_oauth_state";
const AUDIO_EXTENSIONS = new Set(["wav", "aiff", "aif", "flac", "mp3", "m4a"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function redirectUri(env: Env): string {
  return `${env.BETTER_AUTH_URL}/api/pressing/dropbox/callback`;
}

function extOf(name: string): string {
  return (name.match(/\.([^./]+)$/)?.[1] ?? "").toLowerCase();
}

dropbox.use("*", requireAuth, requireOwner);

dropbox.get("/status", async (c) => {
  const connection = await getConnection(c.env);
  return c.json({
    connected: !!connection,
    email: connection?.accountEmail ?? null,
  });
});

dropbox.get("/connect", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });
  return c.redirect(getAuthorizeUrl(c.env, redirectUri(c.env), state));
});

dropbox.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return c.text("Dropbox authorization failed (state mismatch). Go back and try again.", 400);
  }

  const tokens = await exchangeCodeForTokens(c.env, code, redirectUri(c.env));
  if (!tokens.refresh_token) {
    return c.text("Dropbox did not return a refresh token — try disconnecting Dropbox app access in your Dropbox account settings and reconnecting.", 400);
  }

  const email = await getAccountEmail(tokens.access_token);
  await saveConnection(c.env, tokens.refresh_token, tokens.account_id, email);

  return c.redirect("/pressing/import");
});

dropbox.post("/disconnect", async (c) => {
  await disconnectDropbox(c.env);
  return c.json({ ok: true });
});

dropbox.get("/browse", async (c) => {
  const path = c.req.query("path") ?? "";
  const accessToken = await getAccessToken(c.env);
  const entries = await listFolder(accessToken, path);

  const folders = entries
    .filter((e) => e.tag === "folder")
    .map((e) => ({ name: e.name, path: e.pathLower }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const audioFiles = entries
    .filter((e) => e.tag === "file" && AUDIO_EXTENSIONS.has(extOf(e.name)))
    .map((e) => ({ name: e.name, path: e.pathLower, size: e.size ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const imageFiles = entries
    .filter((e) => e.tag === "file" && IMAGE_EXTENSIONS.has(extOf(e.name)))
    .map((e) => ({ name: e.name, path: e.pathLower, size: e.size ?? 0 }));

  // Largest file size as a stand-in for "largest/highest-res image" — Dropbox's
  // folder listing doesn't include pixel dimensions without extra per-file calls.
  const artworkCandidate = imageFiles.sort((a, b) => b.size - a.size)[0] ?? null;

  return c.json({ folders, audioFiles, artworkCandidate });
});

dropbox.post("/import", async (c) => {
  const body = await c.req.json<{
    releaseId?: string;
    title?: string;
    artist?: string;
    type?: "single" | "ep" | "lp";
    tracks: { name: string; path: string }[];
    artworkPath?: string;
  }>();

  if (!body.tracks || body.tracks.length === 0) {
    return c.json({ error: "at least one track is required" }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  let releaseId = body.releaseId;

  if (releaseId) {
    const [existing] = await db.select().from(schema.releases).where(eq(schema.releases.id, releaseId));
    if (!existing) return c.json({ error: "release not found" }, 404);
  } else {
    if (!body.title || !body.artist || !body.type) {
      return c.json({ error: "title, artist, and type are required for a new release" }, 400);
    }
    releaseId = crypto.randomUUID();
    await db.insert(schema.releases).values({
      id: releaseId,
      title: body.title,
      artist: body.artist,
      type: body.type,
    });
  }

  const accessToken = await getAccessToken(c.env);

  if (body.artworkPath) {
    const artworkRes = await downloadFile(accessToken, body.artworkPath);
    if (artworkRes.body) {
      const ext = extOf(body.artworkPath) || "jpg";
      const artworkKey = `releases/${releaseId}/artwork.${ext}`;
      await c.env.MEDIA.put(artworkKey, artworkRes.body, {
        httpMetadata: { contentType: artworkRes.headers.get("content-type") ?? "image/jpeg" },
      });
      await db.update(schema.releases).set({ artworkKey }).where(eq(schema.releases.id, releaseId));
    }
  }

  const existingTracks = await db.select().from(schema.tracks).where(eq(schema.tracks.releaseId, releaseId));
  const maxPosition = existingTracks.reduce((max, t) => Math.max(max, t.position), 0);

  for (let i = 0; i < body.tracks.length; i++) {
    const file = body.tracks[i];
    const match = existingTracks.find((t) => t.sourceFilename === file.name);

    let trackId: string;
    let versionLabel: string;
    if (match) {
      trackId = match.id;
      const priorVersions = await db
        .select()
        .from(schema.trackVersions)
        .where(eq(schema.trackVersions.trackId, trackId));
      await db
        .update(schema.trackVersions)
        .set({ active: false })
        .where(eq(schema.trackVersions.trackId, trackId));
      versionLabel = `v${priorVersions.length + 1}`;
    } else {
      trackId = crypto.randomUUID();
      const title =
        file.name
          .replace(/\.[^./]+$/, "")
          .replace(/^\s*\d+[\s.\-_]+/, "")
          .trim() || file.name;
      await db.insert(schema.tracks).values({
        id: trackId,
        releaseId,
        position: maxPosition + i + 1,
        title,
        sourceFilename: file.name,
      });
      versionLabel = "v1";
    }

    const ext = extOf(file.name) || "wav";
    const versionId = crypto.randomUUID();
    const originalKey = `releases/${releaseId}/tracks/${trackId}/${versionId}.${ext}`;

    await db.insert(schema.trackVersions).values({
      id: versionId,
      trackId,
      label: versionLabel,
      originalKey,
      status: "pending",
      active: true,
    });

    const fileRes = await downloadFile(accessToken, file.path);
    if (!fileRes.body) throw new Error(`empty response body downloading ${file.path}`);
    await c.env.MEDIA.put(originalKey, fileRes.body, {
      httpMetadata: { contentType: fileRes.headers.get("content-type") ?? "application/octet-stream" },
    });
    await c.env.PROCESS_QUEUE.send({ trackVersionId: versionId });
  }

  return c.json({ releaseId });
});
