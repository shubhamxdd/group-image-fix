import { create } from "zustand";
import { Appearance } from "react-native";
import { darkColors, lightColors, ThemeColors, ThemeMode } from "../theme/theme";

interface ThemeState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeMode: "dark",
  setThemeMode: (mode: ThemeMode) => set({ themeMode: mode }),
  toggleTheme: () => {
    const current = get().themeMode;
    if (current === "dark") {
      set({ themeMode: "light" });
    } else {
      set({ themeMode: "dark" });
    }
  },
}));

export function useTheme(): {
  isDark: boolean;
  colors: ThemeColors;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
} {
  const themeMode = useThemeStore((state) => state.themeMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);

  let isDark = true;
  if (themeMode === "system") {
    isDark = Appearance.getColorScheme() !== "light";
  } else {
    isDark = themeMode === "dark";
  }

  const colors = isDark ? darkColors : lightColors;

  return {
    isDark,
    colors,
    themeMode,
    toggleTheme,
    setThemeMode,
  };
}
