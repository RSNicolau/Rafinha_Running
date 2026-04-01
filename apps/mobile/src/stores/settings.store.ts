import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppSettings {
  pushNotifications: boolean;
  workoutReminders: boolean;
  coachMessages: boolean;
  weeklyReport: boolean;
  autoSync: boolean;
  dataOverWifi: boolean;
  language: 'pt-BR' | 'en';
  measureUnit: 'metric' | 'imperial';
}

interface SettingsState extends AppSettings {
  toggle: (key: keyof Pick<AppSettings, 'pushNotifications' | 'workoutReminders' | 'coachMessages' | 'weeklyReport' | 'autoSync' | 'dataOverWifi'>) => void;
  setLanguage: (lang: 'pt-BR' | 'en') => void;
  setMeasureUnit: (unit: 'metric' | 'imperial') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      pushNotifications: true,
      workoutReminders: true,
      coachMessages: true,
      weeklyReport: true,
      autoSync: true,
      dataOverWifi: false,
      language: 'pt-BR',
      measureUnit: 'metric',

      toggle: (key) => set((state) => ({ [key]: !state[key] })),
      setLanguage: (language) => set({ language }),
      setMeasureUnit: (measureUnit) => set({ measureUnit }),
    }),
    {
      name: 'rr-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
