'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';

const TrainingLoadChartSelf = dynamic(() => import('./TrainingLoadChartSelf'), { ssr: false });

export default function AthleteTrainingLoadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Carga de Treino</h1>
        <p className="text-sm text-gray-500 mt-1">
          Acompanhe seu fitness (CTL), fadiga (ATL) e forma (TSB) ao longo do tempo.
        </p>
      </div>

      {/* Explanation card */}
      <div className="glass-card p-5 mb-6 bg-blue-50/50">
        <h2 className="text-sm font-semibold text-blue-800 mb-2">O que é ATL/CTL/TSB?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-blue-700">
          <div>
            <p className="font-semibold">🔵 CTL — Fitness</p>
            <p className="text-blue-600 mt-0.5">Média exponencial de 42 dias. Representa sua aptidão aeróbia acumulada.</p>
          </div>
          <div>
            <p className="font-semibold">🔴 ATL — Fadiga</p>
            <p className="text-blue-600 mt-0.5">Média de 7 dias. Representa o quanto você treinou recentemente.</p>
          </div>
          <div>
            <p className="font-semibold">🟢 TSB — Forma</p>
            <p className="text-blue-600 mt-0.5">CTL − ATL. Positivo = descansado, Negativo = acumulando fadiga.</p>
          </div>
        </div>
      </div>

      <TrainingLoadChartSelf />
    </div>
  );
}
