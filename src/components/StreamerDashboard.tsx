import { useState, useEffect, useRef, useCallback } from 'react';
import { actions } from 'astro:actions';
import {
  IconMessageCircle,
  IconMessageChatbot,
  IconQuestionMark,
  IconMoodCrazyHappy,
  IconCoffee,
  IconMoodWink,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
} from '@tabler/icons-react';
import type {
  AudiencePersonality,
  ChatAppearance,
  ChatAppearanceInput,
  ChatMessage,
  GeneratePhrasesResponse,
  MessageInterval,
  OverlayFontSize,
  OverlayVisualConfig,
  StreamMode,
  WaveType,
  VoiceReactResponse,
  VoiceTurn,
} from '../utils/types';
import {
  AUDIENCE_PERSONALITY_OPTIONS,
  CHAT_APPEARANCE_PRESETS,
  DEFAULT_AUDIENCE_PERSONALITY,
  DEFAULT_CHAT_APPEARANCE,
  DEFAULT_INTERVAL,
  INTERVAL_PRESETS,
  normalizeOverlayVisualConfig,
  normalizeChatAppearance,
  resolveAudiencePersonality,
  resolveStoredChatAppearance,
} from '../utils/types';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import VoiceWaveform from './VoiceWaveform';
import GameInput from './GameInput';
import JustChattingInput from './JustChattingInput';
import ChatWindow from './ChatWindow';
import OverlayControls from './OverlayControls';
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
const PLATFORM_STORAGE_KEY = 'preferred-platform';
const PERSONALITY_STORAGE_KEY = 'audience-personality';
const MIC_SENSITIVITY_STORAGE_KEY = 'mic-sensitivity';
const MIC_NOISE_FILTER_STORAGE_KEY = 'mic-noise-filter';
const CHAT_APPEARANCE_STORAGE_KEY = 'chat-appearance:v1';

// Valores por defecto de las perillas del micrófono (0–100)
const DEFAULT_MIC_SENSITIVITY = 60; // → umbral RMS 0.08
const DEFAULT_MIC_NOISE_FILTER = 45; // → confirmación 180ms

/** Sensibilidad 0–100 (más = capta más fácil) → umbral RMS [0.14 cerrado … 0.04 abierto] */
function sensitivityToRms(sensitivity: number): number {
  return 0.14 - (sensitivity / 100) * 0.1;
}

/** Filtro 0–100 (más = ignora más ruidos cortos) → confirmación de voz [0 … 400] ms */
function noiseFilterToMs(filter: number): number {
  return Math.round((filter / 100) * 400);
}

/** Lee un número 0–100 de localStorage con fallback */
function readStoredLevel(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
}

function createVoiceSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Platform = OverlayVisualConfig['platform'];

const PERSONALITY_ICONS: Record<AudiencePersonality, typeof IconMessageChatbot> = {
  sarcastic: IconMoodWink,
  normal: IconMessageChatbot,
  curious: IconQuestionMark,
  chaotic: IconMoodCrazyHappy,
  chill: IconCoffee,
};

interface Props {
  initialOverlayToken?: string | null;
}

