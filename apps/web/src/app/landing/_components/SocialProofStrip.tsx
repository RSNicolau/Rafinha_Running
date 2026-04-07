export function SocialProofStrip() {
  const integrations = ['Garmin', 'Strava', 'Apple Health', 'Google Fit', 'Coros', 'Polar', 'Garmin', 'Strava', 'Apple Health', 'Google Fit', 'Coros', 'Polar'];
  const coaches = ['Coach Rafael A.', 'Fernanda S. — Assessoria FS', 'Instituto Corre Brasil', 'Peak Performance RJ', 'Coach Rafael A.', 'Fernanda S. — Assessoria FS', 'Instituto Corre Brasil', 'Peak Performance RJ'];

  return (
    <div className="py-12 bg-gray-50 border-y border-gray-100 overflow-hidden">
      <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">
        Integra com os apps que seus atletas já usam
      </p>
      {/* Marquee integrations */}
      <div className="flex overflow-hidden mb-4">
        <div className="flex gap-4 animate-marquee whitespace-nowrap">
          {integrations.map((brand, i) => (
            <div key={i} className="px-5 py-2 bg-white rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 shadow-sm flex-shrink-0">
              {brand}
            </div>
          ))}
        </div>
        <div className="flex gap-4 animate-marquee whitespace-nowrap" aria-hidden>
          {integrations.map((brand, i) => (
            <div key={i} className="px-5 py-2 bg-white rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 shadow-sm flex-shrink-0">
              {brand}
            </div>
          ))}
        </div>
      </div>
      {/* Coaches marquee (reverse) */}
      <div className="flex overflow-hidden">
        <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
          {coaches.map((name, i) => (
            <div key={i} className="px-5 py-2 bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-500 shadow-sm flex-shrink-0">
              {name}
            </div>
          ))}
        </div>
        <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap" aria-hidden>
          {coaches.map((name, i) => (
            <div key={i} className="px-5 py-2 bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-500 shadow-sm flex-shrink-0">
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
