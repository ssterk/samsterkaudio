import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./env";
// Only the auth tables, not the full app schema: passing app tables (e.g.
// invites.token) into the adapter's schema confuses better-auth's type-level
// field mapping and produces unrelated "never" errors on drizzle queries
// elsewhere in the project.
import * as authSchema from "./db/auth-schema";

export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema: authSchema });

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    basePath: "/api/pressing/auth",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      // Only the owner signs up with a password; listeners only ever arrive
      // via magic-link invite, so there is no public "create account" flow.
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "listener",
          input: false,
        },
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // TODO(Phase 5 / email provider): no email provider is wired up yet.
          // For now the link is logged so invites are testable end-to-end;
          // hook this up to Resend or a Cloudflare Email Workers send binding
          // before listener invites go out for real.
          console.log(`[pressing] magic link for ${email}: ${url}`);
        },
      }),
    ],
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}
