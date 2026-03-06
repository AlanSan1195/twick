import { useState, useEffect, useRef } from 'react';
import { IconInfoCircle, IconMessageCircle } from '@tabler/icons-react';
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

const MAX_MESSAGES = 200;

// Backoff exponencial: 1s → 2s → 4s → 8s → 16s (tope en 30s)
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

export default function StreamerDashboard() {
  const [streamMode, setStreamMode] = useState<StreamMode>('game');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userGames, setUserGames] = useState<string[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(4);
  const [interval, setInterval] = useState<MessageInterval>(DEFAULT_INTERVAL);
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

  const isJustChatting = streamMode === 'justchatting';

  // El contexto activo depende del modo
  const activeContext = isJustChatting ? selectedTopic : selectedGame;

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

      // Si se agotaron los intentos o el stream ya no esta activo, parar definitivamente
      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error('[SSE] Sin mas intentos de reconexion, deteniendo stream');
        setIsActive(false);
        setIsPaused(false);
        setMessages([]);
        return;
      }

      // Backoff exponencial con tope en RECONNECT_MAX_DELAY
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempts),
        RECONNECT_MAX_DELAY
      );

      console.warn(`[SSE] Conexion perdida. Reconectando en ${delay / 1000}s (intento ${attempts + 1}/${RECONNECT_MAX_ATTEMPTS})`);

      reconnectAttemptsRef.current = attempts + 1;
      reconnectTimerRef.current = setTimeout(() => {
        // Verificar que el usuario no haya pausado/detenido mientras esperabamos
        if (eventSourceRef.current === null && reconnectAttemptsRef.current > 0) {
          openEventSource(context, iv, true);
        }
      }, delay);
    };

    es.onopen = () => {
      // Conexion establecida (o restablecida): resetear contador de intentos
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
    openEventSource(activeContext, interval, false);
  };

  const handleStopChat = () => {
    reconnectAttemptsRef.current = RECONNECT_MAX_ATTEMPTS; // impide reconexion pendiente
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
    reconnectAttemptsRef.current = RECONNECT_MAX_ATTEMPTS; // impide reconexion pendiente
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
      : `${isJustChatting ? 'Chateando: ' : ' '}${activeContext}`
    : isJustChatting
      ? 'Just Chatting'
      : 'selecciona un juego o un tema';


  const headerTitle = isActive    ? isPaused
      ? `Stream en pausa: ${activeContext}`
      : `Stream activo: ${activeContext}`
    : 'Streamer Dashboard';

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-3 lg:grid-rows-1 lg:flex-1 lg:min-h-0 h-full p-1 gap-x-4  ">
      {/* Panel de Control - Left side */}
      <div className=" flex flex-col gap-y-7 sm:justify-around overflow-y-auto border border-black/20 p-4 bg-black/25 mb-4 h-full dark:bg-transparent dark:shadow-none dark:border-0  rounded-sm ">
        {/* Logo/Title */}
        <div>
          <p className="text-4xl font-rocket uppercase">
            {isActive && !isPaused ? 'Streaming:' : 'Stream:'}
          </p>
          <h1 className="text-3xl text-primary uppercase font-departure">
            {headerLabel}
          </h1>
        </div>

        <div className='flex flex-col gap-y-1 '>

        {/* Panel de Control Title */}
        <h2 className="text-xl font-jet font-bold u m-0  ">Categoria</h2>

        {/* Botón Just Chatting */}
        <div>
          <button
            onClick={() => handleModeSwitch(isJustChatting ? 'game' : 'justchatting')}
            disabled={isActive && !isPaused}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-jet border-[1px] rounded-xs transition-colors
              ${isJustChatting
                ? 'bg-primary text-bg-primary border-primary'
                : isActive && !isPaused
                  ? 'bg-transparent border-black/50 dark:border-white/20 text-black/60 dark:text-white/35 cursor-not-allowed'
                  : 'bg-transparent dark:hover:bg-primary/30 border-black/50 dark:border-white/50 text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/40 hover:text-black dark:hover:text-white cursor-pointer'
              }
            `}
            style={isJustChatting ? { color: 'var(--color-primary-text)' } : undefined}
            title={isActive && !isPaused ? 'Detén el stream para cambiar de modo' : isJustChatting ? 'Volver a modo videojuego' : 'Activar Just Chatting'}
          >
            <IconMessageCircle size={15} />
            Just Chatting
            <span className={`ml-1 w-1.5 h-1.5 rounded-full ${isJustChatting ? 'bg-current' : 'bg-black/20 dark:bg-white/20'}`} />
          </button>
        </div>
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

        {/* Play/Pause/Stop Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={isPaused ? handleResumeChat : handleStartChat}
            disabled={isPaused ? !canResume : !canStart}
            className={`w-12 h-12 flex items-center justify-center transition-all rounded-sm ${
              isPaused
                ? !canResume
                  ? 'bg-primary/60 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary hover:scale-105'
                : !canStart
                  ? 'bg-primary/60 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary hover:scale-105'
            }`}
            title={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'}
          >
            <PlayIcon
              className={
                isPaused
                  ? !canResume
                    ? 'text-bg-primary/50'
                    : 'text-bg-primary'
                  : !canStart
                    ? 'text-bg-primary/50'
                    : 'text-bg-primary'
              }
            />
          </button>

          <button
            onClick={handlePauseChat}
            disabled={!canPause}
            className={`w-12 h-12 flex items-center justify-center transition-all rounded-sm ${
              !canPause
                ? 'bg-primary/60 cursor-not-allowed'
                : 'bg-primary hover:scale-105'
            }`}
            title="Pausar Chat"
          >
            <PauseIcon className={!canPause ? 'text-bg-primary/50' : 'text-bg-primary'} />
          </button>

          <button
            onClick={handleStopChat}
            disabled={!canStop}
            className={`w-12 h-12 flex items-center justify-center transition-all rounded-sm ${
             !canPause
                ? 'bg-primary/60 cursor-not-allowed'
                : 'bg-primary hover:scale-105'
            }`}
            title="Detener Chat"
          >
            <StopIcon className={!canPause ? 'text-bg-primary/50' : 'text-bg-primary'} />
          </button>
        </div>

        {/* Botones de oleada de reacciones */}
        <div className="space-y-3">
          <p className="text-xl font-jet font-bold">Reacciones del chat</p>
          <div className="flex gap-2">
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
                className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs font-jet rounded-xs border transition-all
                  ${isActive && !isPaused
                    ? 'border-black/50 dark:border-white/30 text-black/70 dark:text-white/60 hover:border-primary hover:bg-primary/20 hover:text-black dark:hover:text-white cursor-pointer active:scale-95'
                    : 'border-black/20 dark:border-white/10 text-black/30 dark:text-white/20 cursor-not-allowed'
                  }`}
              >
                <span className="text-base leading-none">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Interval Selector */}
        <div className="space-y-3">
          <p className="text-xl font-jet font-bold   ">Velocidad de mensajes</p>
          <div className="flex gap-2">
            {INTERVAL_PRESETS.map((preset) => {
              const isSelected = preset.min === interval.min && preset.max === interval.max;
              const isDisabled = isActive && !isPaused;
              return (
                <button
                  key={preset.label}
                  onClick={() => setInterval(preset)}
                  disabled={isDisabled}
                  title={isDisabled ? 'Detén el stream para cambiar la velocidad' : `Un mensaje cada ${preset.label}`}
                  className={`flex-1 py-1.5 text-xs font-jet  rounded-xs border 
                    ${isSelected
                      ? 'bg-primary text-bg-primary border-primary'
                      : isDisabled
                        ? 'bg-transparent border-black/50 dark:border-white/20 text-black/60 dark:text-white/35 cursor-not-allowed'
                        : 'bg-transparent dark:hover:bg-primary/30  border-black/50 dark:border-white/50 text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/40  hover:text-black dark:hover:text-white'
                    }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Info Card */}
        <div className="flex gap-2 px-3 py-3 border rounded-sm border-black/15 dark:border-white/10 bg-terminal  transition-colors text-xs select-none ">
          <div className="space-y-1 ">
            <div className="flex gap-x-1 items-center">
              <IconInfoCircle className="text-primary mt-0.5" size={16} />
              <p className="text-lg font-departure  text-primary">Como funciona</p>
            </div>
            <p className="text-white font-jet leading-relaxed opacity-40">
              {isJustChatting
                ? 'Escribe un tema o elige uno de los sugeridos. La IA generará comentarios de chat como si fuera un stream de Just Chatting.'
                : 'Escribe cualquier videojuego y la IA generara comentarios de chat personalizados. Tienes un limite de 4 juegos. Elige la velocidad de mensajes antes de iniciar el stream.'
              }
            </p>
            <p className="text-white font-jet leading-relaxed opacity-40">
              Con el stream activo, usa los botones de <span className="opacity-100">Reacciones del chat</span> para lanzar una oleada: el chat respondera con una rafaga de mensajes del tipo que elijas. Si lanzas varias seguidas, se encolan una detras de otra.
            </p>
          </div>
        </div>
      </div>

      {/* Ventana de Chat - Right side */}

        <ChatWindow messages={messages} isActive={isActive} />

    </div>
  );
}
