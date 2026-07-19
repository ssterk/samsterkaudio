import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export * from "./auth-schema";
import { user } from "./auth-schema";

// Comments, listens, and Dropbox token storage are added when their phases
// land.

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  type: text("type", { enum: ["single", "ep", "lp"] }).notNull(),
  artworkKey: text("artwork_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const releaseAccess = sqliteTable(
  "release_access",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    canDownload: integer("can_download", { mode: "boolean" })
      .default(false)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.userId] })],
);

export const invites = sqliteTable("invites", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  releaseId: text("release_id")
    .notNull()
    .references(() => releases.id, { onDelete: "cascade" }),
  // Null = never expires. Invites are still single-use (usedAt).
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  releaseId: text("release_id")
    .notNull()
    .references(() => releases.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  duration: real("duration"),
  sampleRate: integer("sample_rate"),
  bitDepth: integer("bit_depth"),
  // Dropbox filename this track was imported from — lets re-importing the
  // same folder match existing tracks (by filename, not title, since title
  // may get hand-edited later) and add a new version instead of duplicating.
  // Null for manually-uploaded tracks.
  sourceFilename: text("source_filename"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// No FLAC/AAC transcoding (no ffmpeg/Containers on this account) — streamKey
// is a browser-playable WAV, either the original upload itself or an
// AIFF→WAV repack. See worker/src/transcode.ts.
export const trackVersions = sqliteTable("track_versions", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  originalKey: text("original_key").notNull(),
  streamKey: text("stream_key"),
  peaksKey: text("peaks_key"),
  status: text("status", {
    enum: ["pending", "processing", "ready", "failed"],
  })
    .notNull()
    .default("pending"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// Single row (id is always "default") — one owner, one Dropbox connection.
export const dropboxTokens = sqliteTable("dropbox_tokens", {
  id: text("id").primaryKey(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accountId: text("account_id"),
  accountEmail: text("account_email"),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// parentId is a plain column, not an FK — one level of nesting only, and
// SQLite self-reference FKs add drizzle typing complexity not worth it here.
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  versionId: text("version_id").references(() => trackVersions.id, { onDelete: "set null" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  timestampMs: integer("timestamp_ms"),
  body: text("body").notNull(),
  parentId: text("parent_id"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const listens = sqliteTable("listens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  listenedAt: integer("listened_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// Not in the original data model — needed to compute "unread comments"
// per release per viewer without re-deriving it from scratch each time.
export const releaseViews = sqliteTable(
  "release_views",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.userId] })],
);
