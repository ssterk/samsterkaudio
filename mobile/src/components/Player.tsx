import { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Waveform } from "./Waveform";
import { api, authHeaders, type Track } from "../lib/api";
import { colors, fonts } from "../lib/theme";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Player({ track, artist }: { track: Track; artist: string }) {
  const activeVersion = track.versions.find((v) => v.active) ?? track.versions[0];
  const ready = activeVersion?.status === "ready" && !!activeVersion.streamKey;

  const player = useAudioPlayer(
    ready ? { uri: api.streamUrl(activeVersion.id), headers: authHeaders() } : null,
  );
  const status = useAudioPlayerStatus(player);
  const loggedRef = useRef(false);
  const peaksRef = useRef<number[] | null>(null);

  useEffect(() => {
    loggedRef.current = false;
    peaksRef.current = null;
  }, [activeVersion?.id]);

  useEffect(() => {
    if (status.playing && !loggedRef.current) {
      loggedRef.current = true;
      api.logListen(track.id).catch(() => {});
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist,
        artworkUrl: undefined,
      });
    }
  }, [status.playing, track.id, track.title, artist, player]);

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
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>{status.playing ? "❚❚" : "▶"}</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>{track.title}</Text>
          <Text style={styles.time}>
            {formatDuration(status.currentTime)}
            {status.duration ? ` / ${formatDuration(status.duration)}` : ""}
          </Text>
        </View>
      </View>
      <Waveform
        versionId={activeVersion.id}
        progress={status.duration ? status.currentTime / status.duration : 0}
        onSeek={handleSeek}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2, padding: 20 },
  pending: { fontFamily: fonts.mono, fontSize: 12, color: colors.dim, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonText: { fontFamily: fonts.display, fontSize: 18, color: colors.bg },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.cream },
  time: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim, marginTop: 2 },
});
