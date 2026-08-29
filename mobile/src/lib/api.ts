import { authClient } from "./auth-client";

export const BASE = "https://samsterkaudio.com/api/pressing";

// Custom (non-better-auth) routes don't get the Expo client's automatic
// cookie handling — that only wraps requests made through authClient itself.
// This is the officially documented pattern for authenticating everything
// else: read the cookie the plugin already persisted and attach it by hand.
// See @better-auth/expo/client's `getCookie()` docstring.
export function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export type Release = {
  id: string;
  title: string;
  artist: string;
  type: "single" | "ep" | "lp";
  artworkKey: string | null;
  createdAt: string;
  unreadCount?: number;
};

export type TrackVersion = {
  id: string;
  trackId: string;
  label: string;
  streamKey: string | null;
  peaksKey: string | null;
  status: "pending" | "processing" | "ready" | "failed";
  active: boolean;
  createdAt: string;
};

export type Track = {
  id: string;
  releaseId: string;
  position: number;
  title: string;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  createdAt: string;
  versions: TrackVersion[];
};

export type ReleaseDetail = {
  release: Release;
  tracks: Track[];
};

export type Comment = {
  id: string;
  trackId: string;
  versionId: string | null;
  userId: string;
  timestampMs: number | null;
  body: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
  authorName: string;
  authorEmail: string;
  authorRole: string;
};

export type InviteInfo = {
  name: string | null;
  release: { title: string; artist: string; type: string } | null;
};

export const api = {
  releases: () => request<{ releases: Release[] }>("/releases"),
  release: (id: string) => request<ReleaseDetail>(`/releases/${id}`),
  markReleaseViewed: (releaseId: string) =>
    request<{ ok: boolean }>(`/releases/${releaseId}/view`, { method: "POST" }),
  streamUrl: (versionId: string) => `${BASE}/stream/${versionId}`,
  peaksUrl: (versionId: string) => `${BASE}/stream/${versionId}/peaks`,
  logListen: (trackId: string) => request<{ ok: boolean }>(`/tracks/${trackId}/listen`, { method: "POST" }),
  comments: (trackId: string) => request<{ comments: Comment[] }>(`/tracks/${trackId}/comments`),
  createComment: (trackId: string, body: { body: string; timestampMs?: number; parentId?: string }) =>
    request<{ id: string }>(`/tracks/${trackId}/comments`, { method: "POST", body: JSON.stringify(body) }),

  // Public, token-scoped — no login, no auth headers. This is what lets a
  // Universal Link tap play immediately instead of gating on sign-in first,
  // matching the web AcceptInvite flow exactly.
  invite: (token: string) =>
    fetch(`${BASE}/invites/${token}`).then((r) => {
      if (!r.ok) throw new Error("invite not found or expired");
      return r.json() as Promise<InviteInfo>;
    }),
  inviteTracks: (token: string) =>
    fetch(`${BASE}/invites/${token}/tracks`).then((r) => {
      if (!r.ok) throw new Error("invite not found or expired");
      return r.json() as Promise<ReleaseDetail>;
    }),
  inviteStreamUrl: (token: string, versionId: string) => `${BASE}/invites/${token}/stream/${versionId}`,
  invitePeaksUrl: (token: string, versionId: string) => `${BASE}/invites/${token}/stream/${versionId}/peaks`,
  logAnonymousListen: (token: string, trackId: string) =>
    fetch(`${BASE}/invites/${token}/listen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    }),
  // Requires a session (established via email-code sign-in) — grants
  // release_access for this invite once signed in with the matching email.
  acceptInvite: (token: string) =>
    request<{ releaseId: string }>(`/invites/${token}/accept`, { method: "POST" }),
};
