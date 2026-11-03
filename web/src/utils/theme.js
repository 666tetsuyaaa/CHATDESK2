import { useEffect, useState } from "react";

const STORAGE_KEY = "chatdesk_theme";

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

// Called once from main.jsx before the first render so there's no flash of
// the wrong theme.
export function initTheme() {
  applyTheme(readStoredTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private-browsing / storage-disabled - the preference just won't persist.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));
  return { theme, toggleTheme };
}
