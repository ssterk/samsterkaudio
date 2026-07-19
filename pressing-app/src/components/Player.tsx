import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Waveform } from "./Waveform";
import type { Track } from "../lib/api";
import { formatDuration } from "../lib/format";

export type PlayerHandle = {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
};

// Auth-agnostic: the caller supplies the stream/peaks URLs and an optional
// first-play hook, so the same component works both for logged-in playback
// (session-cookie-gated URLs) and anonymous link playback (invite-token-
// scoped URLs) without knowing which one it's in.
export const Player = forwardRef<
  PlayerHandle,
  { track: Track; streamUrl: string; peaksUrl: string; onFirstPlay?: () => void }
>(function Player({ track, streamUrl, peaksUrl, onFirstPlay }, ref) {
  const activeVersion = track.versions.find((v) => v.active) ?? track.versions[0];
  const audioRef = useRef<HTMLAudioElement>(null);
  const loggedListenRef = useRef(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = seconds;
      audio.play();
    },
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
  }));

  useEffect(() => {
    setPeaks(null);
    setProgress(0);
    setPlaying(false);
    loggedListenRef.current = false;
    if (!activeVersion || activeVersion.status !== "ready") return;
    fetch(peaksUrl, { credentials: "include" })
      .then((r) => r.json())
      .then(setPeaks)
      .catch(() => setPeaks(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersion?.id, activeVersion?.status]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function handlePlay() {
    setPlaying(true);
    // Once per track per time it's loaded into the player — not once per
    // play/pause toggle within the same listening session.
    if (!loggedListenRef.current) {
      loggedListenRef.current = true;
      onFirstPlay?.();
    }
  }

  function handleSeek(fraction: number) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = fraction * audio.duration;
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress(audio.currentTime / audio.duration);
    setCurrentTime(audio.currentTime);
  }

  if (!activeVersion || activeVersion.status !== "ready") {
    return (
      <div className="border border-line bg-bg2 p-6 text-center font-mono text-xs tracking-wide text-dim">
        {activeVersion?.status === "failed" ? "PROCESSING FAILED" : "PROCESSING…"}
      </div>
    );
  }

  return (
    <div className="border border-line bg-bg2 p-5">
      <div className="mb-3 flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-accent font-display text-lg font-black text-bg"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div>
          <div className="font-display text-xl font-black tracking-[0.02em]">{track.title}</div>
          <div className="font-mono text-[10px] text-dim">
            {formatDuration(currentTime)}
            {track.duration ? ` / ${formatDuration(track.duration)}` : ""}
          </div>
        </div>
      </div>
      {peaks && <Waveform peaks={peaks} progress={progress} onSeek={handleSeek} />}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={streamUrl}
        preload="metadata"
        onPlay={handlePlay}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
});
