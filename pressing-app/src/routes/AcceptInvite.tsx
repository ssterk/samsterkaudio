import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, type InviteInfo } from "../lib/api";

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteInfo | "expired" | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .invite(token)
      .then(setInvite)
      .catch(() => setInvite("expired"));
  }, [token]);

  async function handleSend() {
    if (!token) return;
    await api.requestMagicLink(token);
    setSent(true);
  }

  if (invite === null) return null;

  if (invite === "expired") {
    return (
      <Centered>
        <div className="font-display text-3xl font-black text-dim">
          INVITE NOT FOUND OR EXPIRED
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="mb-4 text-[11px] tracking-[0.32em] text-muted">
        YOU'VE BEEN INVITED TO LISTEN
      </div>
      <div className="mb-2 font-display text-5xl font-black">
        {invite.release?.title ?? "a release"}
      </div>
      <div className="mb-10 text-sm tracking-wide text-muted">
        {invite.release?.artist}
      </div>
      {sent ? (
        <div className="max-w-[340px] text-center text-sm tracking-wide text-cream">
          Check {invite.email} for a sign-in link.
        </div>
      ) : (
        <button
          onClick={handleSend}
          className="cursor-pointer border-none bg-accent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-bg hover:bg-accent-hover"
        >
          SEND ME A SIGN-IN LINK
        </button>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-10 text-center">
      {children}
    </div>
  );
}
