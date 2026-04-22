import { useState, useEffect, useRef, useCallback } from 'react';
import { actions } from 'astro:actions';
import { IconInfoCircle, IconMessageCircle, IconCopy, IconCheck, IconBroadcast, IconChevronDown } from '@tabler/icons-react';
import type { ChatMessage, MessageInterval, StreamMode, WaveType } from '../utils/types';
import { INTERVAL_PRESETS, DEFAULT_INTERVAL } from '../utils/types';
import GameInput from './GameInput';
import JustChattingInput from './JustChattingInput';
import ChatWindow from './ChatWindow';
import '../styles/global.css';

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <polygon points="22 11 22 13 21 13 21 14 20 14 20 15 18 15 18 16 16 16 16 17 15 17 15 18 13 18 13 19 11 19 11 20 10 20 10 21 8 21 8 22 6 22 6 23 3 23 3 22 2 22 2 2 3 2 3 1 6 1 6 2 8 2 8 3 10 3 10 4 11 4 11 5 13 5 13 6 15 6 15 7 16 7 16 8 18 8 18 9 20 9 20 10 21 10 21 11 22 11"/>
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <polygon points="23 2 23 22 22 22 22 23 15 23 15 22 14 22 14 2 15 2 15 1 22 1 22 2 23 2"/>
      <polygon points="9 2 10 2 10 22 9 22 9 23 2 23 2 22 1 22 1 2 2 2 2 1 9 1 9 2"/>
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <rect x="3" y="3" width="18" height="18" />
    </svg>
  );
}

// ============================================
// Constantes de reconexión y límites
// ============================================
const MAX_MESSAGES = 200;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

type BgMode = 'transparent' | 'solid' | 'blur';

interface Props {
  initialOverlayToken?: string | null;
}

