import { useState, useEffect, useRef, useCallback } from 'react';
import { actions } from 'astro:actions';
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
  VoiceStoryMessage,
  VoiceStoryState,
  VoiceStoryTurn,
} from '../utils/types';
import {
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
import {
  appendVoiceStoryTurn,
  clearVoiceStory,
  createEmptyVoiceStory,
  sanitizeVoiceStory,
} from '../lib/voiceStory';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import ChatWindow from './ChatWindow';
import ControlsDashboard from './ControlsDashboard';
import OverlayControls from './OverlayControls';
import '../styles/global.css';

// ============================================
// Constantes de reconexión y límites
// ============================================
const MAX_MESSAGES = 200;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;
const VOICE_MESSAGE_MIN_DELAY = 600;
const VOICE_MESSAGE_MAX_DELAY = 1_200;
const PLATFORM_STORAGE_KEY = 'preferred-platform';
const PERSONALITY_STORAGE_KEY = 'audience-personality';
const MIC_SENSITIVITY_STORAGE_KEY = 'mic-sensitivity';
const MIC_NOISE_FILTER_STORAGE_KEY = 'mic-noise-filter';
const CHAT_APPEARANCE_STORAGE_KEY = 'chat-appearance:v1';

// Valores por defecto de las perillas del micrófono (0–100)
const DEFAULT_MIC_SENSITIVITY = 60; // → umbral RMS 0.08
const DEFAULT_MIC_NOISE_FILTER = 45; // → confirmación 180ms

const CURRENT_YEAR = new Date().getFullYear();

function DashboardFooter() {
  return (
    <footer className="relative z-10 w-full shrink-0 px-6 pb-8 pt-8 font-departure tracking-[0.08em]" role="contentinfo">
      <div aria-hidden="true" className="scanline-rule mx-auto mb-3 h-px max-w-sm py-3 sm:max-w-[1450px]" />
      <div className="mx-auto grid w-full max-w-7xl gap-3 text-black dark:text-white md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="flex items-center justify-center gap-2 md:justify-start">
          <a href="/" aria-label="Twick — inicio" className="shrink-0 transition-opacity hover:opacity-75">
            <img src="/logo-rocket.svg" className="h-6 w-6" alt="" aria-hidden="true" />
          </a>
          <div className="flex flex-col leading-none">
            <span className="text-xs uppercase">Twick</span>
            <span className="mt-1 font-jet text-[0.45rem] uppercase tracking-[0.18em] text-black/45 dark:text-white/45">chat simulation stream</span>
          </div>
        </div>
        <nav aria-label="Navegación principal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[0.55rem] uppercase tracking-[0.14em]">
          <a href="/" className="transition-colors hover:text-primary dark:hover:text-primary">Inicio</a>
          <a href="/#como-funciona" className="transition-colors hover:text-primary dark:hover:text-primary">Cómo funciona</a>
          <a href="/#caracteristicas" className="transition-colors hover:text-primary dark:hover:text-primary">Características</a>
          <a href="/simulador-de-chat-para-twitch" className="transition-colors hover:text-primary dark:hover:text-primary">Propósito</a>
        </nav>
        <div className="flex flex-col items-center gap-2 text-center md:items-end md:text-right">
          <p className="m-0 max-w-xs font-jet text-[0.5rem] uppercase leading-relaxed tracking-[0.12em] text-black/55 dark:text-white/55">
            &copy; {CURRENT_YEAR} · Creado por{' '}
            <a href="https://alansan.dev" target="_blank" rel="noopener noreferrer" className="text-black underline underline-offset-4 transition-colors hover:text-primary dark:text-white dark:hover:text-primary">Alan San</a>
          </p>
          <nav aria-label="Redes sociales" className="flex items-center gap-2">
            <a href="https://github.com/AlanSan1195/twick" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="flex h-7 w-7 items-center justify-center  text-black transition-colors  hover:text-primary  dark:text-white  dark:hover:text-primary">
              <img src="/assets/gitpixel.svg" className="h-4 w-4" alt="" aria-hidden="true" />
            </a>
          </nav>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-4 w-16 opacity-40" style={{ backgroundImage: 'repeating-conic-gradient(rgba(0,0,0,1) 0% 25%, transparent 0% 50%)', backgroundSize: '8px 8px' }} aria-hidden="true" />
    </footer>
  );
}

interface VoiceDeliveryBatchState {
  expected: number;
  delivered: Set<string>;
}

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
  const voiceDeliverySessionIdRef = useRef<string | null>(null);
  const voiceSequenceRef = useRef(0);
  const voiceStoryRef = useRef<VoiceStoryState>(createEmptyVoiceStory());
  const voiceProcessingRef = useRef(false);
  const voiceProcessingRunRef = useRef(0);
  const pendingVoiceBlobRef = useRef<Blob | null>(null);
  const voiceDeliveryEnabledRef = useRef(false);
  const voiceMessageQueueRef = useRef<ChatMessage[]>([]);
  const voiceMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceDeliveredMessageIdsRef = useRef(new Set<string>());
  const voiceAcceptedBatchIdsRef = useRef(new Set<string>());
  const voiceDeliveryBatchesRef = useRef(new Map<string, VoiceDeliveryBatchState>());

  const appendChatMessage = useCallback((newMessage: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((message) => message.id === newMessage.id)) return prev;
      const next = [...prev, newMessage];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
  }, []);

  const clearVoiceMessageQueue = useCallback(() => {
    if (voiceMessageTimerRef.current) {
      clearTimeout(voiceMessageTimerRef.current);
      voiceMessageTimerRef.current = null;
    }
    voiceMessageQueueRef.current = [];
  }, []);

  const resetVoiceDeliveryTracking = useCallback(() => {
    voiceDeliveredMessageIdsRef.current.clear();
    voiceAcceptedBatchIdsRef.current.clear();
    voiceDeliveryBatchesRef.current.clear();
  }, []);

  /** Registra el tamaño del lote sin imprimir transcripciones ni historia. */
  const registerVoiceBatch = useCallback((batch: ChatMessage[], sessionId: string) => {
    const grouped = new Map<string, ChatMessage[]>();
    for (const message of batch) {
      if (message.source !== 'voice' || !message.voiceBatchId) continue;
      voiceAcceptedBatchIdsRef.current.add(message.voiceBatchId);
      const messages = grouped.get(message.voiceBatchId) ?? [];
      if (!messages.some((item) => item.id === message.id)) messages.push(message);
      grouped.set(message.voiceBatchId, messages);
    }

    if (!import.meta.env.DEV) return;

    for (const [voiceBatchId, messages] of grouped) {
      const current = voiceDeliveryBatchesRef.current.get(voiceBatchId) ?? {
        expected: 0,
        delivered: new Set<string>(),
      };
      current.expected = Math.max(current.expected, messages.length);
      for (const message of messages) {
        if (voiceDeliveredMessageIdsRef.current.has(message.id)) {
          current.delivered.add(message.id);
        }
      }
      voiceDeliveryBatchesRef.current.set(voiceBatchId, current);
      console.log('[Voz] Lote en cola:', {
        voiceBatchId,
        sessionId,
        generated: current.expected,
        delivered: current.delivered.size,
        pending: voiceMessageQueueRef.current.length,
      });
      if (current.expected > 0 && current.delivered.size >= current.expected) {
        console.log('[Voz] Lote entregado:', {
          voiceBatchId,
          generated: current.expected,
          delivered: current.delivered.size,
          channel: 'sse',
        });
        voiceDeliveryBatchesRef.current.delete(voiceBatchId);
      }
    }
  }, []);

  const recordVoiceDelivery = useCallback((message: ChatMessage, channel: 'sse' | 'dashboard-queue') => {
    if (message.source !== 'voice' || !message.voiceBatchId) return;

    voiceDeliveredMessageIdsRef.current.add(message.id);
    if (!import.meta.env.DEV) return;

    // Si SSE gana la carrera antes de que fetch devuelva el lote, el Set global
    // conserva el ID y registerVoiceBatch lo incorpora después. No creamos un
    // registro incompleto que pueda quedar retenido si fetch termina en error.
    const current = voiceDeliveryBatchesRef.current.get(message.voiceBatchId);
    if (!current) return;
    current.delivered.add(message.id);

    if (current.expected > 0 && current.delivered.size >= current.expected) {
      console.log('[Voz] Lote entregado:', {
        voiceBatchId: message.voiceBatchId,
        generated: current.expected,
        delivered: current.delivered.size,
        channel,
      });
      voiceDeliveryBatchesRef.current.delete(message.voiceBatchId);
    }
  }, []);

  /** Quita del fallback local un mensaje que ya llegó por SSE. */
  const removeQueuedVoiceMessage = useCallback((messageId: string) => {
    const previousLength = voiceMessageQueueRef.current.length;
    if (previousLength === 0) return;
    voiceMessageQueueRef.current = voiceMessageQueueRef.current.filter((message) => message.id !== messageId);
    if (voiceMessageQueueRef.current.length === 0 && voiceMessageTimerRef.current) {
      clearTimeout(voiceMessageTimerRef.current);
      voiceMessageTimerRef.current = null;
    }
  }, []);

  /** Invalida la memoria y las respuestas pendientes de la sesión de voz actual. */
  const closeVoiceSession = useCallback((preserveQueuedMessages = false) => {
    voiceSessionIdRef.current = null;
    voiceSequenceRef.current = 0;
    voiceStoryRef.current = clearVoiceStory();
    pendingVoiceBlobRef.current = null;
    voiceProcessingRunRef.current += 1;
    voiceProcessingRef.current = false;
    if (!preserveQueuedMessages) {
      voiceDeliverySessionIdRef.current = null;
      voiceDeliveryEnabledRef.current = false;
      clearVoiceMessageQueue();
      resetVoiceDeliveryTracking();
    }
  }, [clearVoiceMessageQueue, resetVoiceDeliveryTracking]);

  const queueVoiceMessages = useCallback((batch: ChatMessage[], sessionId: string) => {
    if (batch.length === 0 || voiceDeliverySessionIdRef.current !== sessionId) return;
    registerVoiceBatch(batch, sessionId);
    const pendingIds = new Set(voiceMessageQueueRef.current.map((message) => message.id));
    const newMessages = batch.filter((message) => {
      if (voiceDeliveredMessageIdsRef.current.has(message.id)) return false;
      if (pendingIds.has(message.id)) return false;
      pendingIds.add(message.id);
      return true;
    });
    voiceMessageQueueRef.current.push(...newMessages);
    if (voiceMessageTimerRef.current) return;

    const deliverNext = () => {
      if (voiceDeliverySessionIdRef.current !== sessionId || !voiceDeliveryEnabledRef.current) {
        clearVoiceMessageQueue();
        return;
      }

      const nextMessage = voiceMessageQueueRef.current.shift();
      if (!nextMessage) {
        voiceMessageTimerRef.current = null;
        return;
      }

      recordVoiceDelivery(nextMessage, 'dashboard-queue');
      appendChatMessage(nextMessage);

      if (voiceMessageQueueRef.current.length === 0) {
        voiceMessageTimerRef.current = null;
        return;
      }

      const delay = Math.floor(
        Math.random() * (VOICE_MESSAGE_MAX_DELAY - VOICE_MESSAGE_MIN_DELAY + 1),
      ) + VOICE_MESSAGE_MIN_DELAY;
      voiceMessageTimerRef.current = setTimeout(deliverNext, delay);
    };

    deliverNext();
  }, [appendChatMessage, clearVoiceMessageQueue, recordVoiceDelivery, registerVoiceBatch]);

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
      if (newMessage.source === 'voice' && newMessage.voiceBatchId) {
        const activeVoiceSessionId = voiceSessionIdRef.current;
        const belongsToActiveSession = activeVoiceSessionId !== null
          && newMessage.voiceBatchId.startsWith(`${activeVoiceSessionId}:`);
        const belongsToAcceptedBatch = voiceAcceptedBatchIdsRef.current.has(newMessage.voiceBatchId);

        // Una respuesta que quedó en vuelo después de apagar o reiniciar el
        // micrófono no debe reaparecer por SSE. Los lotes ya aceptados sí se
        // conservan para que terminen de mostrarse.
        if (!belongsToActiveSession && !belongsToAcceptedBatch) return;
      }
      if (newMessage.source === 'voice') {
        // El SSE es la ruta principal. Si el mismo lote también fue recibido
        // por fetch, quitamos esa copia del fallback local antes de renderizar.
        removeQueuedVoiceMessage(newMessage.id);
        recordVoiceDelivery(newMessage, 'sse');
      }
      appendChatMessage(newMessage);
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error('[SSE] Sin mas intentos de reconexion, deteniendo stream');
        closeVoiceSession();
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
    closeVoiceSession();
    voiceDeliveryEnabledRef.current = true;
    clearVoiceMessageQueue();
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
    closeVoiceSession();
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
    if (!isActive || isPaused) return;
    setMicEnabled(false);
    closeVoiceSession();
    reconnectAttemptsRef.current = RECONNECT_MAX_ATTEMPTS;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsPaused(true);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleResumeChat = () => {
    if (!activeContext || eventSourceRef.current) return;
    reconnectAttemptsRef.current = 0;
    voiceDeliveryEnabledRef.current = true;
    setIsActive(true);
    setIsPaused(false);
    openEventSource(activeContext, interval, true);
  };

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      closeVoiceSession();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [closeVoiceSession]);

  const isPreparingPersonality = preparingPersonality !== null;
  const controlsDisabled = isPreparingPersonality;
  const canStart = !!activeContext && !isActive && !isPaused && !isPreparingPersonality;
  const canPause = isActive && !isPaused;
  const canResume = isPaused && !eventSourceRef.current && !isPreparingPersonality;
  const canStop = isActive || isPaused;

  const handleMicToggle = useCallback(() => {
    if (micEnabled) {
      closeVoiceSession(true);
      setMicEnabled(false);
      return;
    }

    if (!isActive || isPaused) return;

    closeVoiceSession();
    voiceSessionIdRef.current = createVoiceSessionId();
    voiceDeliverySessionIdRef.current = voiceSessionIdRef.current;
    voiceSequenceRef.current = 0;
    voiceStoryRef.current = createEmptyVoiceStory();
    voiceDeliveryEnabledRef.current = true;
    setMicEnabled(true);
  }, [closeVoiceSession, isActive, isPaused, micEnabled]);

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

    const processingRunId = voiceProcessingRunRef.current + 1;
    voiceProcessingRunRef.current = processingRunId;
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
        const storySnapshot = sanitizeVoiceStory(voiceStoryRef.current);
        voiceStoryRef.current = storySnapshot;
        const recentTurns = storySnapshot.recentTurns.slice(-3).map((turn) => ({
          transcript: turn.transcript,
          topic: turn.topic,
          intent: turn.intent,
          timestamp: turn.timestamp,
        }));
        const activeGame = streamMode === 'game' ? activeContext ?? '' : '';
        const spokenTopic = streamMode === 'justchatting'
          ? activeContext ?? ''
          : storySnapshot.activeTopic ?? '';
        formData.append('audio', new File([nextBlob], `segmento.${ext}`, { type: nextBlob.type }));
        formData.append('game', activeContext ?? '');
        formData.append('activeGame', activeGame);
        formData.append('spokenTopic', spokenTopic);
        formData.append('recentTurns', JSON.stringify(recentTurns));
        formData.append('story', JSON.stringify(storySnapshot));
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

          if (import.meta.env.DEV) {
            console.log('[Voz] Respuesta del segmento:', {
              segmentSequence,
              status: res.status,
              transcript: data?.transcript ?? null,
              topic: data?.topic ?? null,
              relation: data?.relation ?? null,
              emotion: data?.emotion ?? null,
              referencedMessageId: data?.referencedMessageId ?? null,
              count: data?.count ?? 0,
              generated: data?.chatMessages?.length ?? data?.count ?? 0,
              rememberedTurns: data?.story?.recentTurns.length ?? data?.context?.length ?? 0,
              messages: data?.messages ?? [],
              reason: data?.reason ?? null,
            });
          }

          const isCurrentVoiceResponse = res.ok && voiceSessionIdRef.current === sessionId;
          if (isCurrentVoiceResponse && data?.chatMessages) {
            queueVoiceMessages(data.chatMessages, sessionId);

            if (data.story) {
              voiceStoryRef.current = sanitizeVoiceStory(data.story);
            }

            const transcript = data.transcript ?? data.turn?.transcript ?? '';
            const intent = data.intent ?? data.turn?.intent ?? 'none';
            const topic = data.topic ?? data.turn?.topic ?? null;
            const storyMessages: VoiceStoryMessage[] = data.chatMessages.map((message) => ({
              id: message.id,
              username: message.username,
              content: message.content,
            }));

            if (!data.story && transcript.trim() && intent !== 'none' && storyMessages.length > 0) {
              const hasPreviousStory = voiceStoryRef.current.recentTurns.length > 0;
              const storyTurn: VoiceStoryTurn = {
                sequence: segmentSequence,
                transcript,
                topic,
                intent,
                relation: data.usesPreviousTopic
                  ? 'follow_up'
                  : hasPreviousStory
                    ? 'continuation'
                    : 'new_topic',
                emotion: 'neutral',
                referencedMessageId: null,
                chatMessages: storyMessages,
                beat: topic
                  ? `El streamer habló sobre ${topic}.`
                  : 'El streamer continuó la conversación.',
                timestamp: Date.now(),
              };
              voiceStoryRef.current = appendVoiceStoryTurn(voiceStoryRef.current, storyTurn);
            }
          }

          // Un 429 solo indica que hay que esperar; el micrófono permanece activo.
          if ((res.status === 401 || res.status === 403) && voiceSessionIdRef.current === sessionId) {
            closeVoiceSession();
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
      if (voiceProcessingRunRef.current === processingRunId) {
        voiceProcessingRef.current = false;
        if (!voiceSessionIdRef.current) pendingVoiceBlobRef.current = null;
      }
    }
  }, [activeContext, audiencePersonality, closeVoiceSession, queueVoiceMessages, streamMode]);

  const { status: micStatus, errorMessage: micError, audioLevel } = useVoiceCapture({
    enabled: micEnabled && isActive && !isPaused,
    speechStartRms: sensitivityToRms(micSensitivity),
    speechConfirmMs: noiseFilterToMs(micNoiseFilter),
    onSegment: sendVoiceSegment,
  });

  // Label del header según modo y estado
  const headerLabel = isActive && activeContext
    ? isPaused
      ? `En pausa: ${activeContext}`
      : `${isJustChatting ? 'Chateando: ' : ''}${activeContext}`
    : isJustChatting
      ? 'Just Chatting'
      : 'selecciona un juego';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-px bg-bg-secundary dark:bg-transparent lg:h-full lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)] lg:grid-rows-1">
      <div className="dashboard-controls-scroller relative flex min-h-0 min-w-0 flex-col lg:h-full lg:overflow-y-auto lg:overscroll-contain">
        <ControlsDashboard
        headerLabel={headerLabel}
        isJustChatting={isJustChatting}
        isActive={isActive}
        isPaused={isPaused}
        controlsDisabled={controlsDisabled}
        selectedGame={selectedGame}
        selectedTopic={selectedTopic}
        userGames={userGames}
        remainingSlots={remainingSlots}
        audiencePersonality={audiencePersonality}
        preparingPersonality={preparingPersonality}
        interval={interval}
        enableInitialGreetings={enableInitialGreetings}
        micEnabled={micEnabled}
        micStatus={micStatus}
        micError={micError}
        audioLevel={audioLevel}
        micSensitivity={micSensitivity}
        micNoiseFilter={micNoiseFilter}
        overlayToken={overlayToken}
        overlayLoading={overlayLoading}
        canStart={canStart}
        canPause={canPause}
        canResume={canResume}
        canStop={canStop}
        onModeSwitch={handleModeSwitch}
        onGameSelect={handleGameSelect}
        onTopicSelect={handleTopicSelect}
        onPersonalityChange={handlePersonalityChange}
        onIntervalChange={setInterval}
        onInitialGreetingsChange={() => setEnableInitialGreetings((current) => !current)}
        onMicToggle={handleMicToggle}
        onMicSensitivityChange={(value) => {
          setMicSensitivity(value);
          localStorage.setItem(MIC_SENSITIVITY_STORAGE_KEY, String(value));
        }}
        onMicNoiseFilterChange={(value) => {
          setMicNoiseFilter(value);
          localStorage.setItem(MIC_NOISE_FILTER_STORAGE_KEY, String(value));
        }}
        onStart={handleStartChat}
        onPause={handlePauseChat}
        onResume={handleResumeChat}
        onStop={handleStopChat}
        onGenerateOverlayToken={handleGenerateOverlayToken}
        buildOverlayUrl={buildOverlayUrl}
          onWave={triggerWave}
        />
        <DashboardFooter />
      </div>
      {/* ============================================ */}
      {/* Ventana de Chat — columna derecha            */}
      {/* ============================================ */}
      <div className="relative flex min-h-0 min-w-0 flex-col bg-bg-secundary dark:bg-black lg:h-full">

        <ChatWindow
          messages={messages}
          isActive={isActive}
          platform={platform}
          appearance={chatAppearance}
          settingsPanel={isActive ? (
            <OverlayControls
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              platform={platform}
              chatAppearance={chatAppearance}
              onUpdateAppearance={updateChatAppearance}
              onSelectPreset={selectChatAppearancePreset}
              onResetAppearance={resetChatAppearance}
              saveState={overlaySaveState}
            />
          ) : undefined}
        />
      </div>


    </div>
  );
}
