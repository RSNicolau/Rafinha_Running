import { MapPin, BarChart3, Zap, Trophy, MessageCircle, Watch } from 'lucide-react';

const features = [
  {
    Icon: BarChart3,
    title: 'Dashboard Completo',
    desc: 'Acompanhe distância, pace, frequência cardíaca e evolução semana a semana de cada atleta em tempo real.',
  },
  {
    Icon: Zap,
    title: 'IA para Planilhas',
    desc: 'Crie treinos personalizados com IA. Adaptados ao nível, objetivo e histórico de performance de cada atleta.',
  },
  {
    Icon: Watch,
    title: 'Sync Automático',
    desc: 'Dados chegam do Garmin, Strava, Polar e Coros automaticamente após cada treino. Sem digitação manual.',
  },
  {
    Icon: MapPin,
    title: 'Live Tracking',
    desc: 'Acompanhe seus atletas em tempo real no mapa durante corridas, com pace e frequência cardíaca ao vivo.',
  },
  {
    Icon: Trophy,
    title: 'Rankings e Evolução',
    desc: 'Gamificação que motiva. Recordes pessoais, streak de treinos e ranking entre atletas da assessoria.',
  },
  {
    Icon: MessageCircle,
    title: 'Chat Integrado',
    desc: 'Feedback de treino, ajustes de planilha e motivação entre coach e atleta — tudo no mesmo lugar.',
  },
];

export function FeaturesSection() {
  return (
    <section id="funcionalidades" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">Funcionalidades</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">Tudo que sua assessoria precisa</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Da planilha ao relógio do atleta — uma plataforma completa para coaches profissionais.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="group p-6 rounded-2xl border border-gray-100 hover:border-red-100 hover:shadow-lg hover:shadow-red-50/60 transition-all duration-300 hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4 group-hover:bg-[#DC2626] transition-colors duration-300">
                <Icon className="w-5 h-5 text-[#DC2626] group-hover:text-white transition-colors duration-300" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
