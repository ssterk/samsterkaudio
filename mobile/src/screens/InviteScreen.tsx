import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { api, type InviteInfo, type ReleaseDetail } from "../lib/api";
import { authClient, useSession } from "../lib/auth-client";
import { Player } from "../components/Player";
import { colors, fonts } from "../lib/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Invite">;

// The mobile counterpart to the web's AcceptInvite.tsx: plays immediately via
// the same public, no-login invite endpoints, with an optional account
// upsell. Reachable via Universal Link (samsterkaudio.com/pressing/invite/:token)
// whether or not the visitor is signed in.
export function InviteScreen({ route }: Props) {
  const { token } = route.params;
  const { data: session } = useSession();

  const [invite, setInvite] = useState<InviteInfo | "expired" | null>(null);
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);

  const [step, setStep] = useState<"idle" | "email" | "code" | "done">("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .invite(token)
      .then(setInvite)
      .catch(() => setInvite("expired"));
    api
      .inviteTracks(token)
      .then(setDetail)
      .catch(() => {});
  }, [token]);

  // Already signed in (e.g. reopening a link you previously converted, or
  // tapping a new one while logged in) — just add it to the account
  // silently, no need to show the create-account flow.
  useEffect(() => {
    if (session) api.acceptInvite(token).catch(() => {});
  }, [session, token]);

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't send the code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    setBusy(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({ email, otp: code });
      if (signInError) throw new Error(signInError.message ?? "invalid code");
      await api.acceptInvite(token);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "invalid code");
    } finally {
      setBusy(false);
    }
  }

  if (invite === null) return null;

  if (invite === "expired") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.expired}>LINK NOT FOUND OR NO LONGER AVAILABLE</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeTrack = detail?.tracks[0];
  const activeVersion = activeTrack && (activeTrack.versions.find((v) => v.active) ?? activeTrack.versions[0]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>A PRIVATE MIX FROM SAM STERK AUDIO</Text>
            <Text style={styles.title}>{invite.release?.title ?? "Untitled"}</Text>
            <Text style={styles.artist}>{invite.release?.artist}</Text>
          </View>

          {activeTrack && activeVersion && (
            <Player
              track={activeTrack}
              artist={invite.release?.artist ?? ""}
              streamUrl={api.inviteStreamUrl(token, activeVersion.id)}
              peaksUrl={api.invitePeaksUrl(token, activeVersion.id)}
              onFirstPlay={() => api.logAnonymousListen(token, activeTrack.id).catch(() => {})}
            />
          )}

          {detail && detail.tracks.length > 1 && (
            <View style={styles.trackList}>
              {detail.tracks.map((track) => (
                <View key={track.id} style={styles.trackRow}>
                  <Text style={styles.trackPosition}>{track.position}</Text>
                  <Text style={styles.trackTitle}>{track.title}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.footer}>
            {session ? null : step === "done" ? (
              <Text style={styles.doneText}>Signed in — this is saved to your account.</Text>
            ) : step === "code" ? (
              <View style={styles.form}>
                <Text style={styles.helper}>Enter the code sent to {email}</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="CODE"
                  placeholderTextColor={colors.dim}
                  keyboardType="number-pad"
                  autoFocus
                  style={styles.input}
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity style={styles.button} onPress={handleVerifyCode} disabled={busy}>
                  <Text style={styles.buttonText}>{busy ? "…" : "VERIFY"}</Text>
                </TouchableOpacity>
              </View>
            ) : step === "email" ? (
              <View style={styles.form}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="YOUR EMAIL"
                  placeholderTextColor={colors.dim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  style={styles.input}
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={busy || !email}>
                  <Text style={styles.buttonText}>{busy ? "…" : "SEND CODE"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.helper}>
                  Working on more than one project with Sam? Create an account to see everything
                  he's shared with you in one place.
                </Text>
                <TouchableOpacity style={styles.outlineButton} onPress={() => setStep("email")}>
                  <Text style={styles.outlineButtonText}>CREATE AN ACCOUNT</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => Linking.openURL("https://samsterkaudio.com")} style={styles.brand}>
              <Text style={styles.brandText}>
                Sam Sterk<Text style={{ color: colors.accent }}> Audio</Text>
              </Text>
              <Text style={styles.brandLink}>HEAR MORE OF THE WORK →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  expired: { fontFamily: fonts.display, fontSize: 24, color: colors.dim, textAlign: "center" },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { alignItems: "center", marginBottom: 24 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.accent, marginBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.cream, textAlign: "center", lineHeight: 44 },
  artist: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 4 },
  trackList: { marginTop: 16, gap: 4 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  trackPosition: { fontFamily: fonts.mono, fontSize: 11, color: colors.dim },
  trackTitle: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.cream },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 24, alignItems: "center" },
  helper: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 12 },
  doneText: { fontFamily: fonts.body, fontSize: 14, color: colors.cream, textAlign: "center" },
  form: { width: "100%", maxWidth: 340, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    color: colors.cream,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.accent },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1, color: colors.bg },
  outlineButton: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 24, paddingVertical: 12 },
  outlineButtonText: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1, color: colors.cream },
  brand: { marginTop: 28, alignItems: "center", gap: 4 },
  brandText: { fontFamily: fonts.display, fontSize: 20, color: colors.cream },
  brandLink: { fontFamily: fonts.displayBold, fontSize: 11, letterSpacing: 1, color: colors.accent, marginTop: 4 },
});
