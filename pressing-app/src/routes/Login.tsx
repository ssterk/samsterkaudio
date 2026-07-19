import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Sign in failed");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-10">
      <div className="mb-7 flex items-center gap-6">
        <Reel duration="9s" />
        <Reel duration="6s" />
      </div>
      <div className="font-display text-[84px] font-black leading-none tracking-[0.06em]">
        PRESSING
      </div>
      <div className="mb-11 mt-2.5 text-[11px] tracking-[0.32em] text-muted">
        PRIVATE PRESS · NO PUBLIC ACCESS
      </div>
      <form onSubmit={handleSubmit} className="flex w-[340px] flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="EMAIL"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-line bg-bg2 px-4 py-3.5 font-body text-[13px] tracking-[0.08em] text-cream placeholder:text-dim focus:outline focus:outline-1 focus:outline-accent"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-line bg-bg2 px-4 py-3.5 font-body text-[13px] tracking-[0.08em] text-cream placeholder:text-dim focus:outline focus:outline-1 focus:outline-accent"
        />
        {error && (
          <div className="text-xs tracking-wide text-accent">{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="cursor-pointer border-none bg-accent py-3.5 font-display text-lg font-black tracking-[0.12em] text-bg hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </form>
      <div className="mt-16 font-mono text-[10px] tracking-[0.1em] text-dim">
        44.1kHz / 24-BIT · MASTER COPY · DO NOT DUPLICATE
      </div>
      <a
        href="https://samsterkaudio.com"
        className="mt-6 font-mono text-[10px] tracking-[0.1em] text-dim hover:text-accent"
      >
        ← SAMSTERKAUDIO.COM
      </a>
    </div>
  );
}

function Reel({ duration }: { duration: string }) {
  return (
    <div
      className="flex h-[54px] w-[54px] animate-spin items-center justify-center rounded-full border-2 border-line"
      style={{ animationDuration: duration }}
    >
      <div className="h-4 w-4 rounded-full border-2 border-accent" />
    </div>
  );
}
