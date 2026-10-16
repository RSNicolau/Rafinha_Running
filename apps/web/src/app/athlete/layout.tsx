import { ConsentGate } from '@/components/legal/ConsentGate';

/** Área do atleta — monta o modal bloqueante de aceite LGPD sobre as páginas. */
export default function AthleteAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ConsentGate />
    </>
  );
}
