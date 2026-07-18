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
};

export type InviteInfo = {
  email: string;
  release: { title: string; artist: string; type: string } | null;
};

export const api = {
  releases: () => request<{ releases: Release[] }>("/releases"),
  invite: (token: string) => request<InviteInfo>(`/invites/${token}`),
  requestMagicLink: (token: string) =>
    request<{ sent: boolean }>(`/invites/${token}/request-magic-link`, {
      method: "POST",
    }),
  acceptInvite: (token: string) =>
    request<{ releaseId: string }>(`/invites/${token}/accept`, {
      method: "POST",
    }),
};
