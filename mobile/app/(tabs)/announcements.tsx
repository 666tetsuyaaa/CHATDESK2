import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTabBarHeight } from "../../lib/tabBar";
import { NavMenu } from "../../components/nav-menu";
import { PressableScale } from "../../components/pressable-scale";
import { SkeletonAnnouncementCard } from "../../components/skeleton";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getAllPages } from "../../lib/allPages";
import type { ThemePalette } from "../../theme/colors";

type Announcement = {
  announcement_id: number;
  title: string;
  content: string;
  created_by: number;
  created_at: string;
  updated_at: string;
};

const formatDate = (isoString: string) =>
  new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function AnnouncementsScreen() {
  const { currentUser, logout } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const userInitial = currentUser?.first_name?.[0]?.toUpperCase() ?? "?";
  // The tab bar floats over the list - leave room so the last card scrolls above it.
  const tabBarSpace = { paddingBottom: useTabBarHeight() };

  const loadAnnouncements = async () => {
    try {
      setAnnouncements(await getAllPages<Announcement>("/announcements/"));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  };

  // First load. State is set from the request's callback (not directly in
  // the effect), and skipped if the screen unmounted meanwhile.
  useEffect(() => {
    let cancelled = false;
    getAllPages<Announcement>("/announcements/")
      .then((rows) => {
        if (cancelled) return;
        setAnnouncements(rows);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The tab is built right after login (see (tabs)/_layout.tsx), so each
  // time it is opened, refresh quietly - what's already on screen stays
  // there (no loading skeleton) until the new list arrives.
  useFocusEffect(
    useCallback(() => {
      loadAnnouncements();
    }, [])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAnnouncements();
    setIsRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => setIsMenuOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <MaterialIcons name="menu" size={26} color={colors.accentText} />
        </PressableScale>
        <Text style={styles.title}>Announcements</Text>
        <PressableScale
          onPress={() => router.push("/profile")}
          hitSlop={12}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {currentUser?.profile_picture ? (
            <Image source={{ uri: currentUser.profile_picture }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{userInitial}</Text>
          )}
        </PressableScale>
      </View>

      {loadFailed ? (
        <ScrollView
          contentContainerStyle={[styles.centerStateContainer, tabBarSpace]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
        >
          <Text style={styles.centerState}>
            {"Announcements aren't available yet - please check back soon."}
          </Text>
        </ScrollView>
      ) : announcements === null ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2].map((i) => (
            <SkeletonAnnouncementCard key={i} />
          ))}
        </View>
      ) : announcements.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.emptyStateContainer, tabBarSpace]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
        >
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="campaign" size={32} color={colors.accentText} />
          </View>
          <Text style={styles.emptyTitle}>No announcements yet</Text>
          <Text style={styles.centerState}>Check back later for updates from your offices.</Text>
        </ScrollView>
      ) : (
        // FlatList only draws the cards on screen, so a long feed stays smooth.
        <FlatList
          data={announcements}
          keyExtractor={(announcement) => String(announcement.announcement_id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: 24 + tabBarSpace.paddingBottom }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
          renderItem={({ item: announcement }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{announcement.title}</Text>
              <Text style={styles.cardContent}>{announcement.content}</Text>
              <Text style={styles.cardDate}>{formatDate(announcement.created_at)}</Text>
            </View>
          )}
        />
      )}

      <NavMenu
        visible={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        userInitial={userInitial}
        onLogout={logout}
      />
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
    title: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", color: colors.textPrimary },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.accentText,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    avatarImage: { width: 30, height: 30 },
    avatarText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 12 },
    centerStateContainer: { flexGrow: 1, justifyContent: "center" },
    centerState: {
      marginTop: 8,
      textAlign: "center",
      color: colors.textSecondary,
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      paddingHorizontal: 24,
    },
    emptyStateContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accent + "1A",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    emptyTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    skeletonContainer: { paddingTop: 4 },
    listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
    },
    cardTitle: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    cardContent: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
      marginBottom: 10,
    },
    cardDate: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
  });
