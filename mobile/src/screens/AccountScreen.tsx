import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { authClient, useSession } from "../lib/auth-client";
import { colors, fonts } from "../lib/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Account">;

export function AccountScreen({ navigation }: Props) {
  const { data: session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function performDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { error: deleteError } = await authClient.deleteUser();
      if (deleteError) throw new Error(deleteError.message ?? "couldn't delete account");
      // Session clears automatically; App.tsx's session check falls back to Login.
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}. Try signing out and back in, then delete again.`
          : "couldn't delete account",
      );
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your account, comments, and listening history. Releases shared with you will no longer be accessible from an account — the original link will still work. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← LIBRARY</Text>
      </TouchableOpacity>

      <Text style={styles.title}>ACCOUNT</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.section}>
        <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete} disabled={deleting}>
          <Text style={styles.deleteButtonText}>{deleting ? "DELETING…" : "DELETE MY ACCOUNT"}</Text>
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  back: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1.5, color: colors.muted, marginBottom: 20 },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.cream, letterSpacing: 1 },
  email: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 40 },
  section: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 24, gap: 10 },
  deleteButton: { borderWidth: 1, borderColor: colors.accent, paddingVertical: 14, alignItems: "center" },
  deleteButtonText: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1.5, color: colors.accent },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.accent, textAlign: "center" },
});
