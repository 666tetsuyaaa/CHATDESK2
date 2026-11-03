import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useTicketBadge } from "../../context/TicketBadgeContext";

// The three destinations a student reaches most often get one-tap access
// here. Everything else (Settings, Profile, SUS Survey, chat History) stays
// behind the hamburger drawer each tab screen still renders, since those
// aren't frequent enough to earn a permanent tab slot.
export default function TabsLayout() {
  const { colors } = useTheme();
  const { unseenCount } = useTicketBadge();
  // Same colors as the tint options below. Taken from the theme rather than
  // the tab bar's `color` arg, whose type (RN 0.88 ColorValue) the icon
  // library doesn't accept.
  const tabIconColor = (focused: boolean) => (focused ? colors.accentText : colors.textMuted);
  // Active tab gets a soft tinted pill behind its icon (Material 3 / modern
  // chat-app style) instead of relying on the tint color alone.
  const TabIcon = ({ name, focused, size }: { name: keyof typeof MaterialIcons.glyphMap; focused: boolean; size: number }) => (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? `${colors.accentText}1F` : "transparent",
      }}
    >
      <MaterialIcons name={name} size={size - 2} color={tabIconColor(focused)} />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: "Montserrat_700Bold", fontSize: 11, marginTop: 2 },
        // Without this, the tab bar stays reserved at the bottom when the
        // keyboard opens, which throws off each screen's own
        // KeyboardAvoidingView math - the chat input in particular would
        // end up hidden behind the keyboard instead of rising above it.
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="chat-bubble-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="confirmation-number" focused={focused} size={size} />
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
            <TabIcon name="campaign" focused={focused} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
