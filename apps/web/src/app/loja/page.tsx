import Storefront from './Storefront';

// Loja padrão (coach principal). Lojas de outros coaches: /loja/<slug-do-coach>
const COACH_ID = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID ?? 'rafinha';

export default function LojaPage() {
  return <Storefront coachSlug={COACH_ID} />;
}
