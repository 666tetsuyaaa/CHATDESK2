import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { getItem, setItem } from "../lib/deviceStorage";
import { darkTheme, lightTheme, type ThemePalette } from "../theme/colors";

const THEME_PREFERENCE_KEY = "chatdesk_theme_preference";

type ThemeContextValue = {
  colors: ThemePalette;
  isDark: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getItem(THEME_PREFERENCE_KEY);
      if (stored === "dark") setIsDark(true);
    })();
  }, []);

  // Web: the page behind the app takes the theme's colour too, so no white
  // shows around the app while the iPhone keyboard slides in or out (the app
  // is pinned above it then - see lib/keyboard.ts).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const background = (isDark ? darkTheme : lightTheme).surface;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
  }, [isDark]);

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const next = !prev;
      setItem(THEME_PREFERENCE_KEY, next ? "dark" : "light");
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{ colors: isDark ? darkTheme : lightTheme, isDark, toggleDarkMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
