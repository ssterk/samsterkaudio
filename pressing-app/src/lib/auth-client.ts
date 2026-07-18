import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/pressing/auth",
  plugins: [magicLinkClient()],
});

export const { useSession, signIn, signOut } = authClient;
