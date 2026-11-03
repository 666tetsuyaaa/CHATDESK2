import { Montserrat_400Regular, Montserrat_700Bold } from "@expo-google-fonts/montserrat";
import { useFonts, PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { onboardingStorageKey } from "./onboarding";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ChatProvider } from "../context/ChatContext";
import { ThemeProvider } from "../context/ThemeContext";
import { TicketBadgeProvider } from "../context/TicketBadgeContext";

function RootNavigator() {
  const { currentUser, isLoading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const isAuthScreen =
      pathname === "/login" || pathname === "/register" || pathname === "/forgot-password";

    if (!currentUser && !isAuthScreen) {
      router.replace("/login");
    } else if (currentUser && isAuthScreen) {
      // Only checked at this login->app transition, not enforced as an
      // ongoing invariant - the onboarding screen itself just
      // router.replace("/") when done, no need to re-verify afterward.
      (async () => {
        let needsOnboarding = false;
        try {
          const seen = await AsyncStorage.getItem(onboardingStorageKey(currentUser.user_id));
          needsOnboarding = !seen;
        } catch {
          needsOnboarding = false;
        }
        router.replace(needsOnboarding ? "/onboarding" : "/");
      })();
    }
  }, [currentUser, isLoading, pathname]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // All screens are always declared here - Stack requires every direct
  // child to be a Stack.Screen (wrapping some in a Fragment/conditional
  // silently breaks it, which was the actual bug). Redirecting happens
  // imperatively above via router.replace(), not by adding/removing
  // screens from this list.
  return (
    // ios_from_right gives Android the same smooth slide iOS has by default.
    <Stack screenOptions={{ headerShown: false, animation: "ios_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_700Bold,
    Montserrat_400Regular,
    Montserrat_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ChatProvider>
            <TicketBadgeProvider>
              <RootNavigator />
            </TicketBadgeProvider>
          </ChatProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
