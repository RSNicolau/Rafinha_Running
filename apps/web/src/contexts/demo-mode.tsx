'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const DEMO_KEY = 'rr_demo_mode';

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType>({
  isDemoMode: false,
  toggleDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    setIsDemoMode(localStorage.getItem(DEMO_KEY) === '1');
  }, []);

  const toggleDemoMode = () => {
    setIsDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem(DEMO_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <DemoModeContext.Provider value={{ isDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoModeContext);
}

// ─── Mock data ──────────────────────────────────────────────────────────────

export const MOCK_ATHLETES = [
  { id: 'demo-1', name: 'Carlos Henrique', email: 'carlos@demo.com', createdAt: '2025-01-10T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 52, totalRaces: 8 } },
  { id: 'demo-2', name: 'Fernanda Lima',    email: 'fernanda@demo.com', createdAt: '2025-02-03T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 38, totalRaces: 5 } },
  { id: 'demo-3', name: 'André Martins',    email: 'andre@demo.com',    createdAt: '2025-02-14T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 65, totalRaces: 12 } },
  { id: 'demo-4', name: 'Juliana Costa',    email: 'juliana@demo.com',  createdAt: '2025-03-01T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 44, totalRaces: 3 } },
  { id: 'demo-5', name: 'Ricardo Souza',    email: 'ricardo@demo.com',  createdAt: '2025-03-15T10:00:00Z', athleteProfile: { currentPlan: 'INATIVO', weeklyDistance: 28, totalRaces: 6 } },
  { id: 'demo-6', name: 'Patrícia Alves',   email: 'patricia@demo.com', createdAt: '2025-04-02T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 71, totalRaces: 20 } },
  { id: 'demo-7', name: 'Felipe Ramos',     email: 'felipe@demo.com',   createdAt: '2025-04-20T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 33, totalRaces: 2 } },
  { id: 'demo-8', name: 'Mariana Torres',   email: 'mariana@demo.com',  createdAt: '2025-05-05T10:00:00Z', athleteProfile: { currentPlan: 'ATIVO', weeklyDistance: 58, totalRaces: 9 } },
];

export const MOCK_STATS = {
  totalAthletes: 8,
  activeAthletes: 7,
  workoutsThisWeek: 23,
  completionRate: 87,
};

export const MOCK_ALERTS = [
  { id: 'a1', athlete: { name: 'Carlos Henrique' }, type: 'MISSED_WORKOUT', message: 'Faltou treino de quinta-feira' },
  { id: 'a2', athlete: { name: 'Ricardo Souza' },   type: 'LOW_PERFORMANCE', message: 'Pace acima do esperado nos últimos 3 treinos' },
  { id: 'a3', athlete: { name: 'Fernanda Lima' },   type: 'MISSED_WORKOUT', message: 'Faltou treino de quarta-feira' },
];
