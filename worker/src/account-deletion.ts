import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import type { Env } from "./env";

// Called from auth.ts's `user.deleteUser.afterDelete` hook — kept in its own
// module (rather than inline in auth.ts) because that file's drizzleAdapter
// is deliberately typed against the auth-only schema, and importing the full
// app schema there has previously corrupted unrelated `eq()` calls to `never`
// (see the comment on auth.ts's `authSchema` import).
export async function cleanupUserData(env: Env, userId: string): Promise<void> {
  const db = drizzle(env.DB, { schema });
  await db.delete(schema.releaseAccess).where(eq(schema.releaseAccess.userId, userId));
  await db.delete(schema.releaseViews).where(eq(schema.releaseViews.userId, userId));
  await db.delete(schema.comments).where(eq(schema.comments.userId, userId));
  await db.delete(schema.listens).where(eq(schema.listens.userId, userId));
}
