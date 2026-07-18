# Pressing — Phase 0: Repo Audit & Integration Plan

## 1. Current state of samsterkaudio.com

**It's a hand-authored static site, not a framework app.** One file does almost
everything:

- `index.html` (57 KB) — the entire marketing site. Inline `<style>` block,
  no external CSS file, no Tailwind, no build step, no bundler, no JS framework.
- Supporting static files at repo root: `images/`, `Pictures/` (source assets,
  not deployed — not referenced from `index.html`), `favicon.svg`, `robots.txt`,
  `sitemap.xml`, `.well-known/security.txt`.
- `_headers` — HSTS, frame/content-type/referrer/permissions policy headers,
  cache rules for `/fonts/*` and `/images/*`.
- `_redirects` — currently just `/index.html / 200`. (Your working tree has
  this trimmed down from three `http(s)→https` 301 rules — I left that
  uncommitted change alone since it's yours in progress, not mine.)

**Deploy is Cloudflare Workers with static Assets, not classic Pages**, despite
`DEPLOY.txt` describing a Pages "upload assets" flow — that doc looks like
leftover onboarding notes from before the project switched to wrangler-managed
deploys. The actual mechanism today:

```jsonc
// wrangler.jsonc
{
  "name": "samsterkaudio",
  "compatibility_date": "2026-05-02",
  "assets": { "directory": "." },
  "compatibility_flags": ["nodejs_compat"]
}
```

`package.json`'s only script is `"deploy": "wrangler deploy"`, only
devDependency is `wrangler@^4.103.0`. No `main` field yet — there's no Worker
*script*, just a static-assets Worker. No CI/CD; deploys are run manually from
your machine. This is actually the best-case starting point for Pressing:
modern Workers Assets already support pairing a `main` Worker script with an
`assets` directory in the same config, which is exactly the shape we need.

**No routing exists** because there's nothing to route — it's one page.

**No Tailwind, no design-token file.** Tokens live inline in `index.html`'s
`<style>`:

```css
--black: #141210;   --black2: #0e0d0b;
--cream: #f2ede2;   --orange: #c45c3a;
--muted: #a89f8c;   --border: rgba(242,237,226,0.1);
--disp: 'Barlow Condensed', Impact, 'Arial Narrow', sans-serif;
--body: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
```
Fonts loaded via Google Fonts `<link>`: Barlow Condensed 700/800/900 italic,
Barlow 300/400.

## 2. Design reference audit

`~/Downloads/pressing-private-music-app` is a Claude Design handoff bundle —
`project/Pressing.dc.html` is a prototype using a templating pseudo-markup
(`<sc-if>`, `<sc-for>`, `{{ }}` bindings), not runnable code, but it fully
specifies 7 screens: **Login, Library, Release, Track player, Dropbox import,
Listener view, Mobile layouts**. I read it top to bottom.

Its design tokens:

```css
--bg:#0d0d0d      --bg2:#141414     --panel:#161311   --line:#2a2521
--cream:#f2ead9   --muted:#8f867a   --dim:#5c564d     --accent:#c45c3a
```
Fonts: Barlow Condensed 700/900 (display), Barlow 400/500/600 (body), **IBM
Plex Mono 400/500** (new — used for metadata, timestamps, "MASTER v3 ·
SELF-HOSTED" style mono details; the marketing site doesn't use this face
today).

**The accent orange (`#c45c3a`) is byte-identical between the live site and
the design bundle** — one source of truth already, no reconciliation needed
there.

**Everything else is close but not identical:**

| Token | Live site | Design bundle |
|---|---|---|
| Background | `#141210` | `#0d0d0d` |
| Cream (text) | `#f2ede2` | `#f2ead9` |
| Muted | `#a89f8c` | `#8f867a` |
| Border/line | `rgba(242,237,226,.1)` | `#2a2521` |

This is the one real ambiguity from your brief — you said both "pull tokens
from the live site, pixel-consistent" *and* "match the Claude Design prototype
exactly." Those two sources disagree slightly. **My recommendation:** use the
design bundle's exact values for Pressing. It's the approved mock you asked me
to match pixel-for-pixel, the differences are small enough that nobody will
perceive Pressing and the marketing site as "off-brand" next to each other,
and the darker `#0d0d0d` / mono-face treatment reads intentionally as a
distinct "pressing plant / dark room" mode rather than a mismatch. Flag me
otherwise and I'll snap Pressing's tokens to the live site's instead.

## 3. Proposed integration architecture

### Repo layout (additions only — nothing existing moves)

```
/                        existing marketing static files — untouched
/pressing-app/           new Vite + React + TS source (build input, not deployed as-is)
  src/
  vite.config.ts         base: '/pressing/', outDir: '../pressing', manualChunks for code-split
  tailwind.config.ts     theme extended with the design-bundle tokens above
/pressing/                ← Vite BUILD OUTPUT lands here (gitignored, generated)
/worker/                 new Hono API source
  src/index.ts           Worker entry: routes /api/pressing/* to Hono, else falls through to ASSETS
  src/routes/            auth, releases, tracks, comments, import, streaming, downloads
  src/db/                D1 query helpers / schema types
/migrations/             D1 SQL migrations (wrangler d1 migrations apply)
wrangler.jsonc           updated (see below)
package.json             add: hono, vite, react, react-dom, tailwindcss, drizzle-orm (or raw SQL), better-auth
```

`assets.directory` stays `"."` — since the Vite build output lands in
`/pressing/` at repo root, it's automatically included alongside the existing
marketing files with no config change there.

### wrangler.jsonc changes

```jsonc
{
  "name": "samsterkaudio",
  "compatibility_date": "2026-05-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "worker/src/index.ts",
  "assets": {
    "directory": ".",
    "binding": "ASSETS"
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "pressing", "database_id": "<created below>" }
  ],
  "r2_buckets": [
    { "binding": "MEDIA", "bucket_name": "pressing-media" }
  ],
  "queues": {
    "producers": [{ "binding": "IMPORT_QUEUE", "queue": "pressing-import" }],
    "consumers": [{ "queue": "pressing-import" }]
  },
  "observability": { "enabled": true }
}
```

Adding `main` turns this into a real Worker: incoming requests hit
`worker/src/index.ts` first. Routes under `/api/pressing/*` go to the Hono
app; everything else (including `/pressing/*` app routes and all existing
marketing paths) falls through to `env.ASSETS.fetch(request)`. For client-side
routing under `/pressing/*` (React Router), the Worker catches ASSETS 404s on
that prefix and re-serves `/pressing/index.html` — same SPA-fallback trick
`_redirects` already does for the root, just scoped to the subpath. I'll pin
down the exact Workers-Assets/`run_worker_first` config against current
wrangler docs during Phase 1 implementation — not a blocker for this plan,
just an implementation detail.

This keeps it to **one Cloudflare project, one `wrangler.jsonc`, one
`wrangler deploy`** — no new subdomain, no split projects.

### Why /pressing over /library

Going with **`/pressing`**: it's the product's own name (the design bundle's
login screen literally renders "PRESSING" as the wordmark), it reads
unambiguously as "this is the app," and it won't collide with a future
"library" *section inside* the app (e.g. a listener's "my library" view) the
way reusing that word as the top-level route would.

### Nav change

One conditional link in the existing `index.html` nav, rendered only when a
Pressing session cookie is present — otherwise the public marketing nav is
untouched. Exact placement/copy ("Pressing" text vs. small icon) — your call,
I'll default to a plain text link matching the existing nav's type treatment
unless you'd rather see an icon.

### Data model (D1) — as specified, translated to schema

```sql
-- users, sessions: owned by better-auth's schema (generated by its CLI adapter)

CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single','ep','lp')),
  artwork_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration REAL,
  sample_rate INTEGER,
  bit_depth INTEGER
);

CREATE TABLE track_versions (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  original_key TEXT NOT NULL,
  flac_key TEXT,
  aac_key TEXT,
  peaks_key TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES track_versions(id),
  user_id TEXT NOT NULL,
  timestamp_ms INTEGER,
  body TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id),
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE release_access (
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  can_download INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, user_id)
);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE listens (
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  listened_at INTEGER NOT NULL
);
```
Plus a `dropbox_tokens` table (encrypted refresh token, keyed to your owner
user) not in your original list but needed for §Dropbox import per the spec
(offline access token storage) — flagging since it's an addition, not a
subtraction.

Migrations live in `/migrations/0001_init.sql`, applied via
`wrangler d1 migrations apply pressing`.

### Auth library: recommend **better-auth**, not Lucia

Lucia's author discontinued it as a maintained library in 2024 (it's now
positioned as a set of copy-paste guides, not an installable package with
ongoing updates). better-auth is actively maintained, has a Kysely/D1 adapter,
and ships email+password plus a magic-link plugin out of the box — matches
your two-role, email+password-for-owner / magic-link-for-listeners
requirement directly.

## 4. Open questions — need your call before I scaffold anything

1. **Route name** — recommending `/pressing` (see above). Confirm or override.
2. **Token reconciliation** — recommending design-bundle values exactly (see
   table above). Confirm or override.
3. **Cloudflare plan tier** — Queues and Containers both require a Workers
   **Paid** plan ($5/mo). Are you already on Paid? If not, that's a
   prerequisite before Phase 2's transcode pipeline can work at all.
4. **Cloudflare Containers availability** — per your spec, ffmpeg transcoding
   needs a Container (or a Fly.io/Railway fallback if Containers aren't
   available on your account). I can't check this remotely — can you confirm
   whether Containers are enabled on your Cloudflare account (dashboard →
   Workers & Pages → Containers), or should I plan for the Fly.io/Railway
   fallback from the start?
5. **Nav link treatment** — plain text link vs. small icon for "Pressing" in
   the existing marketing nav. Either is a small change; your call.

Nothing has been scaffolded — no dependencies installed, no wrangler.jsonc
changes made, no D1/R2/Queues resources created on your Cloudflare account.
Waiting on your review before touching any of that.
