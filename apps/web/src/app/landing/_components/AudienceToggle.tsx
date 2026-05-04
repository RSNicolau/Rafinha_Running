'use client';
import type { Audience } from '../page';

export function AudienceToggle({ audience, onChange }: { audience: Audience; onChange: (a: Audience) => void }) {
  return (
    <div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-gray-100 py-3 px-4 shadow-sm">
      <div className="max-w-5xl mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-2xl shadow-inner">
          <button
            onClick={() => onChange('coach')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              audience === 'coach' ? 'bg-[#DC2626] text-white shadow-md' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Sou Coach
          </button>
          <button
            onClick={() => onChange('athlete')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              audience === 'athlete' ? 'bg-[#DC2626] text-white shadow-md' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Sou Atleta
          </button>
        </div>
      </div>
    </div>
  );
}
