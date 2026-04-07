import dynamic from 'next/dynamic';

const AiAssistantPanel = dynamic(() => import('./AiAssistantPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500">
      Carregando IA Assistente...
    </div>
  ),
});

export default function AiAssistantPage() {
  return <AiAssistantPanel />;
}
