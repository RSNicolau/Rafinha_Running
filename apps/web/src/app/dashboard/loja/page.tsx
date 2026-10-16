'use client';
import { useAuthStore } from '@/stores/auth.store';
import AthleteStorefront from './AthleteStorefront';
import CoachStoreManager from './CoachStoreManager';

export default function DashboardLojaPage() {
  const { user } = useAuthStore();
  const isCoachOrAdmin = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Atletas veem a vitrine; coach/admin gerenciam produtos, pedidos e encomendas
  if (user && !isCoachOrAdmin) {
    return <AthleteStorefront />;
  }
  return <CoachStoreManager />;
}
