import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./env";
import { cleanupUserData } from "./account-deletion";
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
    // "pressing://" is the personal iOS app's URL scheme (mobile/app.json) —
    // needed so better-auth trusts deep-link redirects back into the app.
    trustedOrigins: ["pressing://"],
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
      // Apple requires in-app account deletion for any app that supports
      // account creation (guideline 5.1.1(v)). No email confirmation step
      // (no email provider is wired up — see the magicLink TODO below), so
      // this deletes immediately when called; the mobile app gates it behind
      // its own confirmation UI.
      deleteUser: {
        enabled: true,
        afterDelete: async (user) => {
          await cleanupUserData(env, user.id);
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
      // Used by the mobile app instead of magicLink: a tapped email link
      // hands the session to whatever browser/mail context opened it, not
      // the app's own SecureStore-backed cookie storage, so there's no clean
      // way to get a session into the app from a link tap. A code the user
      // types back into the app sidesteps that entirely — it's a normal
      // same-origin API call the app's own fetch client already captures.
      emailOTP({
        sendVerificationOTP: async ({ email, otp }) => {
          // TODO(Phase 5 / email provider): same as sendMagicLink above.
          console.log(`[pressing] sign-in code for ${email}: ${otp}`);
        },
      }),
      // Bridges cookie-based web sessions to a header-based token the iOS
      // app can store in SecureStore — see mobile/src/lib/auth-client.ts.
      expo(),
    ],
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}
