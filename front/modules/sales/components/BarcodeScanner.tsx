import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, AlertCircle } from 'lucide-react';

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

// Declara a API nativa que existe no Chrome/Android mas pode não estar nos tipos TS
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

export const BarcodeScanner: React.FC<Props> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function start() {
      // Verificar suporte
      if (!('BarcodeDetector' in window)) {
        setError('Este browser não suporta leitura de barcodes nativamente. Usa Chrome no Android.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e']
        });

        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              cleanup();
              onScan(code.trim());
              return;
            }
          } catch {}
          rafRef.current = requestAnimationFrame(scan);
        };

        rafRef.current = requestAnimationFrame(scan);
      } catch (e: any) {
        if (active) setError('Não foi possível aceder à câmera. Verifica as permissões.');
      }
    }

    function cleanup() {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    }

    start();
    return cleanup;
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-[70] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5 text-brand-400" />
          <span className="font-medium text-sm">Escanear Código de Barras</span>
        </div>
        <button onClick={onClose}
          className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera / Error */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-white/80 text-sm">{error}</p>
            <button onClick={onClose}
              className="px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Visor de mira */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-36">
                {/* Cantos */}
                <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-brand-400 rounded-tl" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-brand-400 rounded-tr" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-brand-400 rounded-bl" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-brand-400 rounded-br" />
                {/* Linha de scan animada */}
                <div className="absolute inset-x-2 top-1/2 h-0.5 bg-brand-400/70 animate-pulse" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {!error && (
        <div className="shrink-0 bg-black/70 px-4 py-4 text-center">
          <p className="text-white/70 text-sm">Aponte a câmera para o código de barras</p>
          <p className="text-white/40 text-xs mt-1">EAN-8, EAN-13, QR Code, Code 128, UPC</p>
        </div>
      )}
    </div>
  );
};
