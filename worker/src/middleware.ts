import type { Context, Next } from "hono";
import { createAuth } from "./auth";
import type { Env } from "./env";

// Hand-shaped rather than derived from better-auth's inferred API return
// type: piping that through `ReturnType<...>["api"]["getSession"]` produces
// a type deep enough that the TS checker occasionally collapses unrelated
// drizzle query expressions later in the same file to `never`. This only
// lists the fields routes actually read.
export type AppSession = {
  session: { id: string; userId: string; expiresAt: Date };
  user: { id: string; email: string; name: string; role: string };
};

export type AppVariables = {
  session: AppSession;
};

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
) {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("session", session as AppSession);
  await next();
}

export async function requireOwner(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
) {
  const session = c.get("session");
  if (session.user.role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
}
