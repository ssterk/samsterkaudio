import { useEffect, useState } from "react";
import { api, type ListenEvent } from "../lib/api";

export function ListenActivity({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<{ listens: ListenEvent[]; playCounts: Record<string, number> } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !data) {
      api.releaseListens(releaseId).then(setData);
    }
  }, [open, data, releaseId]);

  return (
    <div className="border border-line bg-bg2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-5 py-3.5 text-left"
      >
        <span className="font-display text-sm font-bold tracking-[0.12em] text-cream">
          LISTEN ACTIVITY
        </span>
        <span className="font-mono text-xs text-dim">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-line px-5 py-4">
          {!data && <div className="font-mono text-xs text-dim">LOADING…</div>}
          {data && Object.keys(data.playCounts).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-4">
              {Object.entries(data.playCounts).map(([trackId, count]) => {
                const track = data.listens.find((l) => l.trackId === trackId);
                return (
                  <div key={trackId} className="font-mono text-xs text-muted">
                    <span className="text-cream">{count}</span> plays — {track?.trackTitle}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {data?.listens.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs text-muted">
                <span>
                  <span className="text-cream">{l.name || l.email}</span>
                  {l.anonymous && <span className="ml-1 text-dim">(link only)</span>} listened to{" "}
                  <span className="text-cream">{l.trackTitle}</span>
                </span>
                <span className="font-mono text-[10px] text-dim">{new Date(l.listenedAt).toLocaleString()}</span>
              </div>
            ))}
            {data && data.listens.length === 0 && (
              <div className="font-mono text-xs text-dim">NO PLAYS YET</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
