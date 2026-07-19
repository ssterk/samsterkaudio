import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../env";
import { encryptToken, decryptToken } from "./crypto";

const TOKEN_ROW_ID = "default";

export function getAuthorizeUrl(env: Env, redirectUri: string, state: string): string {
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DROPBOX_APP_KEY);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(env: Env, body: Record<string, string>) {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DROPBOX_APP_KEY,
      client_secret: env.DROPBOX_APP_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Dropbox token request failed: ${res.status} ${await res.text()}`);
  }
  return res.json<{
    access_token: string;
    refresh_token?: string;
    account_id?: string;
    expires_in: number;
  }>();
}

export async function exchangeCodeForTokens(env: Env, code: string, redirectUri: string) {
  return tokenRequest(env, { code, grant_type: "authorization_code", redirect_uri: redirectUri });
}

export async function saveConnection(env: Env, refreshToken: string, accountId?: string, accountEmail?: string) {
  const db = drizzle(env.DB, { schema });
  const refreshTokenEncrypted = await encryptToken(env, refreshToken);
  await db
    .insert(schema.dropboxTokens)
    .values({ id: TOKEN_ROW_ID, refreshTokenEncrypted, accountId, accountEmail })
    .onConflictDoUpdate({
      target: schema.dropboxTokens.id,
      set: { refreshTokenEncrypted, accountId, accountEmail },
    });
}

export async function getConnection(env: Env) {
  const db = drizzle(env.DB, { schema });
  const [row] = await db.select().from(schema.dropboxTokens).where(eq(schema.dropboxTokens.id, TOKEN_ROW_ID));
  return row ?? null;
}

export async function disconnect(env: Env) {
  const db = drizzle(env.DB, { schema });
  await db.delete(schema.dropboxTokens).where(eq(schema.dropboxTokens.id, TOKEN_ROW_ID));
}

// Mints a fresh short-lived access token from the stored refresh token.
// Not cached — import operations are infrequent enough that a token
// exchange per request is a reasonable simplicity/latency tradeoff.
export async function getAccessToken(env: Env): Promise<string> {
  const connection = await getConnection(env);
  if (!connection) throw new Error("Dropbox is not connected");
  const refreshToken = await decryptToken(env, connection.refreshTokenEncrypted);
  const result = await tokenRequest(env, { refresh_token: refreshToken, grant_type: "refresh_token" });
  return result.access_token;
}

export type DropboxEntry = {
  tag: "folder" | "file";
  name: string;
  pathLower: string;
  pathDisplay: string;
  size?: number;
  serverModified?: string;
};

export async function listFolder(accessToken: string, path: string): Promise<DropboxEntry[]> {
  const entries: DropboxEntry[] = [];
  let res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`Dropbox list_folder failed: ${res.status} ${await res.text()}`);
  let body = await res.json<{
    entries: Array<{
      ".tag": string;
      name: string;
      path_lower: string;
      path_display: string;
      size?: number;
      server_modified?: string;
    }>;
    has_more: boolean;
    cursor: string;
  }>();

  const collect = () => {
    for (const e of body.entries) {
      entries.push({
        tag: e[".tag"] === "folder" ? "folder" : "file",
        name: e.name,
        pathLower: e.path_lower,
        pathDisplay: e.path_display,
        size: e.size,
        serverModified: e.server_modified,
      });
    }
  };
  collect();

  while (body.has_more) {
    res = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: body.cursor }),
    });
    if (!res.ok) throw new Error(`Dropbox list_folder/continue failed: ${res.status} ${await res.text()}`);
    body = await res.json();
    collect();
  }

  return entries;
}

// Response.body is a stream with a known Content-Length, so callers can pipe
// it straight into R2's put() without buffering.
export async function downloadFile(accessToken: string, path: string): Promise<Response> {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  if (!res.ok) throw new Error(`Dropbox download failed: ${res.status} ${await res.text()}`);
  return res;
}

export async function getAccountEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const account = await res.json<{ email?: string }>();
  return account.email;
}
