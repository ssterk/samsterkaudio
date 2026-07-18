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
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
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
