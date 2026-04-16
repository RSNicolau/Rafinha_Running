'use client';

import { useEffect, useState } from 'react';

interface NicheOption {
  key: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  primaryMetric: string;
  features: string[];
  integrations: string[];
  monthlyPrice: number;
}

interface NicheSelectorProps {
  value?: string;
  onChange: (niche: string) => void;
  compact?: boolean;
}

export default function NicheSelector({ value, onChange, compact = false }: NicheSelectorProps) {
  const [niches, setNiches] = useState<NicheOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    fetch(`${apiUrl}/api/v1/niche`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load niches');
        return r.json() as Promise<NicheOption[]>;
      })
      .then(setNiches)
      .catch(() => setError('Não foi possível carregar os nichos.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-2xl bg-gray-100 ${compact ? 'h-16' : 'h-28'}`}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 py-2">{error}</p>;
  }

  return (
    <div
      className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
    >
      {niches.map((niche) => {
        const selected = value === niche.key;
        return (
          <button
            key={niche.key}
            type="button"
            onClick={() => onChange(niche.key)}
            className={`relative rounded-2xl border-2 text-left transition-all cursor-pointer ${
              compact ? 'p-3' : 'p-4'
            } ${
              selected
                ? 'shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
            style={
              selected
                ? {
                    borderColor: niche.color,
                    background: `${niche.color}0d`,
                    boxShadow: `0 4px 16px ${niche.color}22`,
                  }
                : undefined
            }
          >
            {selected && (
              <span
                className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: niche.color }}
              >
                <svg
                  className="w-2.5 h-2.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}

            {compact ? (
              <div className="flex items-center gap-2">
                <span className="text-xl">{niche.icon}</span>
                <span className="text-xs font-semibold text-gray-800 leading-tight">
                  {niche.label}
                </span>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">{niche.icon}</div>
                <p className="text-sm font-bold text-gray-800 leading-tight mb-1">
                  {niche.label}
                </p>
                <p className="text-xs text-gray-500 leading-snug line-clamp-2">
                  {niche.description}
                </p>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
