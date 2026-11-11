import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
