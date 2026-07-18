import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import type { Env } from "./env";

export async function hasReleaseAccess(
  env: Env,
  user: { id: string; role: string },
  releaseId: string,
): Promise<boolean> {
  if (user.role === "owner") return true;
  const db = drizzle(env.DB, { schema });
  const [row] = await db
    .select()
    .from(schema.releaseAccess)
    .where(and(eq(schema.releaseAccess.releaseId, releaseId), eq(schema.releaseAccess.userId, user.id)));
  return !!row;
}
