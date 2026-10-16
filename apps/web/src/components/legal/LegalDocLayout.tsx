import Link from 'next/link';
import { hasLegalPlaceholders, LEGAL_EFFECTIVE_DATE, LEGAL_ROUTES, listLegalPlaceholders } from '@/lib/legal';
import { CookieNotice } from './CookieNotice';

export interface TocItem {
  id: string;
  title: string;
}

interface Props {
  title: string;
  version: string;
  toc: TocItem[];
  summary: React.ReactNode;
  children: React.ReactNode;
  /** Documento "irmão" para o link no topo */
  sibling: { href: string; label: string };
}

/** Seção numerada com âncora (o id precisa existir no `toc`). */
export function LegalSection({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 pt-2">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-3">
        <a href={`#${id}`} className="no-underline hover:text-[#DC2626]">
          <span className="text-[#DC2626] mr-2 tabular-nums">{n}.</span>
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}

/** Placeholder destacado (dado da empresa ainda não informado). */
export function Fill({ children }: { children: string }) {
  const missing = /não informado/i.test(children);
  return missing ? (
    <mark className="rounded bg-amber-100 px-1 text-amber-900 font-medium">{children}</mark>
  ) : (
    <>{children}</>
  );
}

export function LegalDocLayout({ title, version, toc, summary, children, sibling }: Props) {
  const showDevWarning = process.env.NODE_ENV !== 'production' && hasLegalPlaceholders();

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-gray-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Página inicial">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#DC2626] shadow-[0_2px_10px_rgba(220,38,38,0.35)]">
              <span className="text-[11px] font-black leading-none tracking-tighter text-white">RR</span>
            </span>
            <span className="hidden sm:block text-sm font-bold tracking-tight">Rafinha Running</span>
          </Link>
          <div className="flex-1" />
          <Link href={sibling.href} className="text-xs font-medium text-gray-500 hover:text-[#DC2626] transition-colors">
            {sibling.label} →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {showDevWarning && (
          <div role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Aviso (visível apenas em desenvolvimento)</p>
            <p className="mt-1">
              Há dados da empresa não preenchidos: <code className="text-xs">{listLegalPlaceholders().join(', ')}</code>.
              Preencha em <code className="text-xs">apps/web/src/lib/legal.ts</code> antes do lançamento.
            </p>
          </div>
        )}

        {/* Title */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DC2626]">Documento legal</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Versão {version} · vigente desde {LEGAL_EFFECTIVE_DATE}
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          {/* TOC — desktop */}
          <aside className="hidden lg:block">
            <nav aria-label="Sumário" className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Sumário</p>
              <ol className="space-y-1.5 text-[13px]">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="flex gap-2 text-gray-500 hover:text-[#DC2626] transition-colors">
                      <span className="tabular-nums text-gray-300">{i + 1}.</span>
                      <span>{t.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <main className="min-w-0">
            {/* Plain-language summary */}
            <div className="mb-6 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 sm:p-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#DC2626]">Resumo em linguagem simples</p>
              <div className="text-[15px] leading-relaxed text-gray-700 [&_li]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5">{summary}</div>
              <p className="mt-3 text-xs text-gray-500">
                O resumo ajuda na leitura, mas não substitui o texto completo abaixo.
              </p>
            </div>

            {/* TOC — mobile */}
            <details className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800">Sumário</summary>
              <ol className="mt-3 space-y-2 text-sm">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="text-gray-600 hover:text-[#DC2626]">
                      {i + 1}. {t.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            <article
              className="space-y-8 rounded-2xl border border-gray-200/70 bg-white p-5 sm:p-8 text-[15px] leading-relaxed text-gray-700
                [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5
                [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900
                [&_strong]:text-gray-900 [&_a]:text-[#DC2626] [&_a]:underline [&_a]:underline-offset-2
                [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900 [&_th]:bg-gray-50
                [&_th]:p-2.5 [&_td]:p-2.5 [&_td]:align-top [&_tr]:border-b [&_tr]:border-gray-100"
            >
              {children}
            </article>

            <footer className="mt-8 flex flex-col items-center gap-2 pb-16 text-xs text-gray-400 sm:flex-row sm:justify-between">
              <span>RR — Rafinha Running · Versão {version}</span>
              <span className="flex gap-3">
                <Link href={LEGAL_ROUTES.terms} className="hover:text-gray-700">Termos de Uso</Link>
                <Link href={LEGAL_ROUTES.privacy} className="hover:text-gray-700">Política de Privacidade</Link>
                <Link href={LEGAL_ROUTES.myData} className="hover:text-gray-700">Meus dados</Link>
              </span>
            </footer>
          </main>
        </div>
      </div>
      <CookieNotice />
    </div>
  );
}
