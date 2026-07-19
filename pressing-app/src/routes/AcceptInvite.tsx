import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, type InviteInfo, type ReleaseDetail } from "../lib/api";
import { Player } from "../components/Player";

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteInfo | "expired" | null>(null);
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .invite(token)
      .then(setInvite)
      .catch(() => setInvite("expired"));
    api
      .inviteTracks(token)
      .then(setDetail)
      .catch(() => {});
  }, [token]);

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSending(true);
    try {
      await api.requestMagicLink(token, email);
      setSentTo(email);
    } finally {
      setSending(false);
    }
  }

  if (invite === null) return null;

  if (invite === "expired") {
    return (
      <Centered>
        <div className="font-display text-3xl font-black text-dim">
          LINK NOT FOUND OR NO LONGER AVAILABLE
        </div>
        <StudioFooter />
      </Centered>
    );
  }

  const activeTrack = detail?.tracks.find((t) => t.id === activeTrackId) ?? detail?.tracks[0];
  const activeVersion = activeTrack && (activeTrack.versions.find((v) => v.active) ?? activeTrack.versions[0]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[720px] flex-col px-6 pb-16 pt-16">
      <div className="mb-8 text-center">
        <div className="mb-3 text-[11px] tracking-[0.32em] text-accent">
          A PRIVATE MIX FROM SAM STERK AUDIO
        </div>
        <div className="font-display text-5xl font-black leading-none">
          {invite.release?.title ?? "Untitled"}
        </div>
        <div className="mt-2 text-sm tracking-wide text-muted">{invite.release?.artist}</div>
      </div>

      {token && activeTrack && activeVersion && (
        <div className="mb-2">
          <Player
            track={activeTrack}
            streamUrl={api.inviteStreamUrl(token, activeVersion.id)}
            peaksUrl={api.invitePeaksUrl(token, activeVersion.id)}
            onFirstPlay={() => api.logAnonymousListen(token, activeTrack.id).catch(() => {})}
          />
        </div>
      )}

      {detail && detail.tracks.length > 1 && (
        <div className="mb-10 mt-4 flex flex-col gap-1">
          {detail.tracks.map((track) => (
            <div
              key={track.id}
              onClick={() => setActiveTrackId(track.id)}
              className={`cursor-pointer border px-4 py-2.5 text-sm ${
                (activeTrack?.id ?? detail.tracks[0]?.id) === track.id
                  ? "border-accent text-cream"
                  : "border-line text-muted hover:border-muted"
              }`}
            >
              <span className="mr-3 font-mono text-xs text-dim">{track.position}</span>
              {track.title}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto border-t border-line pt-8 text-center">
        {sentTo ? (
          <div className="text-sm tracking-wide text-cream">Check {sentTo} for a sign-in link.</div>
        ) : showEmailForm ? (
          <form onSubmit={handleCreateAccount} className="mx-auto flex max-w-[340px] gap-2">
            <input
              type="email"
              required
              autoFocus
              placeholder="YOUR EMAIL"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 border border-line bg-bg2 px-3 py-2.5 text-sm text-cream placeholder:text-dim focus:outline focus:outline-1 focus:outline-accent"
            />
            <button
              type="submit"
              disabled={sending}
              className="cursor-pointer border-none bg-accent px-5 py-2.5 font-display text-sm font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
            >
              {sending ? "…" : "SEND"}
            </button>
          </form>
        ) : (
          <>
            <div className="mb-3 text-xs tracking-wide text-muted">
              Working on more than one project with Sam? Create an account to see everything
              he's shared with you in one place.
            </div>
            <button
              onClick={() => setShowEmailForm(true)}
              className="cursor-pointer border border-line bg-transparent px-6 py-3 font-display text-sm font-bold tracking-[0.14em] text-cream hover:border-accent hover:text-accent"
            >
              CREATE AN ACCOUNT
            </button>
          </>
        )}
      </div>

      <StudioFooter />
    </div>
  );
}

function StudioFooter() {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 pt-4">
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
