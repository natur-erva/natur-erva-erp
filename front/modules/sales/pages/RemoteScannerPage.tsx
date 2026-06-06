/**
 * RemoteScannerPage — abre no telemóvel para scan remoto
 * URL: /scanner-remoto?session=XXXXX
 */
import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle2, AlertCircle, Wifi, XCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3060/api';

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
}

function playScanBeep(type: 'ok' | 'error' = 'ok') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'ok') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(1850, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.type = 'square'; osc.frequency.setValueAtTime(500, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    }
    osc.onended = () => ctx.close();
  } catch {}
}

export const RemoteScannerPage: React.FC = () => {
  const sessionId = new URLSearchParams(window.location.search).get('session') || '';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'sending' | 'ok' | 'error' | 'expired'>('idle');
  const [lastCode, setLastCode] = useState('');
  const [totalScanned, setTotalScanned] = useState(0);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!sessionId) { setStatus('expired'); return; }
    startCamera();
    return stopCamera;
  }, []);

  async function startCamera() {
    if (!('BarcodeDetector' in window)) {
      setCameraError('Este browser não suporta scan nativo. Use Chrome no Android.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e']
      });
      setStatus('scanning');
      const loop = async () => {
        if (!videoRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue.trim();
            const now = Date.now();
            // Evitar scan duplicado do mesmo código em 2 segundos
            if (code && (code !== lastCodeRef.current || now - lastTimeRef.current > 2000)) {
              lastCodeRef.current = code;
              lastTimeRef.current = now;
              await sendCode(code);
            }
          }
        } catch {}
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setCameraError('Não foi possível aceder à câmera. Verifica as permissões.');
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }

  async function sendCode(code: string) {
    setStatus('sending');
    try {
      const res = await fetch(`${API_BASE}/pos/scan-relay/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (res.status === 404) {
        playScanBeep('error');
        setStatus('expired');
        stopCamera();
        return;
      }
      playScanBeep('ok');
      setLastCode(code);
      setTotalScanned(n => n + 1);
      setStatus('ok');
      setTimeout(() => setStatus('scanning'), 1200);
    } catch {
      playScanBeep('error');
      setStatus('error');
      setTimeout(() => setStatus('scanning'), 1500);
    }
  }

  if (!sessionId || status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center text-white">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Sessão Inválida ou Expirada</h2>
          <p className="text-gray-400 text-sm">Gere um novo código de scanner no POS do computador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5 text-green-400" />
          <span className="font-semibold text-sm">Scanner Remoto</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="w-4 h-4 text-green-400" />
          <span className="text-green-400 text-xs font-medium">{totalScanned} scan{totalScanned !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Camera */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {cameraError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <AlertCircle className="w-14 h-14 text-red-400" />
            <p className="text-white/80 text-sm">{cameraError}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {/* Mira */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-40">
                <span className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-green-400 rounded-tl" style={{borderWidth:3}} />
                <span className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-green-400 rounded-tr" style={{borderWidth:3}} />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-green-400 rounded-bl" style={{borderWidth:3}} />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-green-400 rounded-br" style={{borderWidth:3}} />
                {status === 'scanning' && (
                  <div className="absolute inset-x-0 h-0.5 bg-green-400/80 animate-bounce" style={{top:'50%'}} />
                )}
              </div>
            </div>
            {/* Feedback overlay */}
            {status === 'ok' && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 pointer-events-none">
                <div className="bg-green-600 rounded-2xl px-6 py-4 text-center shadow-2xl">
                  <CheckCircle2 className="w-10 h-10 text-white mx-auto mb-2" />
                  <p className="text-white font-bold text-base">Enviado!</p>
                  <p className="text-green-200 text-xs mt-0.5 font-mono">{lastCode}</p>
                </div>
              </div>
            )}
            {status === 'sending' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/60 rounded-2xl px-6 py-3">
                  <p className="text-white text-sm animate-pulse">A enviar...</p>
                </div>
              </div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 pointer-events-none">
                <div className="bg-red-600 rounded-2xl px-6 py-3">
                  <p className="text-white text-sm font-medium">Erro de ligação</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black/80 px-4 py-4 text-center shrink-0">
        <p className="text-white/70 text-sm">Aponte para o código de barras / QR</p>
        <p className="text-white/40 text-xs mt-1">Os scans aparecem no POS do computador em tempo real</p>
        {lastCode && (
          <p className="text-green-400 text-xs mt-1 font-mono">Último: {lastCode}</p>
        )}
      </div>
    </div>
  );
};
