'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 shadow-sm shadow-gray-100/80' : 'bg-transparent'} backdrop-blur-md border-b ${scrolled ? 'border-gray-100' : 'border-transparent'}`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <img src="/logo.png" alt="Rafinha Running" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Rafinha Running</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#funcionalidades" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Funcionalidades</a>
          <a href="#resultados" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Resultados</a>
          <a href="#planos" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Planos</a>
          <a href="#faq" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
          <Link href="/athlete-login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Área do Atleta</Link>
          <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Entrar</Link>
          <Link href="/login" className="px-4 py-2 bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            Começar grátis
          </Link>
        </div>
        <button className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4 shadow-lg">
          <a href="#funcionalidades" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>Funcionalidades</a>
          <a href="#resultados" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>Resultados</a>
          <a href="#planos" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>Planos</a>
          <a href="#faq" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>FAQ</a>
          <Link href="/athlete-login" className="text-sm text-gray-600 py-1">Área do Atleta</Link>
          <Link href="/login" className="text-sm text-gray-600 py-1">Entrar</Link>
          <Link href="/login" className="px-4 py-3 bg-[#DC2626] text-white text-sm font-semibold rounded-xl text-center">Começar grátis</Link>
        </div>
      )}
    </nav>
  );
}
