const testimonials = [
  {
    name: 'Rafael Andrade',
    role: 'Head Coach — Assessoria RA Running',
    avatar: 'RA',
    quote: 'Antes gastava 2 horas por dia em planilhas do Excel. Hoje o dashboard me dá tudo automaticamente. Minha assessoria cresceu 40% em 6 meses.',
  },
  {
    name: 'Fernanda Souza',
    role: 'Coach e Fundadora — FS Performance',
    avatar: 'FS',
    quote: 'O live tracking mudou a relação com meus atletas. Eles sentem que estou do lado deles em cada corrida, mesmo a distância. Retença subiu muito.',
  },
  {
    name: 'Carlos Mendes',
    role: 'Diretor Técnico — Instituto Corre Brasil',
    avatar: 'CM',
    quote: 'A integração com Garmin e Strava é perfeita. Os dados chegam sem erro e as planilhas da IA são surpreendentemente precisas para cada atleta.',
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">Depoimentos</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">O que os coaches dizem</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-gray-600 text-sm leading-relaxed mb-6">"{t.quote}"</blockquote>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#DC2626] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {t.avatar}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
