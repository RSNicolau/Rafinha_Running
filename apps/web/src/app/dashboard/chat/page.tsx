import dynamic from 'next/dynamic';

const ChatPanel = dynamic(() => import('./ChatPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500">
      Carregando chat...
    </div>
  ),
});

export default function ChatPage() {
  return <ChatPanel />;
}
