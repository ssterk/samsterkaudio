import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DropboxFile, type Release } from "../lib/api";
import { formatRelativeTime } from "../lib/format";

type SelectedTrack = DropboxFile;

export function ImportDropbox() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [path, setPath] = useState("");
  const [folders, setFolders] = useState<{ name: string; path: string }[]>([]);
  const [audioFiles, setAudioFiles] = useState<DropboxFile[]>([]);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [artworkCandidate, setArtworkCandidate] = useState<DropboxFile | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<SelectedTrack[]>([]);
  const [useArtwork, setUseArtwork] = useState(true);
  const [releases, setReleases] = useState<Release[]>([]);
  const [targetReleaseId, setTargetReleaseId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [type, setType] = useState<"single" | "ep" | "lp">("ep");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    api.dropboxStatus().then((s) => {
      setConnected(s.connected);
      setEmail(s.email);
    });
    api.releases().then((r) => setReleases(r.releases));
  }, []);

  function browse(newPath: string) {
    setLoading(true);
    setBrowseError(null);
    api
      .dropboxBrowse(newPath)
      .then((r) => {
        setPath(newPath);
        setFolders(r.folders);
        setAudioFiles(r.audioFiles);
        setCheckedPaths(new Set(r.audioFiles.map((f) => f.path))); // select all by default
        setArtworkCandidate(r.artworkCandidate);
      })
      .catch((e: Error) => setBrowseError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (connected) browse("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function toggleChecked(filePath: string) {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }

  function startConfirm() {
    setSelectedTracks(audioFiles.filter((f) => checkedPaths.has(f.path)));
    const folderName = path.split("/").filter(Boolean).pop() ?? "";
    setTitle(folderName);
    setConfirming(true);
  }

  function moveTrack(index: number, dir: -1 | 1) {
    setSelectedTracks((tracks) => {
      const next = [...tracks];
      const target = index + dir;
      if (target < 0 || target >= next.length) return tracks;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeTrack(index: number) {
    setSelectedTracks((tracks) => tracks.filter((_, i) => i !== index));
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const { releaseId } = await api.dropboxImport({
        releaseId: targetReleaseId || undefined,
        title: targetReleaseId ? undefined : title,
        artist: targetReleaseId ? undefined : artist,
        type: targetReleaseId ? undefined : type,
        tracks: selectedTracks.map((t) => ({ name: t.name, path: t.path })),
        artworkPath: useArtwork ? (artworkCandidate?.path ?? undefined) : undefined,
      });
      navigate(`/releases/${releaseId}`);
    } catch (e) {
      setImportError((e as Error).message);
      setImporting(false);
    }
  }

  if (connected === null) return null;

  if (!connected) {
    return (
      <div className="mx-auto max-w-[600px] px-9 pb-[150px] pt-24 text-center">
        <div className="font-display text-4xl font-black tracking-[0.03em]">CONNECT DROPBOX</div>
        <div className="mt-3 text-sm tracking-wide text-muted">
          Pressing imports audio and artwork directly from a Dropbox folder you pick. Files are copied
          into storage once on import — playback never depends on Dropbox afterward.
        </div>
        <a
          href="/api/pressing/dropbox/connect"
          className="mt-8 inline-block cursor-pointer border-none bg-accent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-bg hover:bg-accent-hover"
        >
          CONNECT DROPBOX
        </a>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="mx-auto max-w-[820px] px-9 pb-[150px] pt-9">
        <div className="mb-6 font-display text-4xl font-black tracking-[0.03em]">CONFIRM IMPORT</div>

        <div className="mb-6 flex flex-col gap-1.5">
          <label className="text-[10px] tracking-[0.14em] text-muted">DESTINATION</label>
          <select
            value={targetReleaseId}
            onChange={(e) => setTargetReleaseId(e.target.value)}
            className="border border-line bg-bg2 px-3 py-2.5 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
          >
            <option value="">NEW RELEASE</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                ADD TO: {r.title} — {r.artist}
              </option>
            ))}
          </select>
        </div>

        {!targetReleaseId && (
          <div className="mb-6 flex flex-wrap items-end gap-3 border border-line bg-bg2 p-5">
            <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
              <label className="text-[10px] tracking-[0.14em] text-muted">TITLE</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border border-line bg-bg px-3 py-2.5 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
              <label className="text-[10px] tracking-[0.14em] text-muted">ARTIST</label>
              <input
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
          </div>
        )}

        {artworkCandidate && (
          <label className="mb-6 flex items-center gap-2 text-xs tracking-wide text-muted">
            <input type="checkbox" checked={useArtwork} onChange={(e) => setUseArtwork(e.target.checked)} />
            USE {artworkCandidate.name.toUpperCase()} AS ARTWORK
          </label>
        )}

        <div className="mb-2 font-display text-xl font-black tracking-[0.03em]">
          TRACKS ({selectedTracks.length})
        </div>
        <div className="mb-8 flex flex-col gap-1">
          {selectedTracks.map((track, i) => (
            <div key={track.path} className="flex items-center justify-between border border-line px-4 py-2.5">
              <div className="flex items-center gap-4">
                <div className="w-6 font-mono text-xs text-dim">{i + 1}</div>
                <div className="text-sm">{track.name}</div>
              </div>
              <div className="flex gap-3 font-mono text-xs text-dim">
                <button onClick={() => moveTrack(i, -1)} className="cursor-pointer border-none bg-transparent text-dim hover:text-cream">
                  ↑
                </button>
                <button onClick={() => moveTrack(i, 1)} className="cursor-pointer border-none bg-transparent text-dim hover:text-cream">
                  ↓
                </button>
                <button onClick={() => removeTrack(i)} className="cursor-pointer border-none bg-transparent text-dim hover:text-accent">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {importError && <div className="mb-4 text-xs tracking-wide text-accent">{importError}</div>}

        <div className="flex gap-3">
          <button
            onClick={() => setConfirming(false)}
            className="cursor-pointer border border-line bg-transparent px-6 py-3.5 font-display text-sm font-bold tracking-[0.1em] text-cream hover:border-muted"
          >
            BACK
          </button>
          <button
            onClick={handleImport}
            disabled={importing || selectedTracks.length === 0}
            className="cursor-pointer border-none bg-accent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {importing ? "IMPORTING…" : "IMPORT"}
          </button>
        </div>
      </div>
    );
  }

  const segments = path.split("/").filter(Boolean);

  return (
    <div className="mx-auto max-w-[820px] px-9 pb-[150px] pt-9">
      <div className="mb-1 flex items-center justify-between">
        <div className="font-display text-4xl font-black tracking-[0.03em]">IMPORT FROM DROPBOX</div>
        <button
          onClick={() => api.dropboxDisconnect().then(() => setConnected(false))}
          className="cursor-pointer border-none bg-transparent font-mono text-[10px] tracking-[0.1em] text-dim hover:text-cream"
        >
          DISCONNECT {email ? `(${email})` : ""}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs tracking-wide text-muted">
        <span className="cursor-pointer hover:text-cream" onClick={() => browse("")}>
          DROPBOX
        </span>
        {segments.map((seg, i) => (
          <span key={i}>
            <span className="mx-1">/</span>
            <span
              className="cursor-pointer hover:text-cream"
              onClick={() => browse("/" + segments.slice(0, i + 1).join("/"))}
            >
              {seg}
            </span>
          </span>
        ))}
      </div>

      {browseError && <div className="mb-4 text-xs tracking-wide text-accent">{browseError}</div>}
      {loading && <div className="mb-4 font-mono text-xs text-dim">LOADING…</div>}

      <div className="mb-8 flex flex-col gap-1">
        {folders.map((folder) => (
          <div
            key={folder.path}
            onClick={() => browse(folder.path)}
            className="cursor-pointer border border-line px-4 py-2.5 text-sm hover:border-muted"
          >
            📁 {folder.name}
          </div>
        ))}
        {!loading && folders.length === 0 && audioFiles.length === 0 && (
          <div className="border border-dashed border-line px-8 py-10 text-center font-mono text-xs tracking-wide text-dim">
            NOTHING HERE
          </div>
        )}
      </div>

      {audioFiles.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-xl font-black tracking-[0.03em]">
              AUDIO FILES ({audioFiles.length})
            </div>
            <div className="flex gap-3 font-mono text-[10px] tracking-[0.1em] text-dim">
              <button
                onClick={() => setCheckedPaths(new Set(audioFiles.map((f) => f.path)))}
                className="cursor-pointer border-none bg-transparent text-dim hover:text-cream"
              >
                SELECT ALL
              </button>
              <button
                onClick={() => setCheckedPaths(new Set())}
                className="cursor-pointer border-none bg-transparent text-dim hover:text-cream"
              >
                SELECT NONE
              </button>
            </div>
          </div>
          <div className="mb-8 flex flex-col gap-1">
            {audioFiles.map((f) => (
              <label
                key={f.path}
                className="flex cursor-pointer items-center justify-between gap-3 border border-line px-4 py-2.5 text-sm text-muted hover:border-muted"
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checkedPaths.has(f.path)}
                    onChange={() => toggleChecked(f.path)}
                  />
                  {f.name}
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em] text-dim">
                  {formatRelativeTime(f.modifiedAt)}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={startConfirm}
            disabled={checkedPaths.size === 0}
            className="cursor-pointer border-none bg-accent px-6 py-3.5 font-display text-lg font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            IMPORT SELECTED ({checkedPaths.size})
          </button>
        </>
      )}
    </div>
  );
}
