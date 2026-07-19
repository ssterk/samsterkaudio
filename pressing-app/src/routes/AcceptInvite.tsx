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
        <StudioFooter />
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
      <StudioFooter />
    </Centered>
  );
}

function StudioFooter() {
  return (
    <div className="mt-20 flex flex-col items-center gap-3 border-t border-line pt-8">
      <a
        href="https://samsterkaudio.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-display text-2xl font-black tracking-[0.03em] text-cream hover:text-accent"
      >
        Sam Sterk<span className="text-accent">&nbsp;Audio</span>
      </a>
      <div className="text-[11px] tracking-[0.2em] text-dim">
        MIXING ENGINEER · VISTA, CA · SAN DIEGO · NASHVILLE TRAINED
      </div>
      <a
        href="https://samsterkaudio.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 font-display text-xs font-bold tracking-[0.14em] text-accent hover:text-cream"
      >
        HEAR MORE OF THE WORK →
      </a>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-10 text-center">
      {children}
    </div>
  );
}
