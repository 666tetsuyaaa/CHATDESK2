export const colors = {
  navy: "#1B2A6B",
  navyDark: "#12194A",
  gold: "#F5A623",
  white: "#FFFFFF",
  background: "#FFFFFF",
  border: "#E2E4EC",
  textPrimary: "#1B2A6B",
  textSecondary: "#6B7280",
  textMuted: "#6F7582", // 4.6:1 on white (WCAG AA for small text)
  errorRed: "#DC2626",
};

// Semantic palette for screens that support dark mode (chat, nav menu,
// settings). "accent" is the brand-navy fill (gradient/bubble background),
// "accentText" is ink drawn on top of a surface - the two invert
// independently in dark mode, which plain `colors.navy` reuse can't do.
export type ThemePalette = {
  accent: string;
  accentText: string;
  surface: string;
  white: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gold: string;
  errorRed: string;
  // Gold for text and links on a surface - brand gold is only 2:1 on white.
  goldInk: string;
  // Ticket status colors (same hues as the web dashboard).
  statusPending: string;
  statusActive: string;
  statusResolved: string;
};

export const lightTheme: ThemePalette = {
  accent: "#1B2A6B",
  accentText: "#1B2A6B",
  surface: "#FFFFFF",
  white: "#FFFFFF",
  border: "#E2E4EC",
  textPrimary: "#1B2A6B",
  textSecondary: "#6B7280",
  textMuted: "#6F7582", // 4.6:1 on white - was #9CA3AF (2.5:1, too faint to read)
  gold: "#F5A623",
  errorRed: "#DC2626",
  goldInk: "#8A5200",
  statusPending: "#B45309",
  statusActive: "#2563EB",
  statusResolved: "#15803D", // 5.0:1 on white - was #16A34A (3.3:1)
};

export const darkTheme: ThemePalette = {
  accent: "#2F3E8C",
  accentText: "#A9B7FF",
  surface: "#1A2036",
  white: "#FFFFFF",
  border: "#2E3555",
  textPrimary: "#E9ECFB",
  textSecondary: "#A6ADD1",
  textMuted: "#848BA8", // 4.8:1 on the dark surface - was #6E7699 (3.6:1)
  gold: "#F5A623",
  errorRed: "#F1685F",
  goldInk: "#F5A623",
  statusPending: "#FBBF24",
  statusActive: "#60A5FA",
  statusResolved: "#34D399",
};
