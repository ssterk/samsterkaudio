import { useCallback, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
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

SplashScreen.preventAutoHideAsync().catch(() => {});

export type RootStackParamList = {
  Login: undefined;
  Library: undefined;
  ReleaseDetail: { releaseId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Library" component={LibraryScreen} />
            <Stack.Screen name="ReleaseDetail" component={ReleaseDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
