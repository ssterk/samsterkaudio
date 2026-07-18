import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export * from "./auth-schema";
import { user } from "./auth-schema";

// Minimal release/access/invite tables — enough for Phase 1 (roles, invite
// acceptance, empty library state). Tracks, versions, comments, listens, and
// Dropbox token storage are added when their phases land.

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
