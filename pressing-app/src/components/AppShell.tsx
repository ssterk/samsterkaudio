import { Outlet, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client";

export function AppShell() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  const initials = (session?.user.name || session?.user.email || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <nav className="sticky top-0 z-50 flex h-[68px] items-center justify-between border-b border-line bg-bg/96 px-9 backdrop-blur-md">
        <div className="flex items-baseline gap-9">
          <div
            className="flex cursor-pointer items-baseline gap-3"
            onClick={() => navigate("/")}
            title="Sam Sterk Audio"
          >
            <span className="font-display text-sm font-bold tracking-[0.12em] text-muted">
              SAM STERK<span className="text-accent">&nbsp;AUDIO</span>
            </span>
            <span className="text-line">/</span>
            <span className="font-display text-[28px] font-black tracking-[0.06em]">PRESSING</span>
          </div>
          <div className="flex gap-6">
            <div
              onClick={() => navigate("/")}
              className="cursor-pointer border-b-2 border-accent pb-1 font-display text-base font-bold tracking-[0.14em] text-cream"
            >
              LIBRARY
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://samsterkaudio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.08em] text-dim hover:text-accent"
          >
            SAMSTERKAUDIO.COM →
          </a>
          <div className="h-3 w-px bg-line" />
          <div className="font-mono text-[10px] tracking-[0.08em] text-dim">
            MASTER · SELF-HOSTED
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-accent font-display text-sm font-black text-bg"
          >
            {initials}
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
