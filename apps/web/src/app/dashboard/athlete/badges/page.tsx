'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface BadgeItem {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned: boolean;
  earnedAt: string | null;
  metadata: Record<string, unknown> | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todos',
  performance: 'Performance',
  consistency: 'Consistência',
  milestone: 'Marcos',
};

function BadgeCard({ badge }: { badge: BadgeItem }) {
  return (
    <div
      className={`glass-card p-4 flex flex-col items-center text-center transition ${
        badge.earned
          ? 'ring-2 ring-primary/20 bg-gradient-to-b from-red-50/60 to-white'
          : 'opacity-40 grayscale'
      }`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-3 ${
          badge.earned ? 'bg-white shadow-sm' : 'bg-gray-100'
        }`}
      >
        {badge.icon}
      </div>
      <p className={`text-sm font-semibold leading-tight mb-1 ${badge.earned ? 'text-gray-900' : 'text-gray-500'}`}>
        {badge.name}
      </p>
      <p className="text-xs text-gray-400 leading-snug mb-2">{badge.description}</p>
      {badge.earned && badge.earnedAt && (
        <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
          {new Date(badge.earnedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      )}
      {!badge.earned && (
        <span className="text-xs bg-gray-100 text-gray-400 font-medium px-2 py-0.5 rounded-full">
          Bloqueado
        </span>
      )}
    </div>
  );
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [newlyAwarded, setNewlyAwarded] = useState<string[]>([]);

  const fetchBadges = () => {
    api.get('/badges')
      .then(({ data }) => setBadges(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBadges();
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const { data } = await api.post('/badges/check');
      setNewlyAwarded(data.awarded);
      if (data.awarded.length > 0) fetchBadges();
    } catch {}
    finally { setChecking(false); }
  };

  const filtered = activeCategory === 'all'
    ? badges
    : badges.filter((b) => b.category === activeCategory);

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conquistas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {earnedCount} de {badges.length} desbloqueadas
          </p>
        </div>
        <button
          onClick={handleCheck}
          disabled={checking}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition disabled:opacity-50"
        >
          {checking ? 'Verificando...' : '✨ Verificar novas'}
        </button>
      </div>

      {/* Newly awarded banner */}
      {newlyAwarded.length > 0 && (
        <div className="glass-card p-4 mb-6 bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            🎉 Parabéns! Você desbloqueou {newlyAwarded.length} nova{newlyAwarded.length > 1 ? 's' : ''} conquista{newlyAwarded.length > 1 ? 's' : ''}!
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="glass-card p-4 mb-6">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Progresso geral</span>
          <span className="font-semibold">{badges.length > 0 ? Math.round((earnedCount / badges.length) * 100) : 0}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-red-400 rounded-full transition-all duration-500"
            style={{ width: badges.length > 0 ? `${(earnedCount / badges.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition ${
              activeCategory === key
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
            {key === 'all' && badges.length > 0 && (
              <span className="ml-1.5 opacity-70">({earnedCount}/{badges.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Badges grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card p-4 h-36 animate-pulse bg-gray-50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏅</p>
          <p className="text-sm">Nenhuma conquista nesta categoria</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {/* Earned first */}
          {[...filtered].sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0)).map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
}
