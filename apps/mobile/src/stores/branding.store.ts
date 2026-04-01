import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

interface BrandingState {
  tenantName: string;
  primaryColor: string;
  logoUrl: string | null;
  welcomeMsg: string | null;
  isLoaded: boolean;
  loadBranding: () => Promise<void>;
}

export const useBrandingStore = create<BrandingState>()(
  persist(
    (set) => ({
      tenantName: 'Rafinha Running',
      primaryColor: '#DC2626',
      logoUrl: null,
      welcomeMsg: null,
      isLoaded: false,

      loadBranding: async () => {
        try {
          const { data } = await api.get('/config/branding/public');
          set({
            tenantName: data.tenantName || 'Rafinha Running',
            primaryColor: data.primaryColor || '#DC2626',
            logoUrl: data.logoUrl || null,
            welcomeMsg: data.welcomeMsg || null,
            isLoaded: true,
          });
        } catch {
          // Keep defaults if offline
          set({ isLoaded: true });
        }
      },
    }),
    {
      name: 'branding-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
