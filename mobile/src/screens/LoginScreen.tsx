import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { authClient } from "../lib/auth-client";
import { colors, fonts } from "../lib/theme";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) setError(error.message ?? "Sign in failed");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.eyebrow}>
        SAM STERK <Text style={{ color: colors.accent }}>AUDIO</Text>
      </Text>
      <Text style={styles.title}>PRESSING</Text>
      <Text style={styles.subtitle}>PRIVATE PRESS · NO PUBLIC ACCESS</Text>

      <View style={styles.form}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="EMAIL"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="PASSWORD"
          placeholderTextColor={colors.dim}
          secureTextEntry
          autoComplete="current-password"
          style={styles.input}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "SIGNING IN…" : "SIGN IN"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  eyebrow: {
    fontFamily: fonts.displayBold,
    fontSize: 13,
    letterSpacing: 3,
    color: colors.cream,
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.cream,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.muted,
    marginTop: 10,
    marginBottom: 40,
  },
  form: {
    width: "100%",
    maxWidth: 340,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    color: colors.cream,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 1,
  },
  error: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.body,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: 2,
    color: colors.bg,
  },
});
