import { useState, useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatMessage as ChatMessageType, StreamMode } from '../utils/types';
import { INTERVAL_PRESETS } from '../utils/types';
import ChatMessage from './ChatMessage';

type FontSize = 'small' | 'medium' | 'large';

interface ChatOverlayProps {
  token: string;
  game: string;
  mode: StreamMode;
  speed: number;
  platform: 'twitch' | 'kick';
  bg?: 'transparent' | 'solid' | 'blur';
  bgColor?: string;
  bgOpacity?: number;
  fontSize?: FontSize;
}

// ============================================
// Constantes de reconexión y límites
// ============================================
const MAX_MESSAGES = 200;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

export default function ChatOverlay({ token, game, mode, speed, platform, bg = 'transparent', bgColor = '#000000', bgOpacity = 70, fontSize = 'medium' }: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'connected'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [startTime] = useState(() => Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Resolver el intervalo desde el índice de speed
  const interval = INTERVAL_PRESETS[speed] ?? INTERVAL_PRESETS[2];

  // Calcular estilo de fondo según configuración
  const bgStyle = (() => {
    if (bg === 'solid') {
      // Convertir hex + opacidad a rgba
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})` };
    }
    if (bg === 'blur') {
      return {
        backgroundColor: `rgba(0, 0, 0, ${bgOpacity / 100})`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      } as React.CSSProperties;
    }
    return {};
  })();

  // Construir la URL del SSE
  const buildSseUrl = useCallback(
    () => `/api/chat-stream?token=${encodeURIComponent(token)}&game=${encodeURIComponent(game)}&min=${interval.min}&max=${interval.max}&mode=${mode}`,
    [token, game, interval.min, interval.max, mode]
  );

  // Abrir conexión SSE
  const openEventSource = useCallback((preserveMessages = false) => {
    const url = buildSseUrl();
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const newMessage: ChatMessageType = JSON.parse(event.data);
        setMessages((prev) => {
          const next = [...prev, newMessage];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      } catch {
        // Ignorar mensajes malformados (heartbeats, stream-end, etc.)
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error('[Overlay] Sin mas intentos de reconexion');
        setStatus('error');
        setErrorMsg('Conexión perdida. Recarga la URL en OBS.');
        return;
      }

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempts),
        RECONNECT_MAX_DELAY
      );

      console.warn(`[Overlay] Reconectando en ${delay / 1000}s (intento ${attempts + 1}/${RECONNECT_MAX_ATTEMPTS})`);

      reconnectAttemptsRef.current = attempts + 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (eventSourceRef.current === null && reconnectAttemptsRef.current > 0) {
          openEventSource(true);
        }
      }, delay);
    };

    es.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setStatus('connected');
    };

    eventSourceRef.current = es;
    if (!preserveMessages) setMessages([]);
  }, [buildSseUrl]);

  // Inicialización: generar frases y conectar al stream
  useEffect(() => {
    // Validar params mínimos
    if (!token || !game) {
      setStatus('error');
      setErrorMsg('Faltan parámetros: token y game son obligatorios.');
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // Asegurar que las frases existen en cache del servidor
        const res = await fetch(
          `/api/generate-phrases?token=${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameName: game, mode }),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Error desconocido' }));
          if (cancelled) return;
          setStatus('error');
          setErrorMsg(data.error ?? `Error ${res.status}`);
          return;
        }

        if (cancelled) return;

        // Frases listas — abrir stream SSE
        openEventSource(false);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Error de red');
      }
    }

    init();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [token, game, mode, openEventSource]);

  // Render de cada mensaje (reutiliza ChatMessage existente)
  const itemContent = useCallback(
    (index: number, message: ChatMessageType) => (
      <ChatMessage
        message={message}
        startTime={startTime}
        isAlternate={index % 2 === 1}
        fontSize={fontSize}
      />
    ),
    [startTime, fontSize],
  );

  // Estado de error — visible en OBS para diagnosticar problemas
  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="border border-red-500/50 bg-red-500/10 px-4 py-3 max-w-md">
          <p className="font-jet text-xs text-red-400 uppercase tracking-wider mb-1">Overlay Error</p>
          <p className="font-jet text-sm text-white/70">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Estado de carga
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-jet text-xs text-white/40 uppercase tracking-wider animate-pulse">
          Conectando...
        </p>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full w-full overflow-hidden" style={bgStyle}>
      {/* Virtuoso con fondo transparente — solo muestra mensajes */}
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%', visibility: isEmpty ? 'hidden' : 'visible' }}
        data={messages}
        itemContent={itemContent}
        followOutput={() => 'smooth'}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        increaseViewportBy={200}
      />
    </div>
  );
}
