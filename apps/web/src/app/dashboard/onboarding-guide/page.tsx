'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import Link from 'next/link';

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

export default function CoachOnboardingGuide() {
  const user = useAuthStore(s => s.user);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    // Cada passo verifica um dado REAL da API (antes dependia de campos inexistentes em /users/me)
    const checkSteps = async () => {
      const [athletesRes, meRes, formRes, teamRes, plansRes, aiRes] = await Promise.allSettled([
        api.get('/users/athletes', { params: { limit: 1 } }),
        api.get('/users/me'),
        api.get('/onboarding/form'),
        api.get('/teams/me'),
        api.get('/teams/me/plans'),
        api.get('/ai-assistant/status'),
      ]);

      const val = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? r.value.data : null);
      const a = val(athletesRes);
      const hasAthletes = !!(a && ((Array.isArray(a) && a.length > 0) || a.total > 0 || a.data?.length > 0));
      const me = val(meRes);
      const form = val(formRes);
      const activeTeam = val(teamRes)?.activeTeam ?? null;
      const plansData = val(plansRes);
      const plans: any[] = Array.isArray(plansData) ? plansData : plansData?.data ?? [];
      const ai = val(aiRes);
      const isManager = activeTeam?.role === 'OWNER' || activeTeam?.role === 'ADMIN';

      const activeQuestions = Array.isArray(form?.questions) ? form.questions.filter((q: any) => q.isActive).length : 0;

      const list: Step[] = [
        {
          id: 'profile',
          title: 'Complete seu perfil',
          description: 'Adicione foto, bio e link de agendamento para seus atletas.',
          href: '/dashboard/settings',
          completed: !!(me?.avatarUrl || me?.coachProfile?.bio || me?.bio),
        },
        {
          id: 'onboarding-form',
          title: 'Configure o questionário de anamnese',
          description: 'Revise as perguntas que seus novos atletas vão responder e compartilhe o link.',
          href: '/dashboard/settings/onboarding-form',
          completed: !!(form && form.isActive !== false && activeQuestions > 0),
        },
        {
          id: 'invite',
          title: 'Convide seu primeiro atleta',
          description: 'Compartilhe seu link de onboarding ou convide por e-mail.',
          href: '/dashboard/athletes',
          completed: hasAthletes,
        },
      ];
      if (isManager) {
        list.push(
          {
            id: 'plans',
            title: 'Crie os planos de mensalidade',
            description: 'Defina os planos (valor e periodicidade) que os atletas vão assinar.',
            href: '/dashboard/mensalidades',
            completed: plans.length > 0,
          },
          {
            id: 'payment',
            title: 'Configure o recebimento',
            description: 'Informe a carteira Asaas da equipe para receber as mensalidades.',
            href: '/dashboard/equipe',
            completed: !!activeTeam?.hasWallet,
          },
        );
      }
      list.push({
        id: 'ai',
        title: 'Configure a IA',
        description: 'Escolha o provedor e, se necessário, adicione sua própria chave.',
        href: '/dashboard/settings/ai',
        completed: !!ai?.configured,
      });
      setSteps(list);
    };

    checkSteps();
  }, []);

  const completedCount = steps.filter(s => s.completed).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Bem-vindo(a), {user?.name?.split(' ')[0] ?? 'Coach'}! 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete os passos abaixo para configurar sua assessoria.
        </p>
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-indigo-900">
            {completedCount} de {steps.length} concluídos
          </span>
          <span className="text-sm font-bold text-indigo-700">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-indigo-100 rounded-full overflow-hidden">
          <div
            className="h-3 bg-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {progress === 100 && (
          <p className="text-sm font-semibold text-indigo-700 mt-3 text-center">
            🎉 Você está pronto(a) para começar! Acesse o <Link href="/dashboard" className="underline">dashboard</Link>.
          </p>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <Link
            key={step.id}
            href={step.href}
            className={`block rounded-2xl border p-5 transition-all hover:shadow-sm ${
              step.completed
                ? 'border-green-200 bg-green-50'
                : 'border-gray-100 bg-white hover:border-indigo-200'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                step.completed ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {step.completed ? '✓' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${step.completed ? 'text-green-800' : 'text-gray-900'}`}>
                  {step.title}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
              </div>
              {!step.completed && (
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
