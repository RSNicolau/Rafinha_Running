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

const FIRST_NAMES = [
  'Carlos', 'Fernanda', 'André', 'Juliana', 'Ricardo', 'Patrícia', 'Felipe', 'Mariana',
  'Rafael', 'Amanda', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Fábio', 'Gabriela',
  'Henrique', 'Isabela', 'João', 'Karen', 'Leonardo', 'Larissa', 'Marcos', 'Natália',
  'Otávio', 'Paula', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Eduardo', 'Beatriz',
  'Gustavo', 'Letícia', 'Matheus', 'Renata', 'Victor', 'Aline', 'Daniel', 'Mônica',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Carvalho',
  'Alves', 'Ferreira', 'Rodrigues', 'Martins', 'Araújo', 'Melo', 'Barbosa',
  'Ribeiro', 'Rocha', 'Almeida', 'Nascimento', 'Gomes', 'Nunes', 'Cardoso',
];

// 420 atletas — 5% inadimplência (a cada 20, 1 inativo)
export const MOCK_ATHLETES = Array.from({ length: 420 }, (_, i) => {
  const fn = FIRST_NAMES[i % FIRST_NAMES.length];
  const ln = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  const suffix = Math.floor(i / (FIRST_NAMES.length * LAST_NAMES.length));
  const name = `${fn} ${ln}${suffix > 0 ? ` ${suffix + 1}` : ''}`;
  const email = `${fn.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${ln.toLowerCase()}${i > 0 ? i : ''}@demo.com`;

  // Every 20th athlete is inactive (5% inadimplência)
  const isActive = (i % 20) !== 19;

  // Stagger creation dates across 2 years
  const baseDate = new Date('2023-03-01');
  baseDate.setDate(baseDate.getDate() + Math.floor(i * 1.7));

  return {
    id: `demo-${i + 1}`,
    name,
    email,
    createdAt: baseDate.toISOString(),
    athleteProfile: {
      currentPlan: isActive ? 'ATIVO' : 'INATIVO',
      weeklyDistance: 15 + (i % 65),
      totalRaces: i % 28,
    },
  };
});

// 420 total · 399 pagantes (95%) · 21 inadimplentes (5%)
export const MOCK_STATS = {
  totalAthletes: 420,
  activeAthletes: 399,
  workoutsThisWeek: 1260, // 420 * ~3 treinos/semana
  completionRate: 88,     // aderência média realista
  monthlyRevenue: 73080,  // 399 * R$174 mensalidade média
  inadimplentes: 21,
};

export const MOCK_ALERTS = [
  { id: 'a1', athlete: { name: 'Carlos Silva' },     type: 'MISSED_WORKOUT',   message: 'Faltou treino de quinta-feira' },
  { id: 'a2', athlete: { name: 'Ricardo Souza' },    type: 'LOW_PERFORMANCE',  message: 'Pace acima do esperado nos últimos 3 treinos' },
  { id: 'a3', athlete: { name: 'Fernanda Santos' },  type: 'MISSED_WORKOUT',   message: 'Faltou treino de quarta-feira' },
  { id: 'a4', athlete: { name: 'Bruno Oliveira' },   type: 'MISSED_WORKOUT',   message: 'Ausência consecutiva — 4 dias sem registrar treino' },
  { id: 'a5', athlete: { name: 'Amanda Pereira' },   type: 'LOW_PERFORMANCE',  message: 'HRV baixo nos últimos 3 dias — sugerir recovery' },
];
