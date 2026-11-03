import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PressableScale } from "../components/pressable-scale";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemePalette } from "../theme/colors";

export default function SettingsScreen() {
  const { colors, isDark, toggleDarkMode } = useTheme();
  const { currentUser, logout } = useAuth();
  const styles = createStyles(colors);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.accentText} />
        </PressableScale>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>Account</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Signed in as</Text>
            <Text style={styles.rowDescription}>{currentUser?.email}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Appearance</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Dark Mode</Text>
            <Text style={styles.rowDescription}>Switch ChatDesk to a dark color scheme.</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleDarkMode}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.white}
            accessibilityLabel="Dark Mode"
          />
        </View>

        <Text style={styles.sectionHeading}>About</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>App Version</Text>
          </View>
          <Text style={styles.rowValue}>{appVersion}</Text>
        </View>

        <PressableScale style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
          <Text style={styles.logoutText}>{isLoggingOut ? "Logging out..." : "Log Out"}</Text>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    title: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", color: colors.accentText },
    content: { paddingBottom: 32 },
    sectionHeading: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowText: { flex: 1, marginRight: 12 },
    rowLabel: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    rowDescription: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    rowValue: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
    },
    logoutButton: {
      marginHorizontal: 20,
      marginTop: 28,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    logoutText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: colors.textPrimary },
  });