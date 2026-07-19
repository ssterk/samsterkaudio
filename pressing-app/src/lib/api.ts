const BASE = "/api/pressing";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
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
  originalKey: string;
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

export type InviteInfo = {
  email: string;
  release: { title: string; artist: string; type: string } | null;
};

export type DropboxStatus = { connected: boolean; email: string | null };
export type DropboxFolder = { name: string; path: string };
export type DropboxFile = { name: string; path: string; size: number; modifiedAt: string };
export type DropboxBrowseResult = {
  folders: DropboxFolder[];
  audioFiles: DropboxFile[];
  artworkCandidate: DropboxFile | null;
};

export type AccessEntry = { userId: string; email: string; name: string };

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

export type ListenEvent = {
  id: string;
  trackId: string;
  trackTitle: string;
  listenedAt: string;
  email: string;
  name: string | null;
  anonymous: boolean;
};

export type PendingInvite = { token: string; email: string; url: string };

export const api = {
  releases: () => request<{ releases: Release[] }>("/releases"),
  createRelease: (body: { title: string; artist: string; type: "single" | "ep" | "lp" }) =>
    request<{ id: string }>("/releases", { method: "POST", body: JSON.stringify(body) }),
  release: (id: string) => request<ReleaseDetail>(`/releases/${id}`),
  createTrack: (releaseId: string, filename: string) =>
    request<{ trackId: string; versionId: string; uploadUrl: string }>(`/releases/${releaseId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ filename }),
    }),
  uploadTrackVersion: async (versionId: string, file: File, onProgress?: (pct: number) => void) => {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${BASE}/track-versions/${versionId}/upload`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.statusText)));
      xhr.onerror = () => reject(new Error("upload failed"));
      xhr.send(file);
    });
  },
  streamUrl: (versionId: string) => `${BASE}/stream/${versionId}`,
  peaksUrl: (versionId: string) => `${BASE}/stream/${versionId}/peaks`,
  dropboxStatus: () => request<DropboxStatus>("/dropbox/status"),
  dropboxDisconnect: () => request<{ ok: boolean }>("/dropbox/disconnect", { method: "POST" }),
  dropboxBrowse: (path: string) =>
    request<DropboxBrowseResult>(`/dropbox/browse?path=${encodeURIComponent(path)}`),
  dropboxImport: (body: {
    releaseId?: string;
    title?: string;
    artist?: string;
    type?: "single" | "ep" | "lp";
    tracks: { name: string; path: string }[];
    artworkPath?: string;
  }) => request<{ releaseId: string }>("/dropbox/import", { method: "POST", body: JSON.stringify(body) }),
  markReleaseViewed: (releaseId: string) =>
    request<{ ok: boolean }>(`/releases/${releaseId}/view`, { method: "POST" }),
  releaseAccess: (releaseId: string) => request<{ access: AccessEntry[] }>(`/releases/${releaseId}/access`),
  revokeAccess: (releaseId: string, userId: string) =>
    request<{ ok: boolean }>(`/releases/${releaseId}/access/${userId}`, { method: "DELETE" }),
  createInvite: (email: string, releaseId: string) =>
    request<{ token: string; url: string }>("/invites", {
      method: "POST",
      body: JSON.stringify({ email, releaseId }),
    }),
  releaseListens: (releaseId: string) =>
    request<{ listens: ListenEvent[]; playCounts: Record<string, number> }>(`/releases/${releaseId}/listens`),
  logListen: (trackId: string) => request<{ ok: boolean }>(`/tracks/${trackId}/listen`, { method: "POST" }),
  comments: (trackId: string) => request<{ comments: Comment[] }>(`/tracks/${trackId}/comments`),
  createComment: (
    trackId: string,
    body: { body: string; timestampMs?: number; parentId?: string; versionId?: string },
  ) => request<{ id: string }>(`/tracks/${trackId}/comments`, { method: "POST", body: JSON.stringify(body) }),
  resolveComment: (commentId: string, resolved: boolean) =>
    request<{ ok: boolean }>(`/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ resolved }) }),
  deleteComment: (commentId: string) => request<{ ok: boolean }>(`/comments/${commentId}`, { method: "DELETE" }),
  invite: (token: string) => request<InviteInfo>(`/invites/${token}`),
  requestMagicLink: (token: string) =>
    request<{ sent: boolean }>(`/invites/${token}/request-magic-link`, {
      method: "POST",
    }),
  acceptInvite: (token: string) =>
    request<{ releaseId: string }>(`/invites/${token}/accept`, {
      method: "POST",
    }),
  // Public, token-scoped — no login. This is what lets a shared link play
  // immediately instead of gating on email/magic-link first.
  inviteTracks: (token: string) => request<ReleaseDetail>(`/invites/${token}/tracks`),
  inviteStreamUrl: (token: string, versionId: string) => `${BASE}/invites/${token}/stream/${versionId}`,
  invitePeaksUrl: (token: string, versionId: string) => `${BASE}/invites/${token}/stream/${versionId}/peaks`,
  logAnonymousListen: (token: string, trackId: string) =>
    request<{ ok: boolean }>(`/invites/${token}/listen`, { method: "POST", body: JSON.stringify({ trackId }) }),
  pendingInvites: (releaseId: string) =>
    request<{ invites: PendingInvite[] }>(`/invites/for-release/${releaseId}`),
  revokeInvite: (token: string) => request<{ ok: boolean }>(`/invites/${token}/revoke`, { method: "POST" }),
};
