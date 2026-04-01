export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200">404</h1>
        <p className="text-gray-500 mt-2">Página não encontrada</p>
        <a href="/dashboard" className="inline-block mt-4 text-sm text-primary hover:underline">
          Voltar ao painel
        </a>
      </div>
    </div>
  );
}
