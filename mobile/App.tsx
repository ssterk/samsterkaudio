import { useCallback, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, DarkTheme, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts, BarlowCondensed_700Bold, BarlowCondensed_900Black } from "@expo-google-fonts/barlow-condensed";
import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold } from "@expo-google-fonts/barlow";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { setAudioModeAsync } from "expo-audio";
import { colors } from "./src/lib/theme";
import { useSession } from "./src/lib/auth-client";
import { LoginScreen } from "./src/screens/LoginScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { ReleaseDetailScreen } from "./src/screens/ReleaseDetailScreen";
import { InviteScreen } from "./src/screens/InviteScreen";
import { AccountScreen } from "./src/screens/AccountScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});

export type RootStackParamList = {
  Login: undefined;
  Library: undefined;
  ReleaseDetail: { releaseId: string };
  Invite: { token: string };
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Universal Link: tapping a shared samsterkaudio.com/pressing/invite/:token
// link opens straight into the in-app Invite screen if the app's installed
// (see the apple-app-site-association route in worker/src/index.ts and the
// associatedDomains entry in app.json), instead of always falling back to
// the browser.
const linking: LinkingOptions<RootStackParamList> = {
  // "pressing://" is a same-path fallback (e.g. for a QR code) that works
  // without any Apple-side Universal Links validation — useful for testing
  // this routing in the Simulator before the real Team ID/AASA is live.
  prefixes: ["https://samsterkaudio.com", "pressing://"],
  config: {
    screens: {
      Invite: "pressing/invite/:token",
    },
  },
};

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.cream,
    border: colors.line,
    primary: colors.accent,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_900Black,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const { data: session, isPending } = useSession();

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  const onLayout = useCallback(async () => {
    if (fontsLoaded && !isPending) await SplashScreen.hideAsync();
  }, [fontsLoaded, isPending]);

  useEffect(() => {
    onLayout();
  }, [onLayout]);

  if (!fontsLoaded || isPending) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme} linking={linking}>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Library" component={LibraryScreen} />
              <Stack.Screen name="ReleaseDetail" component={ReleaseDetailScreen} />
              <Stack.Screen name="Account" component={AccountScreen} />
            </>
          )}
          {/* Registered regardless of session — a shared link should play
              with no login, whether or not the visitor (or Sam, testing)
              happens to already be signed in. */}
          <Stack.Screen name="Invite" component={InviteScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
