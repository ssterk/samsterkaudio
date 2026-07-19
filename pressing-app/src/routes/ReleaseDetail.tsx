import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type ReleaseDetail as ReleaseDetailType } from "../lib/api";
import { useSession } from "../lib/auth-client";
import { Player, type PlayerHandle } from "../components/Player";
import { Comments } from "../components/Comments";
import { SharePanel } from "../components/SharePanel";
import { ListenActivity } from "../components/ListenActivity";
import { formatDuration } from "../lib/format";

export function ReleaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const isOwner = session?.user.role === "owner";

  const [detail, setDetail] = useState<ReleaseDetailType | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);

  const load = useCallback(() => {
    if (!id) return;
    api.release(id).then(setDetail).catch(() => setDetail(null));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (id) api.markReleaseViewed(id).catch(() => {});
  }, [id]);

  // Poll while anything is still being processed by the queue consumer.
  useEffect(() => {
    const hasPending = detail?.tracks.some((t) =>
      t.versions.some((v) => v.status === "pending" || v.status === "processing"),
    );
    if (!hasPending) return;
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [detail, load]);

  async function handleFiles(files: FileList | File[]) {
    if (!id) return;
    for (const file of Array.from(files)) {
      const { versionId } = await api.createTrack(id, file.name);
      setUploading((u) => ({ ...u, [versionId]: 0 }));
      try {
        await api.uploadTrackVersion(versionId, file, (pct) =>
          setUploading((u) => ({ ...u, [versionId]: pct })),
        );
      } finally {
        setUploading((u) => {
          const next = { ...u };
          delete next[versionId];
          return next;
        });
        load();
      }
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  if (!detail) return null;

  const activeTrack = detail.tracks.find((t) => t.id === activeTrackId) ?? detail.tracks[0];

  return (
    <div className="mx-auto max-w-[1180px] px-9 pb-[150px] pt-9">
      <div className="mb-8 flex items-start justify-between gap-5">
        <div>
          <div className="inline-block border border-accent px-2.5 py-0.5 font-display text-xs font-bold tracking-[0.14em] text-accent">
            {detail.release.type.toUpperCase()}
          </div>
          <div className="mt-3 font-display text-6xl font-black leading-none tracking-[0.02em]">
            {detail.release.title}
          </div>
          <div className="mt-1 text-sm tracking-wide text-muted">{detail.release.artist}</div>
        </div>
        {isOwner && (
          <button
            onClick={() => setShareOpen(true)}
            className="cursor-pointer border border-line bg-transparent px-6 py-3 font-display text-sm font-bold tracking-[0.1em] text-cream hover:border-muted"
          >
            SHARE
          </button>
        )}
      </div>

      {activeTrack && (
        <div className="mb-8">
          <Player
            ref={playerRef}
            track={activeTrack}
            streamUrl={api.streamUrl(
              (activeTrack.versions.find((v) => v.active) ?? activeTrack.versions[0])?.id ?? "",
            )}
            peaksUrl={api.peaksUrl(
              (activeTrack.versions.find((v) => v.active) ?? activeTrack.versions[0])?.id ?? "",
            )}
            onFirstPlay={() => api.logListen(activeTrack.id).catch(() => {})}
          />
        </div>
      )}

      <div className="mb-4 font-display text-2xl font-black tracking-[0.03em]">TRACKS</div>
      <div className="mb-8 flex flex-col gap-1">
        {detail.tracks.map((track) => {
          const version = track.versions.find((v) => v.active) ?? track.versions[0];
          return (
            <div
              key={track.id}
              onClick={() => setActiveTrackId(track.id)}
              className={`flex cursor-pointer items-center justify-between border px-4 py-3 ${
                activeTrack?.id === track.id ? "border-accent" : "border-line hover:border-muted"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-6 font-mono text-xs text-dim">{track.position}</div>
                <div className="font-display text-lg font-bold tracking-[0.02em]">{track.title}</div>
              </div>
              <div className="font-mono text-[10px] tracking-[0.1em] text-dim">
                {version && version.status !== "ready"
                  ? version.status.toUpperCase()
                  : track.duration
                    ? formatDuration(track.duration)
                    : ""}
              </div>
            </div>
          );
        })}
        {detail.tracks.length === 0 && (
          <div className="border border-dashed border-line px-8 py-10 text-center font-mono text-xs tracking-wide text-dim">
            NO TRACKS YET
          </div>
        )}
      </div>

      {isOwner && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mb-8 border border-dashed px-8 py-14 text-center ${dragOver ? "border-accent" : "border-line"}`}
        >
          <div className="font-display text-xl font-black tracking-[0.05em] text-dim">
            DROP WAV / AIFF FILES HERE
          </div>
          <label className="mt-4 inline-block cursor-pointer font-display text-sm font-bold tracking-[0.12em] text-accent">
            OR BROWSE
            <input
              type="file"
              multiple
              accept=".wav,.aiff,.aif,audio/wav,audio/aiff,audio/x-aiff"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
          {Object.entries(uploading).map(([versionId, pct]) => (
            <div key={versionId} className="mt-3 font-mono text-[10px] text-dim">
              UPLOADING… {pct}%
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div className="mb-8">
          <ListenActivity releaseId={detail.release.id} />
        </div>
      )}

      {activeTrack && <Comments trackId={activeTrack.id} playerRef={playerRef} />}

      {shareOpen && <SharePanel releaseId={detail.release.id} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
