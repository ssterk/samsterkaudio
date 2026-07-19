import { Hono } from "hono";
import type { Env } from "./env";
import type { AppVariables } from "./middleware";
import { requireAuth } from "./middleware";
import { createAuth } from "./auth";
import { releases } from "./routes/releases";
import { invites } from "./routes/invites";
import { trackVersions } from "./routes/track-versions";
import { stream } from "./routes/stream";
import { dropbox } from "./routes/dropbox";
import { tracks } from "./routes/tracks";
import { comments } from "./routes/comments";
import { getInvitePreview } from "./invite-preview";
import { handleQueue } from "./queue";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.on(["GET", "POST"], "/api/pressing/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

app.get("/api/pressing/me", requireAuth, (c) => {
  const session = c.get("session");
  return c.json({ user: session.user });
});

app.route("/api/pressing/releases", releases);
app.route("/api/pressing/invites", invites);
app.route("/api/pressing/track-versions", trackVersions);
app.route("/api/pressing/stream", stream);
app.route("/api/pressing/dropbox", dropbox);
app.route("/api/pressing/tracks", tracks);
app.route("/api/pressing/comments", comments);

// Shared invite links get pasted into texts/Slack/group chats — this makes
// the unfurled preview card itself branded (real release title/artist and
// artwork) instead of the generic "Pressing" fallback in index.html, before
// anyone even clicks through.
app.get("/pressing/invite/:token", async (c) => {
  const token = c.req.param("token");
  const preview = await getInvitePreview(c.env, token);

  const assetResponse = await c.env.ASSETS.fetch(new Request(new URL("/pressing/", c.req.url), c.req.raw));
  if (!preview || !assetResponse.body) return assetResponse;

  const title = `${preview.release.title} — Sam Sterk Audio`;
  const description = `${preview.release.artist} · A private mix from Sam Sterk Audio. Listen and leave feedback.`;
  const imageUrl = preview.hasArtwork
    ? `${c.env.BETTER_AUTH_URL}/api/pressing/invites/${token}/artwork`
    : `${c.env.BETTER_AUTH_URL}/images/og.jpg`;

  return new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute("content", description) })
    .on('meta[property="og:title"]', { element: (el) => void el.setAttribute("content", title) })
    .on('meta[property="og:description"]', { element: (el) => void el.setAttribute("content", description) })
    .on('meta[property="og:image"]', { element: (el) => void el.setAttribute("content", imageUrl) })
    .transform(assetResponse);
});

// Everything else is a static asset: the existing marketing site, or the
// Pressing SPA bundle under /pressing/*. Built files only ever live directly
// at /pressing/ or under /pressing/assets/; any other /pressing/* path is a
// client-side React Router route, so it's served /pressing/index.html
// directly and left to the router. (ASSETS.fetch's own 404 handling isn't
// used to detect this — for a path like /pressing/library it returns a 307
// redirect rather than a 404, so status-based fallback doesn't work here.)
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const isBuiltAsset =
    url.pathname === "/pressing" ||
    url.pathname === "/pressing/" ||
    url.pathname.startsWith("/pressing/assets/");

  if (url.pathname.startsWith("/pressing") && !isBuiltAsset) {
    // Fetching "/pressing/index.html" directly (rather than "/pressing/")
    // triggers Cloudflare's own clean-URL redirect back to "/pressing/",
    // which would just bounce the client instead of returning the page.
    return c.env.ASSETS.fetch(new Request(new URL("/pressing/", url), c.req.raw));
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  queue: handleQueue,
};
