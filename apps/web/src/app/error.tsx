'use client';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200">500</h1>
        <p className="text-gray-500 mt-2">Algo deu errado</p>
        <button
          onClick={reset}
          className="inline-block mt-4 text-sm text-primary hover:underline cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
