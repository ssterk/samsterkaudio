import { useEffect, useState } from "react";
import { api, type Release } from "../lib/api";

export function Library() {
  const [releases, setReleases] = useState<Release[] | null>(null);

  useEffect(() => {
    api
      .releases()
      .then((r) => setReleases(r.releases))
      .catch(() => setReleases([]));
  }, []);

  return (
    <div className="mx-auto max-w-[1280px] px-9 pb-[150px] pt-9">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="font-display text-[56px] font-black leading-none tracking-[0.03em]">
            LIBRARY
          </div>
          <div className="mt-2 text-[11px] tracking-[0.22em] text-muted">
            SORTED BY RECENTLY UPDATED
          </div>
        </div>
      </div>

      {releases !== null && releases.length === 0 && (
        <div className="border border-dashed border-line px-8 py-[90px] text-center">
          <div className="font-display text-[34px] font-black tracking-[0.08em] text-dim">
            NOTHING ON THE PLATTER YET
          </div>
          <div className="mt-2.5 text-xs tracking-[0.18em] text-dim">
            RELEASES YOU IMPORT WILL SHOW UP HERE
          </div>
        </div>
      )}

      {releases !== null && releases.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
          {releases.map((release) => (
            <div
              key={release.id}
              className="border border-line bg-bg2 hover:border-muted"
            >
              <div className="relative flex aspect-square items-center justify-center border-b border-line">
                <div className="font-display text-7xl font-black tracking-[0.05em] text-cream/85">
                  {release.title.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="p-4">
                <div className="font-display text-2xl font-black tracking-[0.03em]">
                  {release.title}
                </div>
                <div className="mt-0.5 text-xs tracking-[0.06em] text-muted">
                  {release.artist}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
