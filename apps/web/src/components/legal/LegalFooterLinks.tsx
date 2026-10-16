import Link from 'next/link';
import { LEGAL_ROUTES } from '@/lib/legal';

/** Linha discreta de links legais para rodapés de páginas públicas. */
export function LegalFooterLinks({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const cls = dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700';
  return (
    <nav aria-label="Links legais" className={`flex items-center justify-center gap-3 text-xs ${className}`}>
      <Link href={LEGAL_ROUTES.terms} className={`${cls} transition-colors`}>
        Termos de Uso
      </Link>
      <span className={dark ? 'text-gray-600' : 'text-gray-300'} aria-hidden>·</span>
      <Link href={LEGAL_ROUTES.privacy} className={`${cls} transition-colors`}>
        Política de Privacidade
      </Link>
    </nav>
  );
}
