'use client';
import { useEffect, useRef, useState } from 'react';

function Counter({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 2000;
          const steps = 60;
          const increment = end / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{count.toLocaleString('pt-BR')}{suffix}</span>;
}

export function ResultsSection() {
  const stats = [
    { value: 2800, suffix: '+', label: 'Atletas gerenciados', desc: 'Coaches em todo o Brasil confiam na plataforma' },
    { value: 91, suffix: '%', label: 'Taxa de conclusão', desc: 'Atletas que completam seus treinos semanais' },
    { value: 47, suffix: '+', label: 'Coaches profissionais', desc: 'Assessorias ativas usando a plataforma hoje' },
  ];

  return (
    <section id="resultados" className="py-24 px-6 bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Resultados reais</span>
          <h2 className="text-4xl font-black text-white mt-2 mb-4">Números que falam por si</h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">Assessorias que adotaram a plataforma viram uma transformação na gestão e nos resultados dos atletas.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
              <p className="text-5xl font-black text-[#DC2626] mb-2">
                <Counter end={s.value} suffix={s.suffix} />
              </p>
              <p className="text-lg font-bold text-white mb-2">{s.label}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
