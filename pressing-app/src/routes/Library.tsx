import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Release } from "../lib/api";
import { useSession } from "../lib/auth-client";

export function Library() {
  const { data: session } = useSession();
  const isOwner = session?.user.role === "owner";
  const navigate = useNavigate();

  const [releases, setReleases] = useState<Release[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [type, setType] = useState<"single" | "ep" | "lp">("single");
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .releases()
      .then((r) => setReleases(r.releases))
      .catch(() => setReleases([]));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { id } = await api.createRelease({ title, artist, type });
      navigate(`/releases/${id}`);
    } finally {
      setCreating(false);
    }
  }

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
        {isOwner && (
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/import")}
              className="cursor-pointer border border-line bg-transparent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-cream hover:border-muted"
            >
              IMPORT FROM DROPBOX
            </button>
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="cursor-pointer border-none bg-accent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-bg hover:bg-accent-hover"
            >
              {formOpen ? "CANCEL" : "NEW RELEASE"}
            </button>
          </div>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="mb-8 flex flex-wrap items-end gap-3 border border-line bg-bg2 p-5"
        >
          <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
            <label className="text-[10px] tracking-[0.14em] text-muted">TITLE</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border border-line bg-bg px-3 py-2.5 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
            <label className="text-[10px] tracking-[0.14em] text-muted">ARTIST</label>
            <input
              required
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="border border-line bg-bg px-3 py-2.5 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] tracking-[0.14em] text-muted">TYPE</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "single" | "ep" | "lp")}
              className="border border-line bg-bg px-3 py-2.5 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
            >
              <option value="single">SINGLE</option>
              <option value="ep">EP</option>
              <option value="lp">LP</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="cursor-pointer border-none bg-accent px-6 py-2.5 font-display text-sm font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {creating ? "CREATING…" : "CREATE"}
          </button>
        </form>
      )}

      {releases !== null && releases.length === 0 && (
        <div className="border border-dashed border-line px-8 py-[90px] text-center">
          <div className="font-display text-[34px] font-black tracking-[0.08em] text-dim">
            NOTHING ON THE PLATTER YET
          </div>
          <div className="mt-2.5 text-xs tracking-[0.18em] text-dim">
            {isOwner ? "CREATE A RELEASE TO GET STARTED" : "RELEASES YOU'RE INVITED TO WILL SHOW UP HERE"}
          </div>
        </div>
      )}

      {releases !== null && releases.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
          {releases.map((release) => (
            <div
              key={release.id}
              onClick={() => navigate(`/releases/${release.id}`)}
              className="cursor-pointer border border-line bg-bg2 hover:border-muted"
            >
              <div className="relative flex aspect-square items-center justify-center border-b border-line">
                <div className="font-display text-7xl font-black tracking-[0.05em] text-cream/85">
                  {release.title.slice(0, 2).toUpperCase()}
                </div>
                {!!release.unreadCount && (
                  <div className="absolute right-2.5 top-2.5 bg-accent px-2 py-0.5 font-mono text-[11px] font-medium text-bg">
                    {release.unreadCount} NEW
                  </div>
                )}
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
