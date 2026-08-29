import { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors } from "../lib/theme";

const BAR_COUNT = 120; // downsampled from the ~2000-bucket peaks JSON — 2000 raw Views would be sluggish on-device

function downsample(peaks: number[], count: number): number[] {
  if (peaks.length <= count) return peaks;
  const bucketSize = peaks.length / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, peaks[j]);
    out.push(max);
  }
  return out;
}

export function Waveform({
  peaksUrl,
  headers,
  progress,
  onSeek,
  markers,
  onSeekToMarker,
}: {
  peaksUrl: string;
  headers?: Record<string, string>;
  progress: number;
  onSeek: (fraction: number) => void;
  /** Comment positions as fractions (0–1) of the track's duration, pinned on the waveform. */
  markers?: number[];
  onSeekToMarker?: (fraction: number) => void;
}) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setBars(null);
    fetch(peaksUrl, { headers })
      .then((r) => r.json())
      .then((peaks: number[]) => setBars(downsample(peaks, BAR_COUNT)))
      .catch(() => setBars(null));
  }, [peaksUrl]);

  function handlePress(e: GestureResponderEvent) {
    if (!width) return;
    const fraction = e.nativeEvent.locationX / width;
    onSeek(Math.min(1, Math.max(0, fraction)));
  }

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (!bars) return <View style={styles.placeholder} onLayout={handleLayout} />;

  const playedBars = Math.floor(progress * bars.length);

  return (
    <View>
      <Pressable style={styles.container} onPress={handlePress} onLayout={handleLayout}>
        {bars.map((amp, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: `${Math.max(amp, 0.02) * 100}%`,
                backgroundColor: i < playedBars ? colors.accent : "rgba(242,234,217,0.25)",
              },
            ]}
          />
        ))}
      </Pressable>
      {!!width &&
        markers?.map((fraction, i) => (
          <Pressable
            key={i}
            style={[styles.markerHit, { left: fraction * width - 9 }]}
            onPress={() => onSeekToMarker?.(fraction)}
            hitSlop={6}
          >
            <View style={styles.markerPin} />
            <View style={styles.markerStem} />
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { height: 80 },
  container: {
    height: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 1.5,
  },
  bar: { flex: 1, minHeight: 2 },
  markerHit: {
    position: "absolute",
    top: 0,
    width: 18,
    height: 80,
    alignItems: "center",
  },
  markerPin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  markerStem: { width: 1.5, flex: 1, backgroundColor: colors.cream, opacity: 0.6 },
});
