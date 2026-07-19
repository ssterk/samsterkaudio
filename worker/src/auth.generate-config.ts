// Used only by `npx @better-auth/cli generate` to produce the D1 migration
// SQL. Not imported by the running Worker — see auth.ts for the real config,
// which this must be kept in sync with.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./db/auth-schema";

const db = drizzle({} as D1Database, { schema: authSchema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  basePath: "/api/pressing/auth",
  secret: "generate-only",
  emailAndPassword: {
    enabled: true,
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
      sendMagicLink: async () => {},
    }),
    expo(),
  ],
});
