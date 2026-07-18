import { createAuthClient } from "better-auth/react";
import { magicLinkClient, inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/pressing/auth",
  plugins: [
    magicLinkClient(),
    // Describes the server's `user.additionalFields.role` (worker/src/auth.ts)
    // so useSession()'s user type includes it — kept manual rather than
    // importing the server auth config, since that's built for the Workers
    // runtime, not this DOM/Vite build.
    inferAdditionalFields({ user: { role: { type: "string" } } }),
  ],
});

export const { useSession, signIn, signOut } = authClient;
