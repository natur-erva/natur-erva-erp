import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, AlertCircle, ScanLine, Keyboard, Upload, Loader2 } from 'lucide-react';

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

// BarcodeDetector nativo (Chrome Android, Safari 17+ iOS)
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string; format: string }>>;
}

const FORMATS = ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix'];

// Som de beep via Web Audio API
function playScanBeep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1850, ctx.currentTime);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {}
}

// Carrega jsQR (QR code decoder, 18 KB) do CDN como fallback
let jsQRPromise: Promise<((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null)> | null = null;
function loadJsQR() {
  if (!jsQRPromise) {
    jsQRPromise = new Promise((resolve, reject) => {
      if ((window as any).jsQR) { resolve((window as any).jsQR); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = () => resolve((window as any).jsQR);
      s.onerror = () => reject(new Error('jsQR não disponível'));
      document.head.appendChild(s);
    });
  }
  return jsQRPromise;
}

type ScannerMode = 'detecting' | 'video' | 'text' | 'photo';

export const BarcodeScanner: React.FC<Props> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const loopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ScannerMode>('detecting');
  const [error, setError] = useState('');
  const [textInput, setTextInput] = useState('');
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'loading' | 'notFound'>('idle');

  const stopCamera = () => {
    loopRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const handleCode = useCallback((code: string) => {
    if (!code.trim()) return;
    playScanBeep();
    stopCamera();
    onScan(code.trim());
  }, [onScan]);

  // ── Modo vídeo (BarcodeDetector nativo) ──────────────────────────────────
  const startVideo = useCallback(async () => {
    setMode('video');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new BarcodeDetector({ formats: FORMATS });
      loopRef.current = true;
      const lastCode = { value: '', time: 0 };

      const scan = async () => {
        if (!loopRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const code = codes[0].rawValue.trim();
            const now = Date.now();
            if (code && (code !== lastCode.value || now - lastCode.time > 2000)) {
              lastCode.value = code;
              lastCode.time = now;
              handleCode(code);
              return;
            }
          }
        } catch {}
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (e: any) {
      loopRef.current = false;
      setError(e?.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Verifica as definições do browser.'
        : 'Não foi possível aceder à câmera.');
    }
  }, [handleCode]);

  // ── Inicialização: detectar suporte ───────────────────────────────────────
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      startVideo();
    } else {
      // Sem BarcodeDetector: mostrar opções (texto + foto)
      setMode('text');
    }
    return () => stopCamera();
  }, []);

  // Focus automático no input de texto
  useEffect(() => {
    if (mode === 'text') {
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [mode]);

  // ── Submeter código por texto ─────────────────────────────────────────────
  const handleTextSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (textInput.trim()) handleCode(textInput.trim());
  };

  // ── Captura de foto (iOS / Desktop sem BarcodeDetector) ──────────────────
  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setPhotoStatus('loading');
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // 1º: BarcodeDetector no canvas (iOS 16.4+, Chrome OS)
      if ('BarcodeDetector' in window) {
        try {
          const d = new BarcodeDetector({ formats: FORMATS });
          const codes = await d.detect(canvas);
          if (codes.length > 0) { handleCode(codes[0].rawValue.trim()); return; }
        } catch {}
      }

      // 2º: jsQR via CDN (QR codes)
      try {
        const jsQR = await loadJsQR();
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imgData.data, imgData.width, imgData.height);
        if (result?.data) { handleCode(result.data.trim()); return; }
      } catch {}

      setPhotoStatus('notFound');
      setTimeout(() => setPhotoStatus('idle'), 2000);
    } catch {
      setPhotoStatus('notFound');
      setTimeout(() => setPhotoStatus('idle'), 2000);
    }
  }, [handleCode]);

  return (
    <div className="fixed inset-0 bg-black z-[70] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-5 h-5 text-brand-400" />
          <span className="font-medium text-sm">Escanear Código de Barras</span>
        </div>
        <button onClick={() => { stopCamera(); onClose(); }}
          className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ── Modo vídeo (BarcodeDetector) ── */}
      {mode === 'video' && (
        <div className="flex-1 relative overflow-hidden">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-white/80 text-sm">{error}</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={startVideo}
                  className="px-5 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium">
                  Tentar novamente
                </button>
                <button onClick={() => setMode('text')}
                  className="px-5 py-2 border border-gray-600 text-gray-300 rounded-xl text-sm">
                  Digitar código
                </button>
              </div>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-72 h-36">
                  {['top-0 left-0 border-t border-l rounded-tl','top-0 right-0 border-t border-r rounded-tr',
                    'bottom-0 left-0 border-b border-l rounded-bl','bottom-0 right-0 border-b border-r rounded-br'].map((cls, i) => (
                    <span key={i} className={`absolute w-6 h-6 ${cls} border-brand-400`} style={{borderWidth:2.5}} />
                  ))}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-brand-400/70 animate-pulse" />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modo texto + foto (sem BarcodeDetector nativo) ── */}
      {mode === 'text' && (
        <div className="flex-1 flex flex-col items-center justify-start px-6 py-8 gap-6 overflow-y-auto">
          {/* Aviso */}
          <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 w-full max-w-sm">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-yellow-200 text-sm leading-relaxed">
              Este browser não tem scan nativo. Usa o scanner USB, digita o código, ou tira uma foto.
            </p>
          </div>

          {/* Input de texto / scanner USB */}
          <div className="w-full max-w-sm">
            <label className="flex items-center gap-2 text-gray-300 text-sm font-medium mb-2">
              <Keyboard className="w-4 h-4" />
              Scanner USB ou digitação manual
            </label>
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <input
                ref={textInputRef}
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                placeholder="EAN-13, QR, Code128..."
                className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-40 font-medium text-sm"
              >
                OK
              </button>
            </form>
            <p className="text-gray-500 text-xs mt-1.5">
              Scanners USB digitam automaticamente — posiciona o cursor no campo e escaneia
            </p>
          </div>

          {/* Separador */}
          <div className="flex items-center gap-3 w-full max-w-sm">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-gray-500 text-xs">ou</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          {/* Captura de foto */}
          <div className="w-full max-w-sm">
            <label className="flex items-center gap-2 text-gray-300 text-sm font-medium mb-2">
              <Camera className="w-4 h-4" />
              Tirar foto ao código
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
            />
            <button
              onClick={() => { setPhotoStatus('idle'); fileInputRef.current?.click(); }}
              disabled={photoStatus === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-xl transition-colors disabled:opacity-50 text-sm font-medium"
            >
              {photoStatus === 'loading' ? (
                <><Loader2 className="w-4 h-4 animate-spin" />A analisar foto...</>
              ) : photoStatus === 'notFound' ? (
                <><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-red-300">Não detectado — tenta novamente</span></>
              ) : (
                <><Upload className="w-4 h-4" />Abrir câmera / galeria</>
              )}
            </button>
            <p className="text-gray-500 text-xs mt-1.5">
              Suporta QR Code, EAN-13, EAN-8, Code 128 (via câmera do dispositivo)
            </p>
          </div>
        </div>
      )}

      {/* Footer — apenas no modo vídeo sem erro */}
      {mode === 'video' && !error && (
        <div className="shrink-0 bg-black/70 px-4 py-3 flex items-center justify-between">
          <p className="text-white/60 text-xs">EAN-8 · EAN-13 · QR · Code 128 · UPC</p>
          <button onClick={() => { stopCamera(); setMode('text'); }}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-xs transition-colors">
            <Keyboard className="w-3.5 h-3.5" />
            Digitar código
          </button>
        </div>
      )}
    </div>
  );
};
