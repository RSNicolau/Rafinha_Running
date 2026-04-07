import Link from 'next/link';

export function FooterSection() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* CTA before footer */}
        <div className="rounded-3xl bg-gradient-to-r from-[#DC2626] to-red-700 p-10 text-center mb-16">
          <h3 className="text-3xl font-black text-white mb-3">Pronto para transformar sua assessoria?</h3>
          <p className="text-red-100 mb-8 max-w-xl mx-auto">Comece agora. 14 dias grátis, sem cartão. Seus atletas merecem o melhor.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="px-8 py-3 bg-white text-[#DC2626] font-bold rounded-xl hover:bg-red-50 transition-colors text-sm">
              Começar grátis — Sou Treinador
            </Link>
            <Link href="/athlete-login" className="px-8 py-3 bg-red-800/60 text-white font-bold rounded-xl hover:bg-red-800 border border-red-500/40 transition-colors text-sm">
              Área do Atleta
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg overflow-hidden">
                <img src="/logo.png" alt="RR" className="w-full h-full object-cover" />
              </div>
              <span className="font-bold text-gray-200 text-sm">Rafinha Running</span>
            </div>
            <p className="text-xs leading-relaxed text-gray-500">Plataforma completa para coaches de corrida profissionais.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-300 text-sm mb-4">Produto</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#funcionalidades" className="hover:text-gray-200 transition-colors">Funcionalidades</a></li>
              <li><a href="#planos" className="hover:text-gray-200 transition-colors">Planos</a></li>
              <li><a href="#faq" className="hover:text-gray-200 transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-300 text-sm mb-4">Plataforma</p>
            <ul className="space-y-2 text-xs">
              <li><Link href="/login" className="hover:text-gray-200 transition-colors">Área do Coach</Link></li>
              <li><Link href="/athlete-login" className="hover:text-gray-200 transition-colors">Área do Atleta</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-300 text-sm mb-4">Legal</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#" className="hover:text-gray-200 transition-colors">Privacidade</a></li>
              <li><a href="#" className="hover:text-gray-200 transition-colors">Termos de Uso</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">© 2026 Rafinha Running. Todos os direitos reservados.</p>
          <p className="text-xs text-gray-600">Feito com tecnologia para coaches apaixonados por corrida.</p>
        </div>
      </div>
    </footer>
  );
}
