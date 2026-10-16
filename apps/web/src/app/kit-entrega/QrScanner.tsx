'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Leitor de QR Code pela câmera usando a API nativa BarcodeDetector (Chrome/Edge/Android).
 * Sem dependências. Câmera exige contexto seguro (HTTPS ou localhost) — na rede local via
 * http://IP o navegador bloqueia a câmera; nesse caso use leitor USB/Bluetooth (age como teclado)
 * ou digite o número de peito.
 */
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const start = async () => {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setError('Este navegador não lê QR Code pela câmera. Use o Chrome no Android, um leitor USB ou digite o código.');
        return;
      }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('A câmera só funciona em HTTPS. Na rede local, use um leitor USB/Bluetooth ou digite o número de peito.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes?.[0]?.rawValue) {
              stopped = true;
              resultRef.current(String(codes[0].rawValue));
              return;
            }
          } catch {
            /* frame inválido — tenta o próximo */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
      }
    };
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <p className="p-5 text-sm text-gray-700">{error}</p>
        ) : (
          <div className="relative bg-black">
            <video ref={videoRef} className="w-full aspect-square object-cover" muted playsInline />
            <div className="absolute inset-10 border-4 border-white/80 rounded-2xl pointer-events-none" />
          </div>
        )}
        <button onClick={onClose} className="w-full py-3 text-sm font-semibold text-gray-700 border-t border-gray-100">Fechar</button>
      </div>
    </div>
  );
}
