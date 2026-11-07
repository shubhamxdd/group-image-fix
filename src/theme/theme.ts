export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  cardBorder: string;
  headerBg: string;
  headerBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  accentForeground: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  inputBg: string;
  inputBorder: string;
  pillBg: string;
  pillBorder: string;
  modalBackdrop: string;
  badgeBg: string;
  badgeText: string;
}

export const darkColors: ThemeColors = {
  isDark: true,
  background: "#020617",
  surface: "#0f172a",
  surfaceElevated: "#1e293b",
  card: "#0f172a",
  cardBorder: "rgba(148, 163, 184, 0.2)",
  headerBg: "#0f172a",
  headerBorder: "rgba(148, 163, 184, 0.2)",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#0284c7",
  accentLight: "#38bdf8",
  accentMuted: "rgba(56, 189, 248, 0.2)",
  accentForeground: "#ffffff",
  success: "#10b981",
  successBg: "#065f46",
  warning: "#f59e0b",
  warningBg: "rgba(245, 158, 11, 0.2)",
  danger: "#ef4444",
  dangerBg: "#7f1d1d",
  inputBg: "#1e293b",
  inputBorder: "rgba(148, 163, 184, 0.3)",
  pillBg: "rgba(15, 23, 42, 0.85)",
  pillBorder: "rgba(148, 163, 184, 0.3)",
  modalBackdrop: "rgba(2, 6, 23, 0.85)",
  badgeBg: "#1e293b",
  badgeText: "#f8fafc",
};

export const lightColors: ThemeColors = {
  isDark: false,
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceElevated: "#f1f5f9",
  card: "#ffffff",
  cardBorder: "#e2e8f0",
  headerBg: "#ffffff",
  headerBorder: "#e2e8f0",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  accent: "#0284c7",
  accentLight: "#0284c7",
  accentMuted: "rgba(2, 132, 199, 0.12)",
  accentForeground: "#ffffff",
  success: "#059669",
  successBg: "#d1fae5",
  warning: "#d97706",
  warningBg: "#fef3c7",
  danger: "#dc2626",
  dangerBg: "#fee2e2",
  inputBg: "#ffffff",
  inputBorder: "#cbd5e1",
  pillBg: "rgba(255, 255, 255, 0.95)",
  pillBorder: "#cbd5e1",
  modalBackdrop: "rgba(15, 23, 42, 0.6)",
  badgeBg: "#e2e8f0",
  badgeText: "#0f172a",
};
