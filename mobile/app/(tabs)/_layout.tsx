import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useTicketBadge } from "../../context/TicketBadgeContext";

// The three destinations a student reaches most often get one-tap access
// here. Everything else (Settings, Profile, SUS Survey, chat History) stays
// behind the hamburger drawer each tab screen still renders, since those
// aren't frequent enough to earn a permanent tab slot.
export default function TabsLayout() {
  const { colors } = useTheme();
  const { unseenCount } = useTicketBadge();
  const { width } = useWindowDimensions();
  // Same colors as the tint options below. Taken from the theme rather than
  // the tab bar's `color` arg, whose type (RN 0.88 ColorValue) the icon
  // library doesn't accept.
  const tabIconColor = (focused: boolean) => (focused ? colors.accentText : colors.textMuted);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        // A point smaller on narrow phones (iPhone SE size) so "Announcements"
        // isn't cut off.
        tabBarLabelStyle: { fontFamily: "Montserrat_700Bold", fontSize: width < 360 ? 10 : 11 },
        // Without this, the tab bar stays reserved at the bottom when the
        // keyboard opens, which throws off each screen's own
        // KeyboardAvoidingView math - the chat input in particular would
        // end up hidden behind the keyboard instead of rising above it.
        tabBarHideOnKeyboard: true,
        // Screens slide a little and cross-fade when switching tabs instead
        // of snapping.
        animation: "shift",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons name="chat-bubble-outline" size={size} color={tabIconColor(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons name="confirmation-number" size={size} color={tabIconColor(focused)} />
          ),
          tabBarBadge: unseenCount > 0 ? unseenCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.errorRed },
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: "Announcements",
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons name="campaign" size={size} color={tabIconColor(focused)} />
          ),
        }}
      />
    </Tabs>
  );
}
