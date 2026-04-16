'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type SportTab = 'running' | 'cycling' | 'swimming' | 'crossfit';

interface PowerZone {
  zone: number;
  name: string;
  minWatts: number;
  maxWatts: number;
}

interface SwimZone {
  zone: number;
  name: string;
  pace: string;
}

function parseTime(str: string): number {
  // Parses mm:ss → total seconds
  const parts = str.split(':');
  if (parts.length !== 2) return 0;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return 0;
  return m * 60 + s;
}

function formatPace(totalSeconds: number): string {
  if (totalSeconds <= 0) return '--:--';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function calcRunningZones(best5kStr: string) {
  const best5kSec = parseTime(best5kStr);
  if (!best5kSec) return null;
  const pacePerKm = best5kSec / 5; // seconds per km
  return [
    { zone: 1, name: 'Z1 — Recuperação',    color: '#60a5fa', min: pacePerKm + 120, max: pacePerKm + 180, description: 'Ritmo muito suave, conversa normal' },
    { zone: 2, name: 'Z2 — Base Aeróbica',  color: '#34d399', min: pacePerKm + 75,  max: pacePerKm + 120, description: 'Ritmo confortável, base de endurance' },
    { zone: 3, name: 'Z3 — Aeróbico',       color: '#fbbf24', min: pacePerKm + 45,  max: pacePerKm + 75,  description: 'Esforço moderado, levemente ofegante' },
    { zone: 4, name: 'Z4 — Limiar',         color: '#f97316', min: pacePerKm + 15,  max: pacePerKm + 45,  description: 'Ritmo forte, sustentável por 20-40 min' },
    { zone: 5, name: 'Z5 — VO2max',         color: '#ef4444', min: pacePerKm - 15,  max: pacePerKm + 15,  description: 'Esforço máximo, intervalados curtos' },
  ];
}

export default function NicheZonesPage() {
  const [tab, setTab] = useState<SportTab>('running');

  // Running
  const [best5k, setBest5k] = useState('');
  const runZones = best5k ? calcRunningZones(best5k) : null;

  // Cycling
  const [ftp, setFtp] = useState('');
  const [weight, setWeight] = useState('');
  const [powerZones, setPowerZones] = useState<{ ftp: number; wPerKg: number | null; zones: PowerZone[] } | null>(null);
  const [loadingPower, setLoadingPower] = useState(false);

  const calcPowerZones = async () => {
    if (!ftp) return;
    setLoadingPower(true);
    try {
      const res = await api.post('/niche/calculate/power-zones', {
        ftp: Number(ftp),
        weightKg: weight ? Number(weight) : undefined,
      });
      setPowerZones(res.data);
    } catch {
      // fallback client-side
      const f = Number(ftp);
      setPowerZones({
        ftp: f,
        wPerKg: weight ? Math.round((f / Number(weight)) * 100) / 100 : null,
        zones: [
          { zone: 1, name: 'Recuperação',    minWatts: 0,                    maxWatts: Math.round(f * 0.55) },
          { zone: 2, name: 'Resistência',    minWatts: Math.round(f * 0.56), maxWatts: Math.round(f * 0.75) },
          { zone: 3, name: 'Tempo',          minWatts: Math.round(f * 0.76), maxWatts: Math.round(f * 0.90) },
          { zone: 4, name: 'Limiar (FTP)',   minWatts: Math.round(f * 0.91), maxWatts: Math.round(f * 1.05) },
          { zone: 5, name: 'VO2max',         minWatts: Math.round(f * 1.06), maxWatts: Math.round(f * 1.20) },
          { zone: 6, name: 'Anaeróbico',     minWatts: Math.round(f * 1.21), maxWatts: Math.round(f * 1.50) },
          { zone: 7, name: 'Neuromuscular',  minWatts: Math.round(f * 1.51), maxWatts: 9999 },
        ],
      });
    }
    setLoadingPower(false);
  };

  // Swimming
  const [swim100, setSwim100] = useState('');
  const [swim400, setSwim400] = useState('');
  const [swimZones, setSwimZones] = useState<{ cssSeconds: number; cssPace: string; zones: SwimZone[] } | null>(null);
  const [loadingSwim, setLoadingSwim] = useState(false);

  const calcSwimZones = async () => {
    if (!swim100 || !swim400) return;
    setLoadingSwim(true);
    try {
      const res = await api.post('/niche/calculate/swim-zones', {
        best100mSeconds: parseTime(swim100),
        best400mSeconds: parseTime(swim400),
      });
      setSwimZones(res.data);
    } catch {
      const s100 = parseTime(swim100);
      const s400 = parseTime(swim400);
      const css = (s400 - s100) / 3;
      setSwimZones({
        cssSeconds: css,
        cssPace: formatPace(css) + '/100m',
        zones: [
          { zone: 1, name: 'Recuperação',      pace: `> ${formatPace(css * 1.3)}/100m` },
          { zone: 2, name: 'Base Aeróbica',    pace: `${formatPace(css * 1.16)} – ${formatPace(css * 1.3)}/100m` },
          { zone: 3, name: 'Desenvolvimento',  pace: `${formatPace(css * 1.01)} – ${formatPace(css * 1.15)}/100m` },
          { zone: 4, name: 'CSS (Limiar)',      pace: `${formatPace(css * 0.95)} – ${formatPace(css * 1.0)}/100m` },
          { zone: 5, name: 'Alta Intensidade', pace: `< ${formatPace(css * 0.95)}/100m` },
        ],
      });
    }
    setLoadingSwim(false);
  };

  // CrossFit
  const [squat1rm, setSquat1rm] = useState('');
  const [deadlift1rm, setDeadlift1rm] = useState('');
  const pcts = [100, 95, 90, 85, 80, 75, 70, 65, 60];

  const tabs: { key: SportTab; label: string; icon: string; color: string }[] = [
    { key: 'running',  label: 'Corrida',   icon: '🏃', color: '#3b82f6' },
    { key: 'cycling',  label: 'Ciclismo',  icon: '🚴', color: '#f59e0b' },
    { key: 'swimming', label: 'Natação',   icon: '🏊', color: '#06b6d4' },
    { key: 'crossfit', label: 'CrossFit',  icon: '🏋️', color: '#ef4444' },
  ];

  const powerColors = ['#60a5fa','#34d399','#fbbf24','#f97316','#ef4444','#a855f7','#ec4899'];
  const swimColors  = ['#60a5fa','#34d399','#fbbf24','#f97316','#ef4444'];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Zonas de Treino</h1>
        <p className="text-sm text-gray-500 mt-1">
          Calculadora de zonas e intensidades por modalidade
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tab === t.key
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── RUNNING ─────────────────────────────────────────────────────── */}
      {tab === 'running' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Calcular Zonas de Pace</h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Melhor tempo nos 5km (mm:ss)</label>
                <input
                  type="text"
                  placeholder="ex: 25:30"
                  value={best5k}
                  onChange={(e) => setBest5k(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Zonas calculadas automaticamente com base no seu pace de 5km.</p>
          </div>

          {runZones && (
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Suas Zonas de Pace</h2>
              <div className="space-y-2">
                {runZones.map((z) => (
                  <div key={z.zone} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: z.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{z.name}</p>
                      <p className="text-xs text-gray-400">{z.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-gray-700">
                        {formatPace(z.min)} – {formatPace(z.max)}
                      </p>
                      <p className="text-[10px] text-gray-400">min/km</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!best5k && (
            <div className="glass-card p-5 bg-blue-50/40 text-center">
              <p className="text-4xl mb-2">🏃</p>
              <p className="text-sm text-gray-500">Insira seu melhor tempo nos 5km para calcular as zonas de pace.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── CYCLING ─────────────────────────────────────────────────────── */}
      {tab === 'cycling' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Calcular Zonas de Potência</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">FTP (watts)</label>
                <input
                  type="number"
                  placeholder="ex: 220"
                  value={ftp}
                  onChange={(e) => setFtp(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Peso (kg) <span className="text-gray-300">— opcional</span></label>
                <input
                  type="number"
                  placeholder="ex: 70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>
            <button
              onClick={calcPowerZones}
              disabled={!ftp || loadingPower}
              className="w-full py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 transition cursor-pointer"
            >
              {loadingPower ? 'Calculando…' : 'Calcular Zonas'}
            </button>
            <p className="text-xs text-gray-400 mt-2">FTP = Functional Threshold Power. Faça um teste de 20 min e multiplique por 0.95.</p>
          </div>

          {powerZones && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Suas Zonas de Potência</h2>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>FTP: <strong className="text-gray-800">{powerZones.ftp}w</strong></span>
                  {powerZones.wPerKg && (
                    <span>W/kg: <strong className="text-amber-600">{powerZones.wPerKg}</strong></span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {powerZones.zones.map((z, i) => (
                  <div key={z.zone} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: powerColors[i] }}>
                      {z.zone}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{z.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-gray-700">
                        {z.maxWatts >= 9999 ? `> ${z.minWatts}w` : `${z.minWatts} – ${z.maxWatts}w`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!powerZones && (
            <div className="glass-card p-5 bg-amber-50/40 text-center">
              <p className="text-4xl mb-2">🚴</p>
              <p className="text-sm text-gray-500">Insira seu FTP para ver as 7 zonas de potência (modelo Coggan).</p>
            </div>
          )}
        </div>
      )}

      {/* ─── SWIMMING ────────────────────────────────────────────────────── */}
      {tab === 'swimming' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Calcular Zonas pelo CSS</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Melhor 100m (mm:ss)</label>
                <input
                  type="text"
                  placeholder="ex: 1:15"
                  value={swim100}
                  onChange={(e) => setSwim100(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Melhor 400m (mm:ss)</label>
                <input
                  type="text"
                  placeholder="ex: 6:00"
                  value={swim400}
                  onChange={(e) => setSwim400(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
            </div>
            <button
              onClick={calcSwimZones}
              disabled={!swim100 || !swim400 || loadingSwim}
              className="w-full py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-40 transition cursor-pointer"
            >
              {loadingSwim ? 'Calculando…' : 'Calcular Zonas'}
            </button>
            <p className="text-xs text-gray-400 mt-2">CSS (Critical Swim Speed) = limiar anaeróbio na natação. Fórmula: (t400 – t100) ÷ 300m.</p>
          </div>

          {swimZones && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Suas Zonas de Natação</h2>
                <span className="text-xs text-gray-500">CSS: <strong className="text-cyan-600">{swimZones.cssPace}</strong></span>
              </div>
              <div className="space-y-2">
                {swimZones.zones.map((z, i) => (
                  <div key={z.zone} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: swimColors[i] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{z.name}</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-gray-700 text-right shrink-0">{z.pace}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!swimZones && (
            <div className="glass-card p-5 bg-cyan-50/40 text-center">
              <p className="text-4xl mb-2">🏊</p>
              <p className="text-sm text-gray-500">Insira seus tempos de 100m e 400m para calcular o CSS e as zonas de natação.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── CROSSFIT ────────────────────────────────────────────────────── */}
      {tab === 'crossfit' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Tabela de % do 1RM</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Back Squat 1RM (kg)</label>
                <input
                  type="number"
                  placeholder="ex: 100"
                  value={squat1rm}
                  onChange={(e) => setSquat1rm(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deadlift 1RM (kg)</label>
                <input
                  type="number"
                  placeholder="ex: 120"
                  value={deadlift1rm}
                  onChange={(e) => setDeadlift1rm(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
            </div>

            {(squat1rm || deadlift1rm) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2 font-medium">% 1RM</th>
                      <th className="text-left py-2 font-medium">Uso</th>
                      {squat1rm && <th className="text-right py-2 font-medium">Squat (kg)</th>}
                      {deadlift1rm && <th className="text-right py-2 font-medium">Deadlift (kg)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pcts.map((pct) => {
                      const uses: Record<number, string> = {
                        100: 'Teste de 1RM',
                        95:  'Força máxima (1-2 reps)',
                        90:  'Força (2-3 reps)',
                        85:  'Força/potência (3-5 reps)',
                        80:  'Hipertrofia/Força (5-6 reps)',
                        75:  'Hipertrofia (8-10 reps)',
                        70:  'Hipertrofia (10-12 reps)',
                        65:  'Resistência muscular (12-15)',
                        60:  'Resistência / Aquecimento',
                      };
                      return (
                        <tr key={pct} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-2 font-mono font-semibold text-gray-700">{pct}%</td>
                          <td className="py-2 text-xs text-gray-500">{uses[pct]}</td>
                          {squat1rm && (
                            <td className="py-2 text-right font-mono font-semibold text-red-600">
                              {Math.round(Number(squat1rm) * pct / 100)}
                            </td>
                          )}
                          {deadlift1rm && (
                            <td className="py-2 text-right font-mono font-semibold text-red-600">
                              {Math.round(Number(deadlift1rm) * pct / 100)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-4xl mb-2">🏋️</p>
                <p className="text-sm text-gray-500">Insira seu 1RM para ver a tabela de cargas por percentual.</p>
              </div>
            )}
          </div>

          {/* CrossFit zones explanation */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Intensidades em WODs</h2>
            <div className="space-y-2">
              {[
                { label: 'Easy / Aeróbico',   pct: '60-70% HR',  desc: 'Movimentos técnicos, volume alto' },
                { label: 'Moderate',           pct: '70-80% HR',  desc: 'WODs de força + condicionamento' },
                { label: 'High / Threshold',   pct: '80-90% HR',  desc: 'Intervalos, AMRAPs curtos' },
                { label: 'Sprint / Max Effort',pct: '90-100% HR', desc: 'For Time, sprints, potência' },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{row.label}</p>
                    <p className="text-xs text-gray-400">{row.desc}</p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-red-600 shrink-0">{row.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
