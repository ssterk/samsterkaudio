import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { api, type Release } from "../lib/api";
import { signOut } from "../lib/auth-client";
import { colors, fonts } from "../lib/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

export function LibraryScreen({ navigation }: Props) {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api
      .releases()
      .then((r) => setReleases(r.releases))
      .catch(() => setReleases([]));
  }, []);

  useFocusEffect(load);

  async function handleRefresh() {
    setRefreshing(true);
    await api.releases().then((r) => setReleases(r.releases)).catch(() => {});
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>
            SAM STERK <Text style={{ color: colors.accent }}>AUDIO</Text>
          </Text>
          <Text style={styles.title}>LIBRARY</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate("Account")}>
            <Text style={styles.signOut}>ACCOUNT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut()}>
            <Text style={styles.signOut}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={releases ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.muted} />}
        ListEmptyComponent={
          releases !== null ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>NOTHING ON THE PLATTER YET</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("ReleaseDetail", { releaseId: item.id })}
          >
            <View style={styles.cardArt}>
              <Text style={styles.cardInitials}>{item.title.slice(0, 2).toUpperCase()}</Text>
              {!!item.unreadCount && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unreadCount} NEW</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardArtist}>{item.artist}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  brand: {
    fontFamily: fonts.displayBold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.muted,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.cream,
    letterSpacing: 1,
  },
  signOut: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.dim,
  },
  list: { padding: 16, gap: 16 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    padding: 48,
    alignItems: "center",
    marginTop: 40,
  },
  emptyText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.dim,
    letterSpacing: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    marginBottom: 16,
  },
  cardArt: {
    aspectRatio: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInitials: {
    fontFamily: fonts.display,
    fontSize: 56,
    color: "rgba(242,234,217,0.85)",
  },
  badge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.bg,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.cream,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  cardArtist: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
});
