import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: "https://samsterkaudio.com",
  basePath: "/api/pressing/auth",
  plugins: [
    expoClient({
      scheme: "pressing",
      storagePrefix: "pressing",
      storage: SecureStore,
    }),
    // Client-facing sign-in for listeners: a code typed back into the app,
    // not a tapped email link — see auth.ts for why (a link opens in
    // whatever mail/browser context the OS picks, which can't hand its
    // session cookie to the app's own SecureStore-backed storage).
    emailOTPClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