export default function StreamerDashboard({ initialOverlayToken = null }: Props) {
  const [streamMode, setStreamMode] = useState<StreamMode>('game');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userGames, setUserGames] = useState<string[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(4);
  const [interval, setInterval] = useState<MessageInterval>(DEFAULT_INTERVAL);
  const [overlayToken, setOverlayToken] = useState<string | null>(initialOverlayToken);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [overlayInfoOpen, setOverlayInfoOpen] = useState(false);

  // Configuración de fondo del overlay
  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [bgColor, setBgColor] = useState('#000000');
  const [bgOpacity, setBgOpacity] = useState(70);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar info del usuario al montar
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const response = await fetch('/api/generate-phrases');
        if (response.ok) {
          const data = await response.json();
          setUserGames(data.games || []);
          setRemainingSlots(data.remainingSlots ?? 4);
        }
      } catch (error) {
        console.error('Error cargando info del usuario:', error);
      }
    };

    loadUserInfo();
  }, []);

  const isJustChatting = streamMode === 'justchatting';

  // El contexto activo depende del modo
  const activeContext = isJustChatting ? selectedTopic : selectedGame;

  // ============================================
  // Overlay — generar token y copiar URL
  // ============================================

  const handleGenerateOverlayToken = useCallback(async () => {
    setOverlayLoading(true);
    try {
      const { data, error } = await actions.generateOverlayToken({});
      if (data?.token) {
        setOverlayToken(data.token);
      } else if (error) {
        console.error('[Overlay] Error generando token:', error);
      }
    } catch (err) {
      console.error('[Overlay] Error generando token:', err);
    } finally {
      setOverlayLoading(false);
    }
  }, []);

  /** Construye la URL completa del overlay con la config actual */
  const buildOverlayUrl = useCallback((): string => {
    if (!overlayToken || !activeContext) return '';
    const speedIndex = INTERVAL_PRESETS.findIndex(
      (p) => p.min === interval.min && p.max === interval.max
    );
    const platform =
      (typeof document !== 'undefined' && document.documentElement.getAttribute('data-platform')) || 'twitch';

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      token: overlayToken,
      game: activeContext,
      mode: streamMode,
      speed: String(speedIndex >= 0 ? speedIndex : 2),
      platform,
      bg: bgMode,
    });

    if (bgMode === 'solid') {
      params.set('bgColor', bgColor);
      params.set('bgOpacity', String(bgOpacity));
    } else if (bgMode === 'blur') {
      params.set('bgOpacity', String(bgOpacity));
    }

    return `${base}/overlay/chat?${params.toString()}`;
  }, [overlayToken, activeContext, interval, streamMode, bgMode, bgColor, bgOpacity]);

  const handleCopyOverlayUrl = useCallback(async () => {
    const url = buildOverlayUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setOverlayCopied(true);
      setTimeout(() => setOverlayCopied(false), 2000);
    } catch {
      // Fallback — seleccionar el input
    }
  }, [buildOverlayUrl]);

  const handleGameSelect = (gameName: string) => {
    setSelectedGame(gameName);
    if (!userGames.includes(gameName.toLowerCase())) {
      setUserGames(prev => [...prev, gameName.toLowerCase()]);
      setRemainingSlots(prev => Math.max(0, prev - 1));
    }
  };

  const handleTopicSelect = (topic: string) => {
    setSelectedTopic(topic);
  };

  // Al cambiar de modo, detener el chat si estaba activo
  const handleModeSwitch = (newMode: StreamMode) => {
    if (isActive || isPaused) {
      handleStopChat();
    }
    setStreamMode(newMode);
  };

  const buildSseUrl = (context: string, iv: MessageInterval) =>
    `/api/chat-stream?game=${encodeURIComponent(context)}&min=${iv.min}&max=${iv.max}&mode=${streamMode}`;

  const openEventSource = (context: string, iv: MessageInterval, preserveMessages = false) => {
    const url = buildSseUrl(context, iv);
    const es = new EventSource(url);

    es.onmessage = (event) => {
      const newMessage: ChatMessage = JSON.parse(event.data);
      setMessages((prev) => {
        const next = [...prev, newMessage];
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      });
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error('[SSE] Sin mas intentos de reconexion, deteniendo stream');
        setIsActive(false);
        setIsPaused(false);
        setMessages([]);
        return;
      }

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempts),
        RECONNECT_MAX_DELAY
      );

      console.warn(`[SSE] Conexion perdida. Reconectando en ${delay / 1000}s (intento ${attempts + 1}/${RECONNECT_MAX_ATTEMPTS})`);

      reconnectAttemptsRef.current = attempts + 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (eventSourceRef.current === null && reconnectAttemptsRef.current > 0) {
          openEventSource(context, iv, true);
        }
      }, delay);
    };

    es.onopen = () => {
      reconnectAttemptsRef.current = 0;
    };

    eventSourceRef.current = es;
    if (!preserveMessages) setMessages([]);
  };

  const handleStartChat = () => {
    if (!activeContext) return;
    reconnectAttemptsRef.current = 0;
    setIsActive(true);
    setIsPaused(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    openEventSource(activeContext, interval, false);
  };

  const handleStopChat = () => {
    reconnectAttemptsRef.current = RECONNECT_MAX_ATTEMPTS;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsActive(false);
    setIsPaused(false);
    setMessages([]);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handlePauseChat = () => {
    if (!eventSourceRef.current) return;
    reconnectAttemptsRef.current = RECONNECT_MAX_ATTEMPTS;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsPaused(true);
    eventSourceRef.current.close();
    eventSourceRef.current = null;
  };

  const handleResumeChat = () => {
    if (!activeContext || eventSourceRef.current) return;
    reconnectAttemptsRef.current = 0;
    setIsActive(true);
    setIsPaused(false);
    openEventSource(activeContext, interval, true);
  };

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const canStart = !!activeContext && !isActive && !isPaused;
  const canPause = isActive && !isPaused;
  const canResume = isPaused && !eventSourceRef.current;
  const canStop = isActive || isPaused;

  const triggerWave = (type: WaveType) => {
    if (!isActive || isPaused) return;
    fetch('/api/chat-wave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).catch(() => {
      // Silenciar errores de red — la oleada es best-effort
    });
  };

  const WAVE_BUTTONS: { type: WaveType; emoji: string; label: string }[] = [
    { type: 'laugh', emoji: '😂', label: 'Risas'  },
    { type: 'hype',  emoji: '🔥', label: 'Hype'   },
    { type: 'fear',  emoji: '😱', label: 'Miedo'  },
    { type: 'omg',   emoji: '💀', label: 'WTF'    },
  ];

  // Label del header según modo y estado
  const headerLabel = isActive && activeContext
    ? isPaused
      ? `En pausa: ${activeContext}`
      : `${isJustChatting ? 'Chateando: ' : ''}${activeContext}`
    : isJustChatting
      ? 'Just Chatting'
      : 'selecciona un juego';

  return (
    <div className="flex bg-bg-secundary dark:bg-transparent  flex-col lg:grid lg:grid-cols-3 lg:grid-rows-1 flex-1 min-h-0 gap-px ">

      {/* ============================================ */}
      {/* Panel de Control — columna izquierda         */}
      {/* ============================================ */}
      <div className="relative  flex flex-col gap-y-6 overflow-y-auto  p-5 sm:p-6">

       

        {/* Meta-label — esquina superior derecha */}
        <span className="absolute top-3 right-3 font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-40 leading-tight pointer-events-none select-none hidden sm:block">
          CTRL · 01
        </span>

        {/* ============================================ */}
        {/* Título / estado del stream                  */}
        {/* ============================================ */}
        <div className="pt-1">
          {/* Eyebrow tag — estado */}
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 border border-black/30 dark:border-white/20 bg-black/[0.04] dark:bg-black mb-3">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isActive && !isPaused ? 'bg-primary animate-pulse' : isPaused ? 'bg-yellow-500' : 'bg-black/25 dark:bg-white/25'}`}
              aria-hidden="true"
            />
            <span className="font-jet text-[0.6rem] uppercase tracking-[0.18em]">
              {isActive && !isPaused ? 'En vivo' : isPaused ? 'En pausa' : 'Inactivo'}
            </span>
          </div>

          <p className="font-rocket text-3xl uppercase text-black dark:text-white leading-none">
            {isActive && !isPaused ? 'Streaming:' : 'Stream:'}
          </p>
          <h1 className="font-departure text-xl text-primary uppercase mt-0.5">
            {headerLabel}
          </h1>
        </div>

        {/* ============================================ */}
        {/* Separador técnico con label                 */}
        {/* ============================================ */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
            <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
          </div>
          <h2 className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Categoría</h2>
          <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
          <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">CAT · MODE</span>
        </div>

        {/* Botón Just Chatting */}
        <div>
          <button
            onClick={() => handleModeSwitch(isJustChatting ? 'game' : 'justchatting')}
            disabled={isActive && !isPaused}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-jet border transition-colors
              ${isJustChatting
                ? 'bg-primary text-bg-primary border-primary'
                  : isActive && !isPaused
                    ? 'bg-transparent border-black/30 dark:border-white/15 dark:bg-black text-black/40 dark:text-white/30 cursor-not-allowed'
                    : 'bg-transparent border-black/40 dark:border-white/30 dark:bg-black text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer'
              }
            `}
            style={isJustChatting ? { color: 'var(--color-primary-text)' } : undefined}
            title={isActive && !isPaused ? 'Detén el stream para cambiar de modo' : isJustChatting ? 'Volver a modo videojuego' : 'Activar Just Chatting'}
          >
            <IconMessageCircle size={13} />
            <span className="uppercase tracking-[0.1em]">Just Chatting</span>
            <span className={`ml-1 w-1.5 h-1.5 rounded-full ${isJustChatting ? 'bg-current' : 'bg-black/20 dark:bg-white/20'}`} />
          </button>
        </div>

        {/* Input condicional: Game o Just Chatting */}
        {isJustChatting ? (
          <JustChattingInput
            selectedTopic={selectedTopic}
            onTopicSelect={handleTopicSelect}
            disabled={isActive || isPaused}
          />
        ) : (
          <GameInput
            selectedGame={selectedGame}
            onGameSelect={handleGameSelect}
            disabled={isActive || isPaused}
            userGames={userGames}
            remainingSlots={remainingSlots}
          />
        )}
        

        {/* ============================================ */}
        {/* Separador — controles de stream             */}
        {/* ============================================ */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
            <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
          </div>
          <span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Control</span>
          <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
          <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">STREAM · CTRL</span>
        </div>

        {/* Play / Pause / Stop */}
        <div className="flex items-center gap-2">
          <button
            onClick={isPaused ? handleResumeChat : handleStartChat}
            disabled={isPaused ? !canResume : !canStart}
            className={`w-11 h-11 flex items-center justify-center transition-all ${
              (isPaused ? !canResume : !canStart)
                ? 'bg-primary/60 cursor-not-allowed'
                : 'bg-primary hover:opacity-85 hover:-translate-y-px active:translate-y-0'
            }`}
            title={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'}
            aria-label={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'}
          >
            <PlayIcon className={(isPaused ? !canResume : !canStart) ? 'text-bg-primary/40' : 'text-bg-primary'} />
          </button>

          <button
            onClick={handlePauseChat}
            disabled={!canPause}
            className={`w-11 h-11 flex items-center justify-center transition-all ${
              !canPause
                ? 'bg-primary/60 cursor-not-allowed'
                : 'bg-primary hover:opacity-85 hover:-translate-y-px active:translate-y-0'
            }`}
            title="Pausar Chat"
            aria-label="Pausar Chat"
          >
            <PauseIcon className={!canPause ? 'text-bg-primary/40' : 'text-bg-primary'} />
          </button>

          <button
            onClick={handleStopChat}
            disabled={!canStop}
            className={`w-11 h-11 flex items-center  justify-center transition-all ${
              !canStop
                ? 'bg-primary/60  cursor-not-allowed'
                : 'bg-primary hover:opacity-85 hover:-translate-y-px active:translate-y-0'
            }`}
            title="Detener Chat"
            aria-label="Detener Chat"
          >
            <StopIcon className={!canStop ? 'text-bg-primary/40' : 'text-bg-primary'} />
          </button>

          {/* Estado inline */}
          <span className="font-jet text-[0.6rem] uppercase tracking-[0.12em] text-black/35 dark:text-white/30 ml-1 hidden sm:block">
            {isActive && !isPaused ? '● Live' : isPaused ? '⏸ Pausa' : '○ Off'}
          </span>
        </div>
         {/* ============================================ */}
        {/* Separador — OBS Overlay                     */}
        {/* ============================================ */}
        {activeContext && (
          <>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
                <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
              </div>
              <span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">OBS Overlay</span>
              <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
              <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">OBS · SRC</span>
            </div>

            <div className="flex flex-col gap-2">
              {!overlayToken ? (
                <>
                  {/* Hint — qué puede hacer el usuario antes de generar */}
                  <p className="font-jet text-xs text-black/50 dark:text-white/40 leading-relaxed border-l-2 border-primary/40 pl-2">
                    Genera una URL para usar el chat como overlay en OBS. Podrás elegir entre fondo transparente, color sólido o blur antes de copiarla.
                  </p>
                  <button
                    onClick={handleGenerateOverlayToken}
                    disabled={overlayLoading}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-jet border transition-all uppercase tracking-[0.1em]
                      ${overlayLoading
                        ? 'border-black/20 dark:border-white/15 dark:bg-black text-black/35 dark:text-white/25 cursor-wait'
                        : 'border-black/35 dark:border-white/25 dark:bg-black text-black/60 dark:text-white/50 hover:border-primary hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer'
                      }`}
                  >
                    <IconBroadcast size={14} />
                    {overlayLoading ? 'Generando...' : 'Generar URL para OBS'}
                  </button>
                </>
              ) : (
                <>
                  {/* Selector de modo de fondo */}
                  <div className="flex gap-1">
                    {([
                      { value: 'transparent', label: 'Transparente' },
                      { value: 'solid', label: 'Color' },
                      { value: 'blur', label: 'Blur' },
                    ] as { value: BgMode; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setBgMode(value)}
                        className={`flex-1 py-1.5 text-xs font-jet border uppercase tracking-[0.08em] transition-all cursor-pointer
                          ${bgMode === value
                            ? 'bg-primary text-bg-primary border-primary'
                            : 'border-black/30 dark:border-white/15 dark:bg-black text-black/50 dark:text-white/40 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white'
                          }`}
                        style={bgMode === value ? { color: 'var(--color-primary-text)' } : undefined}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Opciones según modo */}
                  {bgMode === 'solid' && (
                    <div className="flex items-center gap-2">
                      <label className="font-jet text-xs text-black/50 dark:text-white/40 uppercase tracking-[0.08em] flex-shrink-0">Color</label>
                      <input
                        type="color"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="w-7 h-7 border border-black/30 dark:border-white/15 cursor-pointer bg-transparent p-0.5"
                        title="Seleccionar color de fondo"
                      />
                      <label className="font-jet text-xs text-black/50 dark:text-white/40 uppercase tracking-[0.08em] flex-shrink-0">Opac. {bgOpacity}%</label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={bgOpacity}
                        onChange={(e) => setBgOpacity(Number(e.target.value))}
                        className="flex-1 accent-primary h-1 cursor-pointer"
                      />
                    </div>
                  )}

                  {bgMode === 'blur' && (
                    <div className="flex items-center gap-2">
                      <label className="font-jet text-xs text-black/50 dark:text-white/40 uppercase tracking-[0.08em] flex-shrink-0">Opac. {bgOpacity}%</label>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={bgOpacity}
                        onChange={(e) => setBgOpacity(Number(e.target.value))}
                        className="flex-1 accent-primary h-1 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* URL + copiar */}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      readOnly
                      value={buildOverlayUrl()}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-jet border border-black/30 dark:border-white/15 bg-black/[0.03] dark:bg-black text-black/60 dark:text-white/50 truncate select-all focus:outline-none focus:border-primary/50"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={handleCopyOverlayUrl}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center border border-black/30 dark:border-white/15 dark:bg-black text-black/50 dark:text-white/40 hover:border-primary hover:bg-primary/10 hover:text-black dark:hover:text-white transition-all cursor-pointer"
                      title="Copiar URL"
                    >
                      {overlayCopied ? <IconCheck size={13} className="text-green-400" /> : <IconCopy size={13} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-jet text-xs text-black/45 dark:text-white/35 leading-relaxed">
                      Pega esta URL como Browser Source en OBS
                    </p>
                    <button
                      onClick={handleGenerateOverlayToken}
                      disabled={overlayLoading}
                      className="font-jet text-xs text-black/40 dark:text-white/30 hover:text-primary transition-colors cursor-pointer uppercase tracking-[0.06em]"
                    >
                      Regenerar
                    </button>
                  </div>

                  {/* Info card colapsable — instrucciones de configuración */}
                  <div className="border border-black/20 dark:border-white/10 bg-black/[0.02] dark:bg-black">
                    <button
                      onClick={() => setOverlayInfoOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 cursor-pointer group"
                      aria-expanded={overlayInfoOpen}
                    >
                      <div className="flex items-center gap-1.5">
                        <IconInfoCircle size={14} className="text-black/40 dark:text-white/30 flex-shrink-0" />
                        <span className="font-jet text-xs uppercase tracking-[0.1em] text-black/50 dark:text-white/40 group-hover:text-black dark:group-hover:text-white transition-colors">
                          Cómo configurar el fondo
                        </span>
                      </div>
                      <IconChevronDown
                        size={14}
                        className={`text-black/30 dark:text-white/25 transition-transform duration-200 ${overlayInfoOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {overlayInfoOpen && (
                      <div className="px-3 pb-3 flex flex-col gap-2 border-t border-black/10 dark:border-white/8 pt-2">
                        {/* Modos de fondo */}
                        <p className="font-jet text-xs text-black/60 dark:text-white/50 uppercase tracking-[0.08em]">Modos de fondo</p>
                        <ul className="flex flex-col gap-1.5">
                          {[
                            { label: 'Transparente', desc: 'Sin fondo. El chat flota sobre el juego. Ideal si OBS tiene chroma o captura por ventana.' },
                            { label: 'Color sólido', desc: 'Fondo de color con opacidad ajustable. Elige el color y transparencia que mejor contraste con tu stream.' },
                            { label: 'Blur', desc: 'Fondo negro semitransparente con efecto cristal. Da legibilidad sin tapar el juego.' },
                          ].map(({ label, desc }) => (
                            <li key={label} className="flex gap-2">
                              <span className="font-jet text-xs text-primary uppercase tracking-[0.06em] flex-shrink-0 mt-px">{label}</span>
                              <span className="font-jet text-xs text-black/50 dark:text-white/40 leading-relaxed">{desc}</span>
                            </li>
                          ))}
                        </ul>

                        {/* Instrucciones para cambiar sin regenerar */}
                        <p className="font-jet text-xs text-black/60 dark:text-white/50 uppercase tracking-[0.08em] mt-1">¿Quieres cambiar el fondo después?</p>
                        <ol className="flex flex-col gap-1.5 list-none">
                          {[
                            'Ajusta las opciones de fondo aquí arriba.',
                            'La URL se actualiza automáticamente — no necesitas regenerar el token.',
                            'En OBS: clic derecho al Browser Source → Propiedades → reemplaza la URL.',
                          ].map((step, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="font-jet text-xs text-primary/70 flex-shrink-0">{i + 1}.</span>
                              <span className="font-jet text-xs text-black/50 dark:text-white/40 leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* Separador — reacciones                      */}
        {/* ============================================ */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
            <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
          </div>
          <span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Reacciones</span>
          <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
          <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">WAVE · EVT</span>
        </div>

        {/* Botones de oleada */}
        <div className="flex gap-1.5">
          {WAVE_BUTTONS.map(({ type, emoji, label }) => (
            <button
              key={type}
              onClick={() => triggerWave(type)}
              disabled={!isActive || isPaused}
              title={
                !isActive || isPaused
                  ? 'Inicia el stream para lanzar una oleada'
                  : `Lanzar oleada de ${label.toLowerCase()}`
              }
              className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs font-jet border transition-all
                ${isActive && !isPaused
                  ? 'border-black/35 dark:border-white/25 dark:bg-black text-black/60 dark:text-white/50 hover:border-primary hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer active:scale-95'
                  : 'border-black/15 dark:border-white/10 dark:bg-black text-black/25 dark:text-white/15 cursor-not-allowed'
                }`}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className="uppercase tracking-[0.08em] text-[0.55rem]">{label}</span>
            </button>
          ))}
        </div>

        {/* ============================================ */}
        {/* Separador — velocidad                       */}
        {/* ============================================ */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
            <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
          </div>
          <span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Velocidad</span>
          <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
          <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">MSG · RATE</span>
        </div>

        {/* Presets de velocidad */}
        <div className="flex gap-1.5">
          {INTERVAL_PRESETS.map((preset) => {
            const isSelected = preset.min === interval.min && preset.max === interval.max;
            const isDisabled = isActive && !isPaused;
            return (
              <button
                key={preset.label}
                onClick={() => setInterval(preset)}
                disabled={isDisabled}
                title={isDisabled ? 'Detén el stream para cambiar la velocidad' : `Un mensaje cada ${preset.label}`}
                className={`flex-1 py-1.5 text-xs font-jet border transition-all uppercase tracking-[0.08em]
                  ${isSelected
                      ? 'bg-primary text-bg-primary border-primary'
                      : isDisabled
                        ? 'bg-transparent border-black/20 dark:border-white/15 dark:bg-black text-black/35 dark:text-white/25 cursor-not-allowed'
                        : 'bg-transparent border-black/35 dark:border-white/25 dark:bg-black text-black/50 dark:text-white/45 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer'
                  }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        

        {/* ============================================ */}
        {/* Info card técnica                           */}
        {/* ============================================ */}
        <div className="relative border border-black dark:border-white/10 p-4 bg-black/[0.03] dark:bg-black">
          {/* Corner marks */}
          <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t border-l border-black dark:border-white/15" aria-hidden="true" />
          <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b border-r border-black dark:border-white/15" aria-hidden="true" />
          {/* Meta-label */}
          <span className="absolute top-2 right-2 font-jet text-[0.5rem] uppercase tracking-[0.08em] opacity-40 pointer-events-none select-none">INFO</span>

          <div className="flex gap-1.5 items-center mb-2">
            <IconInfoCircle className="text-black dark:text-white flex-shrink-0" size={14} />
            <p className="font-departure text-sm text-black dark:text-white/70 uppercase tracking-wider">Cómo funciona</p>
          </div>
          <p className="font-jet text-[0.7rem] text-black/45 dark:text-white/35 leading-relaxed">
            {isJustChatting
              ? 'Escribe un tema o elige uno de los sugeridos. La IA generará comentarios como si fuera un stream de Just Chatting.'
              : 'Escribe cualquier videojuego y la IA generará comentarios de chat personalizados. Límite de 4 juegos. Elige la velocidad antes de iniciar.'
            }
          </p>
          <p className="font-jet text-[0.7rem] text-black/45 dark:text-white/35 leading-relaxed mt-2">
            Con el stream activo usa los botones de Reacciones para lanzar oleadas de mensajes.
          </p>
        </div>

        {/* Checker accent — esquina inferior izquierda */}
        <div
          className="absolute bottom-0 left-0 w-16 h-4 opacity-40 pointer-events-none"
          style={{
            backgroundImage: 'repeating-conic-gradient(rgba(0,0,0,1) 0% 25%, transparent 0% 50%)',
            backgroundSize: '8px 8px',
          }}
          aria-hidden="true"
        />

       
      </div>

      {/* ============================================ */}
      {/* Ventana de Chat — columnas 2 y 3            */}
      {/* ============================================ */}
      <div className="relative lg:col-span-2 flex flex-col min-h-0 bg-bg-secundary dark:bg-black ">
  
        <ChatWindow messages={messages} isActive={isActive} />
      </div>

    </div>
  );
}
