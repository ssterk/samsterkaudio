import { useEffect, useState, type FormEvent } from "react";
import { api, type AccessEntry, type PendingInvite } from "../lib/api";

export function SharePanel({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const [access, setAccess] = useState<AccessEntry[] | null>(null);
  const [pending, setPending] = useState<PendingInvite[] | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.releaseAccess(releaseId).then((r) => setAccess(r.access));
    api.pendingInvites(releaseId).then((r) => setPending(r.invites));
  }
  useEffect(load, [releaseId]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await api.createInvite(email, releaseId);
      setEmail("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  function copyLink(token: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div className="w-full max-w-[520px] border border-line bg-bg2 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div className="font-display text-2xl font-black tracking-[0.03em]">SHARE</div>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent text-dim hover:text-cream">
            ✕
          </button>
        </div>

        <div className="mb-6 text-xs leading-relaxed tracking-wide text-muted">
          Anyone with a link below can play immediately — no login required. The email is just a
          label so you remember who it's for; if they want persistent access to everything you've
          shared with them, they can create an account from the link.
        </div>

        <form onSubmit={handleInvite} className="mb-2 flex gap-2">
          <input
            type="email"
            required
            placeholder="WHO'S THIS FOR? (LABEL ONLY)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 border border-line bg-bg px-3 py-2.5 text-sm text-cream placeholder:text-dim focus:outline focus:outline-1 focus:outline-accent"
          />
          <button
            type="submit"
            disabled={inviting}
            className="cursor-pointer border-none bg-accent px-5 py-2.5 font-display text-sm font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            CREATE LINK
          </button>
        </form>
        {error && <div className="mb-4 text-xs tracking-wide text-accent">{error}</div>}

        <div className="mb-2 mt-6 text-[10px] tracking-[0.14em] text-muted">SHAREABLE LINKS</div>
        <div className="mb-6 flex flex-col gap-1.5">
          {pending?.map((inv) => (
            <div key={inv.token} className="border border-line bg-bg p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-xs text-muted">{inv.email}</div>
                <button
                  onClick={() => api.revokeInvite(inv.token).then(load)}
                  className="cursor-pointer border-none bg-transparent text-xs text-dim hover:text-accent"
                >
                  REVOKE
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inv.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 border border-line bg-bg2 px-2.5 py-2 font-mono text-xs text-cream"
                />
                <button
                  onClick={() => copyLink(inv.token, inv.url)}
                  className="cursor-pointer border border-line bg-transparent px-3 font-display text-xs font-bold tracking-[0.1em] text-cream hover:border-muted"
                >
                  {copiedToken === inv.token ? "COPIED" : "COPY"}
                </button>
              </div>
            </div>
          ))}
          {pending?.length === 0 && (
            <div className="border border-dashed border-line px-4 py-6 text-center text-xs text-dim">
              NO LINKS YET
            </div>
          )}
        </div>

        <div className="mb-2 text-[10px] tracking-[0.14em] text-muted">HAS AN ACCOUNT</div>
        <div className="flex flex-col gap-1">
          {access?.map((a) => (
            <div key={a.userId} className="flex items-center justify-between border border-line px-3 py-2.5">
              <div>
                <div className="text-sm">{a.name || a.email}</div>
                <div className="text-xs text-dim">{a.email}</div>
              </div>
              <button
                onClick={() => api.revokeAccess(releaseId, a.userId).then(load)}
                className="cursor-pointer border-none bg-transparent text-xs text-dim hover:text-accent"
              >
                REMOVE
              </button>
            </div>
          ))}
          {access?.length === 0 && (
            <div className="border border-dashed border-line px-4 py-6 text-center text-xs text-dim">
              NOBODY'S CREATED AN ACCOUNT YET
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
