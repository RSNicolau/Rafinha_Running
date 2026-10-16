import Storefront from '../Storefront';

export default function CoachLojaPage({ params }: { params: { slug: string } }) {
  return <Storefront coachSlug={decodeURIComponent(params.slug)} />;
}
