import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { lightTheme, darkTheme, type ThemeColors } from '../theme/colors';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark';
  }
  return mode === 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => {
      const initialMode: ThemeMode = 'light';
      const isDark = resolveIsDark(initialMode);

      return {
        mode: initialMode,
        isDark,
        colors: isDark ? darkTheme : lightTheme,

        setMode: (mode: ThemeMode) => {
          const dark = resolveIsDark(mode);
          set({ mode, isDark: dark, colors: dark ? darkTheme : lightTheme });
        },

        toggleTheme: () => {
          set((state) => {
            const newMode = state.isDark ? 'light' : 'dark';
            return {
              mode: newMode as ThemeMode,
              isDark: false,
              colors: lightTheme,
              ...( newMode === 'dark' ? { isDark: true, colors: darkTheme } : {}),
            };
          });
        },
      };
    },
    {
      name: 'rr-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = resolveIsDark(state.mode);
          state.isDark = isDark;
          state.colors = isDark ? darkTheme : lightTheme;
        }
      },
    },
  ),
);

// Hook for convenience
export function useTheme() {
  const { colors, isDark, mode, setMode, toggleTheme } = useThemeStore();
  return { colors, isDark, mode, setMode, toggleTheme };
}