export default function StreamerDashboard({ initialOverlayToken = null }: Props) {
  const [streamMode, setStreamMode] = useState<StreamMode>('game');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [audiencePersonality, setAudiencePersonality] = useState<AudiencePersonality>(DEFAULT_AUDIENCE_PERSONALITY);
  const [isActive, setIsActive] = useState(false);
  const [platform, setPlatform] = useState<'twitch' | 'kick'>('twitch');

  useEffect(() => {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (stored === 'kick' || stored === 'twitch') {
      setPlatform(stored);
    }
    setAudiencePersonality(resolveAudiencePersonality(localStorage.getItem(PERSONALITY_STORAGE_KEY)));
    setMicSensitivity(readStoredLevel(MIC_SENSITIVITY_STORAGE_KEY, DEFAULT_MIC_SENSITIVITY));
    setMicNoiseFilter(readStoredLevel(MIC_NOISE_FILTER_STORAGE_KEY, DEFAULT_MIC_NOISE_FILTER));
  }, []);
  const [isPaused, setIsPaused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userGames, setUserGames] = useState<string[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(4);
  const [interval, setInterval] = useState<MessageInterval>(DEFAULT_INTERVAL);
  const [overlayToken, setOverlayToken] = useState<string | null>(initialOverlayToken);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [preparingPersonality, setPreparingPersonality] = useState<AudiencePersonality | null>(null);

  const [fontSize, setFontSize] = useState<OverlayFontSize>('medium');
  const [chatAppearance, setChatAppearance] = useState<ChatAppearance>(DEFAULT_CHAT_APPEARANCE);
  const [chatAppearanceReady, setChatAppearanceReady] = useState(false);
  const [overlayConfigReady, setOverlayConfigReady] = useState(false);
  const [overlaySaveState, setOverlaySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [enableInitialGreetings, setEnableInitialGreetings] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  // Perillas del micrófono (0–100), ajustables desde la UI y persistidas
  const [micSensitivity, setMicSensitivity] = useState(DEFAULT_MIC_SENSITIVITY);
  const [micNoiseFilter, setMicNoiseFilter] = useState(DEFAULT_MIC_NOISE_FILTER);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalityRequestIdRef = useRef(0);
  const overlaySaveSequenceRef = useRef(0);
  const overlaySaveQueueRef = useRef(Promise.resolve());
  const voiceSessionIdRef = useRef<string | null>(null);
  const voiceSequenceRef = useRef(0);
  const voiceContextRef = useRef<VoiceTurn[]>([]);
  const voiceProcessingRef = useRef(false);
  const pendingVoiceBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const storedAppearance = resolveStoredChatAppearance(localStorage.getItem(CHAT_APPEARANCE_STORAGE_KEY));
    const storedPlatform = localStorage.getItem(PLATFORM_STORAGE_KEY);
    const localPlatform: Platform = storedPlatform === 'kick' ? 'kick' : 'twitch';
    const isPreviousCardsDefault = storedAppearance.preset === 'cards'
      && storedAppearance.messageGap === CHAT_APPEARANCE_PRESETS.cards.messageGap
      && storedAppearance.alignment === CHAT_APPEARANCE_PRESETS.cards.alignment
      && storedAppearance.padding === CHAT_APPEARANCE_PRESETS.cards.padding
      && storedAppearance.radius === CHAT_APPEARANCE_PRESETS.cards.radius
      && storedAppearance.cardColor === CHAT_APPEARANCE_PRESETS.cards.cardColor
      && storedAppearance.cardOpacity === CHAT_APPEARANCE_PRESETS.cards.cardOpacity
      && storedAppearance.borderWidth === CHAT_APPEARANCE_PRESETS.cards.borderWidth
      && storedAppearance.borderColor === CHAT_APPEARANCE_PRESETS.cards.borderColor;
    // Las instalaciones que solo recibieron el default de Tarjetas vuelven al estilo original.
    const localConfig = normalizeOverlayVisualConfig({
      appearance: isPreviousCardsDefault ? { ...DEFAULT_CHAT_APPEARANCE } : storedAppearance,
      bgMode: 'transparent',
      bgColor: '#000000',
      bgOpacity: 70,
      fontSize,
      platform: localPlatform,
    });

    setChatAppearance(localConfig.appearance);
    setFontSize(localConfig.fontSize);
    setPlatform(localConfig.platform);

    const loadServerConfig = async () => {
      try {
        const response = await fetch('/api/overlay-appearance');
        if (response.ok) {
          const payload = await response.json() as { config?: OverlayVisualConfig | null };
          if (payload.config) {
            const serverConfig = normalizeOverlayVisualConfig(payload.config);
            setChatAppearance(serverConfig.appearance);
            setFontSize(serverConfig.fontSize);
            setPlatform(serverConfig.platform);
          }
        }
      } catch (error) {
        console.warn('[Overlay] No se pudo cargar la apariencia guardada:', error);
      } finally {
        setChatAppearanceReady(true);
        setOverlayConfigReady(true);
      }
    };

    void loadServerConfig();
  }, []);

  useEffect(() => {
    if (chatAppearanceReady) {
      localStorage.setItem(CHAT_APPEARANCE_STORAGE_KEY, JSON.stringify(chatAppearance));
    }
  }, [chatAppearance, chatAppearanceReady]);

  // Guarda la configuración completa en el servidor con debounce y mantiene el orden de cambios.
  useEffect(() => {
    if (!overlayConfigReady) return;

    const config = normalizeOverlayVisualConfig({
      appearance: chatAppearance,
      bgMode: 'transparent',
      bgColor: '#000000',
      bgOpacity: 70,
      fontSize,
      platform,
    });
    const sequence = overlaySaveSequenceRef.current + 1;
    overlaySaveSequenceRef.current = sequence;
    const timer = setTimeout(() => {
      setOverlaySaveState('saving');
      overlaySaveQueueRef.current = overlaySaveQueueRef.current
        .then(async () => {
          const response = await fetch('/api/overlay-appearance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (overlaySaveSequenceRef.current === sequence) setOverlaySaveState('saved');
        })
        .catch((error: unknown) => {
          console.warn('[Overlay] No se pudo sincronizar la apariencia:', error);
          if (overlaySaveSequenceRef.current === sequence) setOverlaySaveState('error');
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [overlayConfigReady, chatAppearance, fontSize, platform]);

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

  useEffect(() => {
    const onPlatformChange = (e: Event) => {
      setPlatform((e as CustomEvent<Platform>).detail);
    };
    window.addEventListener('platform-changed', onPlatformChange);
    return () => window.removeEventListener('platform-changed', onPlatformChange);
  }, []);

  const isJustChatting = streamMode === 'justchatting';

  // El contexto activo depende del modo
  const activeContext = isJustChatting ? selectedTopic : selectedGame;

  const updateChatAppearance = useCallback((patch: ChatAppearanceInput) => {
    setChatAppearance((current) => normalizeChatAppearance({ ...current, ...patch }));
  }, []);

  const selectChatAppearancePreset = useCallback((preset: ChatAppearance['preset']) => {
    setChatAppearance({ ...CHAT_APPEARANCE_PRESETS[preset] });
  }, []);

  const resetChatAppearance = useCallback(() => {
    selectChatAppearancePreset('current');
  }, [selectChatAppearancePreset]);

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

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      token: overlayToken,
      game: activeContext,
      mode: streamMode,
      personality: audiencePersonality,
      speed: String(speedIndex >= 0 ? speedIndex : 2),
      platform,
      bg: 'transparent',
      fontSize,
    });

    params.set('chatPreset', chatAppearance.preset);
    params.set('chatGap', String(chatAppearance.messageGap));
    params.set('chatAlign', chatAppearance.alignment);
    params.set('chatPadding', String(chatAppearance.padding));
    params.set('chatRadius', String(chatAppearance.radius));
    params.set('chatColor', chatAppearance.cardColor);
    params.set('chatOpacity', String(chatAppearance.cardOpacity));
    params.set('chatBorderWidth', String(chatAppearance.borderWidth));
    params.set('chatBorderColor', chatAppearance.borderColor);

    return `${base}/overlay/chat?${params.toString()}`;
  }, [overlayToken, activeContext, interval, streamMode, audiencePersonality, platform, fontSize, chatAppearance]);

  const preparePersonalityPhrases = useCallback(async (
    context: string | null,
    mode: StreamMode,
    personality: AudiencePersonality,
  ) => {
    if (!context) return;

    const requestId = personalityRequestIdRef.current + 1;
    personalityRequestIdRef.current = requestId;
    setPreparingPersonality(personality);

    try {
      const response = await fetch('/api/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName: context, mode, personality }),
      });

      const data = await response.json() as GeneratePhrasesResponse;
      if (!response.ok || !data.success) {
        console.warn('[API] No se pudieron preparar frases para personalidad:', {
          context,
          mode,
          personality,
          status: response.status,
          error: data?.error,
        });
      }
    } catch (error) {
      console.warn('[API] Error preparando frases para personalidad:', error);
    } finally {
      if (personalityRequestIdRef.current === requestId) {
        setPreparingPersonality(null);
      }
    }
  }, []);

  const handleGameSelect = (gameName: string) => {
    setSelectedGame(gameName);
    if (!userGames.includes(gameName.toLowerCase())) {
      setUserGames(prev => [...prev, gameName.toLowerCase()]);
      setRemainingSlots(prev => Math.max(0, prev - 1));
    }
    preparePersonalityPhrases(gameName, 'game', audiencePersonality);
  };

  const handleTopicSelect = (topic: string) => {
    setSelectedTopic(topic);
    preparePersonalityPhrases(topic, 'justchatting', audiencePersonality);
  };

  // Al cambiar de modo, detener el chat si estaba activo
  const handleModeSwitch = (newMode: StreamMode) => {
    if (isActive || isPaused) {
      handleStopChat();
    }
    setStreamMode(newMode);
  };

  const handlePersonalityChange = (personality: AudiencePersonality) => {
    if (isActive && !isPaused) return;
    setAudiencePersonality(personality);
    localStorage.setItem(PERSONALITY_STORAGE_KEY, personality);
    preparePersonalityPhrases(activeContext, streamMode, personality);
  };

  const buildSseUrl = (context: string, iv: MessageInterval) =>
    `/api/chat-stream?game=${encodeURIComponent(context)}&min=${iv.min}&max=${iv.max}&mode=${streamMode}&personality=${audiencePersonality}&greetings=${enableInitialGreetings}`;

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
        voiceSessionIdRef.current = null;
        voiceSequenceRef.current = 0;
        voiceContextRef.current = [];
        pendingVoiceBlobRef.current = null;
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
    voiceSessionIdRef.current = createVoiceSessionId();
    voiceSequenceRef.current = 0;
    voiceContextRef.current = [];
    pendingVoiceBlobRef.current = null;
    setIsActive(true);
    setIsPaused(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    openEventSource(activeContext, interval, false);
  };

  const handleStopChat = () => {
    setMicEnabled(false);
    voiceSessionIdRef.current = null;
    voiceSequenceRef.current = 0;
    voiceContextRef.current = [];
    pendingVoiceBlobRef.current = null;
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
    setMicEnabled(false);
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

  const isPreparingPersonality = preparingPersonality !== null;
  const controlsDisabled = isPreparingPersonality;
  const canStart = !!activeContext && !isActive && !isPaused && !isPreparingPersonality;
  const canPause = isActive && !isPaused;
  const canResume = isPaused && !eventSourceRef.current && !isPreparingPersonality;
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

  // Envía un segmento de voz al servidor para transcribir y generar reacciones.
  // La cola deja como máximo un segmento pendiente y conserva el último si llegan
  // varios mientras Whisper o el modelo están trabajando.
  const sendVoiceSegment = useCallback(async (blob: Blob) => {
    if (!voiceSessionIdRef.current) return;
    if (voiceProcessingRef.current) {
      pendingVoiceBlobRef.current = blob;
      return;
    }

    voiceProcessingRef.current = true;
    let nextBlob: Blob | null = blob;

    try {
      while (nextBlob && voiceSessionIdRef.current) {
        const currentSessionId = voiceSessionIdRef.current;
        if (!currentSessionId) break;
        const sessionId: string = currentSessionId;
        const segmentSequence = voiceSequenceRef.current++;
        const formData = new FormData();
        const ext = nextBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const recentTurns = voiceContextRef.current.slice(-3);
        const activeGame = streamMode === 'game' ? activeContext ?? '' : '';
        const spokenTopic = streamMode === 'justchatting'
          ? activeContext ?? ''
          : recentTurns.at(-1)?.topic ?? '';
        formData.append('audio', new File([nextBlob], `segmento.${ext}`, { type: nextBlob.type }));
        formData.append('game', activeContext ?? '');
        formData.append('activeGame', activeGame);
        formData.append('spokenTopic', spokenTopic);
        formData.append('recentTurns', JSON.stringify(recentTurns));
        formData.append('voiceSessionId', sessionId);
        formData.append('segmentSequence', String(segmentSequence));
        formData.append('personality', audiencePersonality);
        formData.append('mode', streamMode);

        try {
          const res = await fetch('/api/voice-react', { method: 'POST', body: formData });
          let data: VoiceReactResponse | null = null;
          try {
            data = await res.json() as VoiceReactResponse;
          } catch {
            data = null;
          }

          if (res.ok && data?.context && voiceSessionIdRef.current === sessionId) {
            voiceContextRef.current = data.context.slice(-3);
          }

          // Un 429 solo indica que hay que esperar; el micrófono permanece activo.
          if (res.status === 401 || res.status === 403) {
            setMicEnabled(false);
          }
        } catch {
          // Silenciar errores de red — el siguiente segmento continúa la sesión.
        }

        if (voiceSessionIdRef.current !== sessionId) break;
        nextBlob = pendingVoiceBlobRef.current;
        pendingVoiceBlobRef.current = null;
      }
    } finally {
      voiceProcessingRef.current = false;
      if (!voiceSessionIdRef.current) pendingVoiceBlobRef.current = null;
    }
  }, [activeContext, audiencePersonality, streamMode]);

  const { status: micStatus, errorMessage: micError, audioLevel } = useVoiceCapture({
    enabled: micEnabled && isActive && !isPaused,
    speechStartRms: sensitivityToRms(micSensitivity),
    speechConfirmMs: noiseFilterToMs(micNoiseFilter),
    onSegment: sendVoiceSegment,
  });

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
            disabled={(isActive && !isPaused) || controlsDisabled}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-jet border transition-colors
              ${isJustChatting
                ? 'bg-primary text-bg-primary border-primary'
                  : (isActive && !isPaused) || controlsDisabled
                    ? 'bg-transparent border-black/30 dark:border-white/15 dark:bg-black text-black/40 dark:text-white/30 cursor-not-allowed'
                    : 'bg-transparent border-black/40 dark:border-white/30 dark:bg-black text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer'
              }
            `}
            style={isJustChatting ? { color: 'var(--color-primary-text)' } : undefined}
            title={controlsDisabled ? 'Preparando la personalidad del chat' : isActive && !isPaused ? 'Detén el stream para cambiar de modo' : isJustChatting ? 'Volver a modo videojuego' : 'Activar Just Chatting'}
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
            disabled={isActive || isPaused || controlsDisabled}
            personality={audiencePersonality}
          />
        ) : (
          <GameInput
            selectedGame={selectedGame}
            onGameSelect={handleGameSelect}
            disabled={isActive || isPaused || controlsDisabled}
            userGames={userGames}
            remainingSlots={remainingSlots}
            personality={audiencePersonality}
          />
        )}

        {/* ============================================ */}
        {/* Selector — personalidad de audiencia         */}
        {/* ============================================ */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="absolute w-px h-4 bg-black/50 dark:bg-white/40" />
            <div className="w-px h-4 bg-black/50 dark:bg-white/40 rotate-90" />
          </div>
          <span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Audiencia</span>
          <div className="flex-1 h-px bg-black/30 dark:bg-white/30" aria-hidden="true" />
          <span className="font-jet text-[0.55rem] uppercase tracking-[0.08em] opacity-50 hidden sm:block">CHAT · TONE</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {AUDIENCE_PERSONALITY_OPTIONS.map((option) => {
            const PersonalityIcon = PERSONALITY_ICONS[option.id];
            const isSelected = option.id === audiencePersonality;
            const isPreparingThisPersonality = preparingPersonality === option.id;
            const isDisabled = (isActive && !isPaused) || controlsDisabled;

            return (
              <button
                key={option.id}
                onClick={() => handlePersonalityChange(option.id)}
                disabled={isDisabled}
                title={isPreparingThisPersonality ? 'Preparando frases para esta personalidad' : option.description}
                className={`min-h-12 px-2.5 py-2 border text-left transition-all rounded-xs ${
                  isSelected
                    ? 'bg-primary text-bg-primary border-primary'
                    : isDisabled
                      ? 'bg-transparent border-black/20 dark:border-white/15 dark:bg-black text-black/35 dark:text-white/25 cursor-not-allowed'
                      : 'bg-transparent border-black/35 dark:border-white/25 dark:bg-black text-black/55 dark:text-white/45 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white cursor-pointer'
                }`}
                style={isSelected ? { color: 'var(--color-primary-text)' } : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {isPreparingThisPersonality ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <PersonalityIcon size={14} />
                  )}
                  <span className="font-departure text-xs uppercase tracking-[0.08em]">{option.label}</span>
                </span>
                <span className="block mt-0.5 font-jet text-[0.58rem] uppercase tracking-[0.08em] opacity-70">
                  {isPreparingThisPersonality ? 'Generando' : option.shortLabel}
                </span>
              </button>
            );
          })}
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

         {/* Switch saludos iniciales */}
        <div className="flex items-center gap-x-3 px-1">
          <span className="font-jet text-xs text-black/50 dark:text-white/40">Iniciar con saludos</span>
          <button
            onClick={() => setEnableInitialGreetings(!enableInitialGreetings)}
            disabled={(isActive && !isPaused) || controlsDisabled}
            className={`relative w-11 h-6 rounded-full transition-all ${controlsDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${enableInitialGreetings ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`}
            style={enableInitialGreetings ? { backgroundColor: 'var(--color-primary)' } : undefined}
            title={enableInitialGreetings ? 'Desactivar saludos iniciales' : 'Activar saludos iniciales'}
            aria-pressed={enableInitialGreetings}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enableInitialGreetings ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Switch escuchar micrófono — el chat reacciona a la voz del streamer */}
        <div className="px-1 space-y-3">
        <div className="flex items-center gap-x-3">
          <span className="font-jet text-xs text-black/50 dark:text-white/40">Escuchar micrófono</span>
          <button
            onClick={() => setMicEnabled(!micEnabled)}
            disabled={!isActive || isPaused || controlsDisabled}
            className={`relative w-11 h-6 rounded-full transition-all ${(!isActive || isPaused || controlsDisabled) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${micEnabled ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`}
            style={micEnabled ? { backgroundColor: 'var(--color-primary)' } : undefined}
            title={!isActive || isPaused ? 'Inicia el stream para activar el micrófono' : micEnabled ? 'Dejar de escuchar el micrófono' : 'El chat reaccionará a lo que digas'}
            aria-pressed={micEnabled}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${micEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>

          {/* Indicador de estado del micrófono */}
          {micEnabled && (
            <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]">
              {(micStatus === 'listening' || micStatus === 'processing') && (
                <>
                  <VoiceWaveform active levelRef={audioLevel} />
                  <span className="text-black/50 dark:text-white/40">
                    {micStatus === 'processing' ? 'Procesando' : 'Escuchando'}
                  </span>
                </>
              )}
              {micStatus === 'requesting' && (
                <>
                  <IconMicrophone size={12} className="text-black/40 dark:text-white/30" aria-hidden="true" />
                  <span className="text-black/50 dark:text-white/40">Pidiendo permiso…</span>
                </>
              )}
              {micStatus === 'permission-denied' && (
                <>
                  <IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" />
                  <span className="text-yellow-500">Permiso denegado</span>
                </>
              )}
              {micStatus === 'error' && (
                <>
                  <IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" />
                  <span className="text-yellow-500">{micError ?? 'Error de micrófono'}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Perillas de ajuste del micrófono — visibles al activarlo, efecto en caliente */}
        {micEnabled && (
          <div className="space-y-2 pl-1 border-l border-black/15 dark:border-white/15">
            <div className="flex items-center gap-2 pl-2">
              <label htmlFor="mic-sensitivity" className="font-jet text-xs text-black/50 dark:text-white/50 uppercase tracking-[0.08em] flex-shrink-0 w-24">
                Sensib. {micSensitivity}%
              </label>
              <input
                id="mic-sensitivity"
                type="range"
                min={0}
                max={100}
                value={micSensitivity}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setMicSensitivity(value);
                  localStorage.setItem(MIC_SENSITIVITY_STORAGE_KEY, String(value));
                }}
                className="flex-1 accent-primary h-1 cursor-pointer"
                title="Más alto: capta la voz más fácil. Más bajo: hay que hablar más cerca/fuerte."
              />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <label htmlFor="mic-noise-filter" className="font-jet text-xs text-black/50 dark:text-white/50 uppercase tracking-[0.08em] flex-shrink-0 w-24">
                Filtro {micNoiseFilter}%
              </label>
              <input
                id="mic-noise-filter"
                type="range"
                min={0}
                max={100}
                value={micNoiseFilter}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setMicNoiseFilter(value);
                  localStorage.setItem(MIC_NOISE_FILTER_STORAGE_KEY, String(value));
                }}
                className="flex-1 accent-primary h-1 cursor-pointer"
                title="Más alto: ignora más los ruidos cortos (golpes, clics). Más bajo: reacciona más rápido."
              />
            </div>
          </div>
        )}
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

     

       
        {isActive && (
          <OverlayControls
            overlayToken={overlayToken}
            overlayLoading={overlayLoading}
            onGenerateOverlayToken={handleGenerateOverlayToken}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            platform={platform}
            chatAppearance={chatAppearance}
            onUpdateAppearance={updateChatAppearance}
            onSelectPreset={selectChatAppearancePreset}
            onResetAppearance={resetChatAppearance}
            saveState={overlaySaveState}
            buildOverlayUrl={buildOverlayUrl}
          />
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
  
        <ChatWindow
          messages={messages}
          isActive={isActive}
          platform={platform}
          appearance={chatAppearance}
        />
      </div>

    </div>
  );
}
