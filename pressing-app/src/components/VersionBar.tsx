import type { ChangeEvent } from "react";
import type { Track } from "../lib/api";

// Lets anyone with the track open A/B between versions (selection here is
// local/client-side — it doesn't touch which version is "active"), and lets
// the owner add a new version, promote one to active, or delete one.
export function VersionBar({
  track,
  selectedVersionId,
  isOwner,
  onSelect,
  onUpload,
  onActivate,
  onDelete,
}: {
  track: Track;
  selectedVersionId: string | undefined;
  isOwner: boolean;
  onSelect: (versionId: string) => void;
  onUpload: (file: File) => void;
  onActivate: (versionId: string) => void;
  onDelete: (versionId: string) => void;
}) {
  if (track.versions.length <= 1 && !isOwner) return null;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) onUpload(e.target.files[0]);
    e.target.value = "";
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {track.versions.map((v) => (
        <div
          key={v.id}
          className={`flex items-center gap-1.5 border px-2.5 py-1 text-[10px] tracking-[0.1em] ${
            v.id === selectedVersionId ? "border-accent text-accent" : "border-line text-muted"
          }`}
        >
          <button
            onClick={() => onSelect(v.id)}
            className="cursor-pointer border-none bg-transparent p-0 font-mono uppercase text-inherit"
          >
            {v.label}
            {v.active ? " · ACTIVE" : ""}
          </button>
          {isOwner && !v.active && (
            <>
              <button
                onClick={() => onActivate(v.id)}
                className="cursor-pointer border-none bg-transparent p-0 font-mono text-dim hover:text-accent"
                title="Make this the default version"
              >
                SET ACTIVE
              </button>
              {track.versions.length > 1 && (
                <button
                  onClick={() => onDelete(v.id)}
                  className="cursor-pointer border-none bg-transparent p-0 font-mono text-dim hover:text-accent"
                  title="Delete this version"
                >
                  ✕
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {isOwner && (
        <label className="cursor-pointer border border-dashed border-line px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-dim hover:border-muted hover:text-cream">
          + ADD VERSION
          <input
            type="file"
            accept=".wav,.aiff,.aif,audio/wav,audio/aiff,audio/x-aiff"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      )}
    </div>
  );
}
