import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { api, authHeaders, type ReleaseDetail, type Track, type Comment } from "../lib/api";
import { Player } from "../components/Player";
import { colors, fonts } from "../lib/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ReleaseDetail">;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0]];
  return chars.filter(Boolean).join("").toUpperCase();
}

export function ReleaseDetailScreen({ route, navigation }: Props) {
  const { releaseId } = route.params;
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");

  const load = useCallback(() => {
    api.release(releaseId).then(setDetail).catch(() => {});
  }, [releaseId]);

  useEffect(() => {
    load();
    api.markReleaseViewed(releaseId).catch(() => {});
  }, [load, releaseId]);

  // Poll while anything's still being processed.
  useEffect(() => {
    const hasPending = detail?.tracks.some((t) =>
      t.versions.some((v) => v.status === "pending" || v.status === "processing"),
    );
    if (!hasPending) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [detail, load]);

  const activeTrack: Track | undefined = detail?.tracks.find((t) => t.id === activeTrackId) ?? detail?.tracks[0];

  const markers =
    activeTrack?.duration
      ? comments
          .filter((c) => !c.parentId && c.timestampMs != null)
          .map((c) => c.timestampMs! / 1000 / activeTrack.duration!)
      : undefined;

  const loadComments = useCallback(() => {
    if (!activeTrack) return;
    api.comments(activeTrack.id).then((r) => setComments(r.comments)).catch(() => {});
  }, [activeTrack]);

  useEffect(() => {
    loadComments();
    const timer = setInterval(loadComments, 15_000);
    return () => clearInterval(timer);
  }, [loadComments]);

  async function handlePostComment() {
    if (!activeTrack || !commentBody.trim()) return;
    await api.createComment(activeTrack.id, { body: commentBody.trim() });
    setCommentBody("");
    loadComments();
  }

  if (!detail) return null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={comments.filter((c) => !c.parentId)}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.back}>← LIBRARY</Text>
              </TouchableOpacity>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{detail.release.type.toUpperCase()}</Text>
              </View>
              <Text style={styles.title}>{detail.release.title}</Text>
              <Text style={styles.artist}>{detail.release.artist}</Text>

              {activeTrack &&
                (() => {
                  const activeVersion =
                    activeTrack.versions.find((v) => v.active) ?? activeTrack.versions[0];
                  if (!activeVersion) return null;
                  return (
                    <View style={{ marginTop: 20, marginBottom: 24 }}>
                      <Player
                        track={activeTrack}
                        artist={detail.release.artist}
                        streamUrl={api.streamUrl(activeVersion.id)}
                        peaksUrl={api.peaksUrl(activeVersion.id)}
                        headers={authHeaders()}
                        onFirstPlay={() => api.logListen(activeTrack.id).catch(() => {})}
                        markers={markers}
                      />
                    </View>
                  );
                })()}

              {detail.tracks.length > 1 && (
                <>
                  <Text style={styles.sectionHeading}>TRACKS</Text>
                  {detail.tracks.map((track) => {
                    const v = track.versions.find((v) => v.active) ?? track.versions[0];
                    const isActive = (activeTrack?.id ?? detail.tracks[0]?.id) === track.id;
                    return (
                      <TouchableOpacity
                        key={track.id}
                        style={[styles.trackRow, isActive && styles.trackRowActive]}
                        onPress={() => setActiveTrackId(track.id)}
                      >
                        <Text style={styles.trackPosition}>{track.position}</Text>
                        <Text style={styles.trackTitle}>{track.title}</Text>
                        <Text style={styles.trackMeta}>
                          {v && v.status !== "ready" ? v.status.toUpperCase() : track.duration ? formatDuration(track.duration) : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              <Text style={[styles.sectionHeading, { marginTop: detail.tracks.length > 1 ? 24 : 0 }]}>
                COMMENTS ({comments.filter((c) => !c.parentId).length})
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const author = item.authorName || item.authorEmail;
            return (
              <View style={styles.comment}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(author)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{author}</Text>
                    <Text style={styles.commentTime}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{item.body}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.noComments}>NO COMMENTS YET</Text>}
        />
        <View style={styles.commentForm}>
          <TextInput
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder="LEAVE A COMMENT…"
            placeholderTextColor={colors.dim}
            style={styles.commentInput}
          />
          <TouchableOpacity style={styles.commentSubmit} onPress={handlePostComment}>
            <Text style={styles.commentSubmitText}>POST</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingBottom: 8 },
  back: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1.5, color: colors.muted, marginBottom: 20 },
  typeBadge: {
    borderWidth: 1,
    borderColor: colors.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 10,
  },
  typeBadgeText: { fontFamily: fonts.displayBold, fontSize: 11, letterSpacing: 1.5, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 38, color: colors.cream, lineHeight: 42 },
  artist: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 8 },
  sectionHeading: { fontFamily: fonts.display, fontSize: 18, color: colors.cream, letterSpacing: 1, marginBottom: 8 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
    gap: 12,
  },
  trackRowActive: { borderColor: colors.accent },
  trackPosition: { fontFamily: fonts.mono, fontSize: 11, color: colors.dim, width: 16 },
  trackTitle: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.cream, flex: 1 },
  trackMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim, letterSpacing: 1 },
  comment: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 10, color: colors.accent },
  commentHeader: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  commentAuthor: { fontFamily: fonts.displayBold, fontSize: 12, color: colors.cream },
  commentTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim },
  commentBody: { fontFamily: fonts.body, fontSize: 13, color: colors.cream, lineHeight: 18 },
  noComments: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.dim,
    textAlign: "center",
    paddingVertical: 24,
  },
  commentForm: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    color: colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  commentSubmit: { backgroundColor: colors.accent, paddingHorizontal: 18, justifyContent: "center" },
  commentSubmitText: { fontFamily: fonts.displayBold, fontSize: 12, letterSpacing: 1, color: colors.bg },
});
