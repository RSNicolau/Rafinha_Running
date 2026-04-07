import dynamic from 'next/dynamic';

const LiveMap = dynamic(() => import('./LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500">
      Carregando mapa...
    </div>
  ),
});

export default function LivePage() {
  return <LiveMap />;
}
