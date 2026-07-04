export function SocialProofStrip() {
  // Integrações reais suportadas pela plataforma (modules/integrations da API)
  const integrations = ['Garmin', 'Strava', 'Apple Health', 'Google Fit', 'Coros', 'Polar', 'Garmin', 'Strava', 'Apple Health', 'Google Fit', 'Coros', 'Polar'];

  return (
    <div className="py-12 bg-gray-50 border-y border-gray-100 overflow-hidden">
      <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">
        Integra com os apps que seus atletas já usam
      </p>
      {/* Marquee integrations */}
      <div className="flex overflow-hidden">
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
    </div>
  );
}
