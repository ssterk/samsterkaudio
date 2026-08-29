import { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Waveform } from "./Waveform";
import type { Track } from "../lib/api";
import { colors, fonts } from "../lib/theme";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Drawn, not glyph-based — the Unicode ▶/❚❚ characters used earlier weren't
// in any loaded font and rendered as missing-glyph boxes on-device.
function PlayIcon() {
  return <View style={styles.playTriangle} />;
}
function PauseIcon() {
  return (
    <View style={styles.pauseBars}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}

// Auth-agnostic, like the web Player: the caller supplies ready-to-fetch
// URLs (and optional headers), so the same component serves both the
// authenticated release screen and the public, no-login invite screen.
export function Player({
  track,
  artist,
  streamUrl,
  peaksUrl,
  headers,
  onFirstPlay,
  markers,
}: {
  track: Track;
  artist: string;
  streamUrl: string;
  peaksUrl: string;
  headers?: Record<string, string>;
  onFirstPlay?: () => void;
  /** Comment positions as fractions (0–1) of the track's duration, pinned on the waveform. */
  markers?: number[];
}) {
  const activeVersion = track.versions.find((v) => v.active) ?? track.versions[0];
  const ready = activeVersion?.status === "ready" && !!activeVersion.streamKey;

  const player = useAudioPlayer(ready ? { uri: streamUrl, headers } : null);
  const status = useAudioPlayerStatus(player);
  const loggedRef = useRef(false);

  useEffect(() => {
    loggedRef.current = false;
  }, [activeVersion?.id]);

  useEffect(() => {
    if (status.playing && !loggedRef.current) {
      loggedRef.current = true;
      onFirstPlay?.();
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist,
        artworkUrl: undefined,
      });
    }
  }, [status.playing, track.title, artist, player, onFirstPlay]);

  function togglePlay() {
    if (status.playing) player.pause();
    else player.play();
  }

  function handleSeek(fraction: number) {
    if (!status.duration) return;
    player.seekTo(fraction * status.duration);
  }

  if (!ready) {
    return (
      <View style={styles.container}>
        <Text style={styles.pending}>
          {activeVersion?.status === "failed" ? "PROCESSING FAILED" : "PROCESSING…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay} activeOpacity={0.8}>
          {status.playing ? <PauseIcon /> : <PlayIcon />}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.time}>
            {formatDuration(status.currentTime)}
            {status.duration ? ` / ${formatDuration(status.duration)}` : ""}
          </Text>
        </View>
      </View>
      <Waveform
        peaksUrl={peaksUrl}
        headers={headers}
        progress={status.duration ? status.currentTime / status.duration : 0}
        onSeek={handleSeek}
        markers={markers}
        onSeekToMarker={handleSeek}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2, padding: 18 },
  pending: { fontFamily: fonts.mono, fontSize: 12, color: colors.dim, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 17,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.bg,
    marginLeft: 4,
  },
  pauseBars: { flexDirection: "row", gap: 5 },
  pauseBar: { width: 5, height: 18, backgroundColor: colors.bg },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  time: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim, marginTop: 3, letterSpacing: 0.5 },
});
