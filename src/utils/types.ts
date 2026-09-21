// Tipos base para mensajes de chat
export type MessageCategory = 'gameplay' | 'reactions' | 'questions' | 'comments';

export type WaveType = 'laugh' | 'hype' | 'fear' | 'omg' | 'voice';

export type StreamMode = 'game' | 'justchatting';

export type AudiencePersonality = 'sarcastic' | 'normal' | 'curious' | 'chaotic' | 'chill';

export interface AudiencePersonalityOption {
  id: AudiencePersonality;
  label: string;
  shortLabel: string;
  description: string;
}

export const DEFAULT_AUDIENCE_PERSONALITY: AudiencePersonality = 'normal';

export const AUDIENCE_PERSONALITY_OPTIONS: AudiencePersonalityOption[] = [
  {
    id: 'sarcastic',
    label: 'Sarcastic',
    shortLabel: 'Ironía',
    description: 'Humor peculiar y comentarios sarcásticos',
  },
  {
    id: 'normal',
    label: 'Normal',
    shortLabel: 'Fan',
    description: 'Fan respetuoso, atento e interesante',
  },
  {
    id: 'curious',
    label: 'Curious',
    shortLabel: 'Pregunta',
    description: 'Más preguntas y conversación',
  },
  {
    id: 'chaotic',
    label: 'Chaotic',
    shortLabel: 'Memes',
    description: 'Bromas, memes y energía alta',
  },
  {
    id: 'chill',
    label: 'Chill',
    shortLabel: 'Relax',
    description: 'Comentarios tranquilos y baja intensidad',
  },
];

export function isAudiencePersonality(value: string): value is AudiencePersonality {
  return AUDIENCE_PERSONALITY_OPTIONS.some((option) => option.id === value);
}

export function resolveAudiencePersonality(value: string | null | undefined): AudiencePersonality {
  return value && isAudiencePersonality(value) ? value : DEFAULT_AUDIENCE_PERSONALITY;
}

/** Origen del stream SSE: dashboard (panel de control) u overlay (OBS Browser Source) */
export type StreamSource = 'dashboard' | 'overlay';

export interface MessagePattern {
  gameplay: string[];
  reactions: string[];
  questions: string[];
  comments?: string[];
  usernames?: string[];
  greetings?: string[];
  initialReactions?: string[];
}

/** Tier con el que se suscribe un usuario simulado */
export type SubTier = 'Prime' | 'Nivel 1';

/** Datos de una suscripción simulada — presente solo en mensajes destacados de sub */
export interface SubInfo {
  months: number;
  tier: SubTier;
}

export interface ChatMessage {
  id: string;
  username: string;
  content: string;
  timestamp: number;
  category: MessageCategory;
  personality: AudiencePersonality;
  sub?: SubInfo;
}

// ============================================
// Apariencia compartida del chat
// ============================================

export type ChatAppearancePreset = 'current' | 'cards' | 'separated-name';
export type ChatAppearanceAlignment = 'left' | 'alternating';

/** Configuración visual común al dashboard, la vista previa y el overlay de OBS. */
export interface ChatAppearance {
  preset: ChatAppearancePreset;
  messageGap: number;
  alignment: ChatAppearanceAlignment;
  padding: number;
  radius: number;
  cardColor: string;
  cardOpacity: number;
  borderWidth: number;
  borderColor: string;
}

/** Entrada parcial para fusionar valores de localStorage o de la URL. */
export type ChatAppearanceInput = Partial<ChatAppearance>;

const CHAT_APPEARANCE_LIMITS = {
  messageGap: { min: 0, max: 24 },
  padding: { min: 0, max: 32 },
  radius: { min: 0, max: 24 },
  cardOpacity: { min: 0, max: 100 },
  borderWidth: { min: 0, max: 4 },
} as const;

const CURRENT_CHAT_APPEARANCE_VALUES: ChatAppearance = {
  preset: 'current',
  messageGap: 0,
  alignment: 'left',
  padding: 8,
  radius: 0,
  cardColor: '#000000',
  cardOpacity: 20,
  borderWidth: 0,
  borderColor: '#FFFFFF',
};

const CARD_CHAT_APPEARANCE_VALUES: ChatAppearance = {
  preset: 'cards',
  messageGap: 8,
  alignment: 'left',
  padding: 12,
  radius: 8,
  cardColor: '#000000',
  cardOpacity: 75,
  borderWidth: 1,
  borderColor: '#FFFFFF',
};

/** Valores predeterminados para nuevos chats: el estilo original del chat. */
export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = { ...CURRENT_CHAT_APPEARANCE_VALUES };

/** Valores iniciales de cada preset disponibles en el editor del dashboard. */
export const CHAT_APPEARANCE_PRESETS: Record<ChatAppearancePreset, ChatAppearance> = {
  current: { ...CURRENT_CHAT_APPEARANCE_VALUES },
  cards: { ...CARD_CHAT_APPEARANCE_VALUES },
  'separated-name': {
    preset: 'separated-name',
    messageGap: 6,
    alignment: 'left',
    padding: 8,
    radius: 4,
    cardColor: '#000000',
    cardOpacity: 45,
    borderWidth: 0,
    borderColor: '#FFFFFF',
  },
};

function isChatAppearancePreset(value: string): value is ChatAppearancePreset {
  return value === 'current' || value === 'cards' || value === 'separated-name';
}

function isChatAppearanceAlignment(value: string): value is ChatAppearanceAlignment {
  return value === 'left' || value === 'alternating';
}

function clampChatAppearanceNumber(
  value: number,
  limits: { min: number; max: number },
  fallback: number,
): number {
  return Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, value))
    : fallback;
}

function resolveChatAppearanceColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

/** Normaliza una configuración parcial y evita estilos inválidos o extremos. */
export function normalizeChatAppearance(input: ChatAppearanceInput | null | undefined): ChatAppearance {
  const source = input ?? {};
  const preset = typeof source.preset === 'string' && isChatAppearancePreset(source.preset)
    ? source.preset
    : DEFAULT_CHAT_APPEARANCE.preset;
  const presetDefaults = CHAT_APPEARANCE_PRESETS[preset];

  return {
    preset,
    messageGap: clampChatAppearanceNumber(source.messageGap ?? presetDefaults.messageGap, CHAT_APPEARANCE_LIMITS.messageGap, presetDefaults.messageGap),
    alignment: typeof source.alignment === 'string' && isChatAppearanceAlignment(source.alignment)
      ? source.alignment
      : presetDefaults.alignment,
    padding: clampChatAppearanceNumber(source.padding ?? presetDefaults.padding, CHAT_APPEARANCE_LIMITS.padding, presetDefaults.padding),
    radius: clampChatAppearanceNumber(source.radius ?? presetDefaults.radius, CHAT_APPEARANCE_LIMITS.radius, presetDefaults.radius),
    cardColor: resolveChatAppearanceColor(source.cardColor, presetDefaults.cardColor),
    cardOpacity: clampChatAppearanceNumber(source.cardOpacity ?? presetDefaults.cardOpacity, CHAT_APPEARANCE_LIMITS.cardOpacity, presetDefaults.cardOpacity),
    borderWidth: clampChatAppearanceNumber(source.borderWidth ?? presetDefaults.borderWidth, CHAT_APPEARANCE_LIMITS.borderWidth, presetDefaults.borderWidth),
    borderColor: resolveChatAppearanceColor(source.borderColor, presetDefaults.borderColor),
  };
}

/** Comprueba que un valor deserializado puede tratarse como entrada de apariencia. */
export function isChatAppearanceInput(value: unknown): value is ChatAppearanceInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recupera una apariencia de localStorage sin romper el dashboard si el JSON es inválido. */
export function resolveStoredChatAppearance(rawValue: string | null): ChatAppearance {
  if (!rawValue) return { ...DEFAULT_CHAT_APPEARANCE };

  try {
    // JSON.parse devuelve unknown intencionalmente: la validación posterior limita el input.
    const parsed: unknown = JSON.parse(rawValue);
    return normalizeChatAppearance(isChatAppearanceInput(parsed) ? parsed : null);
  } catch {
    return { ...DEFAULT_CHAT_APPEARANCE };
  }
}

/** Lee los parámetros `chat*` de la URL del overlay y aplica los defaults seguros. */
export function resolveChatAppearanceFromParams(params: URLSearchParams): ChatAppearance {
  const numberParam = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const rawPreset = params.get('chatPreset');
  const rawAlignment = params.get('chatAlign');

  return normalizeChatAppearance({
    preset: rawPreset && isChatAppearancePreset(rawPreset) ? rawPreset : undefined,
    messageGap: numberParam('chatGap'),
    alignment: rawAlignment && isChatAppearanceAlignment(rawAlignment) ? rawAlignment : undefined,
    padding: numberParam('chatPadding'),
    radius: numberParam('chatRadius'),
    cardColor: params.get('chatColor') ?? undefined,
    cardOpacity: numberParam('chatOpacity'),
    borderWidth: numberParam('chatBorderWidth'),
    borderColor: params.get('chatBorderColor') ?? undefined,
  });
}

// ============================================
// Configuración visual completa del overlay
// ============================================

export type OverlayBackgroundMode = 'transparent' | 'solid' | 'blur';
export type OverlayFontSize = 'small' | 'medium' | 'large';
export type OverlayPlatform = 'twitch' | 'kick';

/** Configuración visual que se comparte entre dashboard, vista previa y OBS. */
export interface OverlayVisualConfig {
  appearance: ChatAppearance;
  bgMode: OverlayBackgroundMode;
  bgColor: string;
  bgOpacity: number;
  fontSize: OverlayFontSize;
  platform: OverlayPlatform;
}

/** Entrada parcial aceptada por la API y por eventos SSE. */
export interface OverlayVisualConfigInput {
  appearance?: ChatAppearanceInput;
  bgMode?: OverlayBackgroundMode;
  bgColor?: string;
  bgOpacity?: number;
  fontSize?: OverlayFontSize;
  platform?: OverlayPlatform;
}

const OVERLAY_VISUAL_LIMITS = {
  bgOpacity: { min: 0, max: 100 },
} as const;

export const DEFAULT_OVERLAY_VISUAL_CONFIG: OverlayVisualConfig = {
  appearance: { ...DEFAULT_CHAT_APPEARANCE },
  bgMode: 'transparent',
  bgColor: '#000000',
  bgOpacity: 70,
  fontSize: 'medium',
  platform: 'twitch',
};

function isOverlayBackgroundMode(value: string): value is OverlayBackgroundMode {
  return value === 'transparent' || value === 'solid' || value === 'blur';
}

function isOverlayFontSize(value: string): value is OverlayFontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

function isOverlayPlatform(value: string): value is OverlayPlatform {
  return value === 'twitch' || value === 'kick';
}

function resolveOverlayColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function clampOverlayNumber(value: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.min(OVERLAY_VISUAL_LIMITS.bgOpacity.max, Math.max(OVERLAY_VISUAL_LIMITS.bgOpacity.min, value))
    : fallback;
}

/** Normaliza toda la configuración visual y limita valores recibidos por URL o API. */
export function normalizeOverlayVisualConfig(
  input: OverlayVisualConfigInput | null | undefined,
  fallback: OverlayVisualConfig = DEFAULT_OVERLAY_VISUAL_CONFIG,
): OverlayVisualConfig {
  const source = input ?? {};
  return {
    appearance: normalizeChatAppearance({ ...fallback.appearance, ...(source.appearance ?? {}) }),
    bgMode: typeof source.bgMode === 'string' && isOverlayBackgroundMode(source.bgMode)
      ? source.bgMode
      : fallback.bgMode,
    bgColor: resolveOverlayColor(source.bgColor, fallback.bgColor),
    bgOpacity: clampOverlayNumber(source.bgOpacity ?? fallback.bgOpacity, fallback.bgOpacity),
    fontSize: typeof source.fontSize === 'string' && isOverlayFontSize(source.fontSize)
      ? source.fontSize
      : fallback.fontSize,
    platform: typeof source.platform === 'string' && isOverlayPlatform(source.platform)
      ? source.platform
      : fallback.platform,
  };
}

/** Comprueba la forma mínima de un objeto recibido desde SSE antes de normalizarlo. */
export function isOverlayVisualConfigInput(value: unknown): value is OverlayVisualConfigInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convierte los parámetros visuales de la URL en una configuración inicial segura. */
export function resolveOverlayVisualConfigFromParams(params: URLSearchParams): OverlayVisualConfig {
  const rawBgOpacity = params.get('bgOpacity');
  const rawFontSize = params.get('fontSize');
  const rawBgMode = params.get('bg');
  const rawPlatform = params.get('platform');
  const parsedBgOpacity = rawBgOpacity === null ? undefined : Number(rawBgOpacity);

  return normalizeOverlayVisualConfig({
    appearance: resolveChatAppearanceFromParams(params),
    bgMode: rawBgMode && isOverlayBackgroundMode(rawBgMode) ? rawBgMode : undefined,
    bgColor: params.get('bgColor') ?? undefined,
    bgOpacity: Number.isFinite(parsedBgOpacity) ? parsedBgOpacity : undefined,
    fontSize: rawFontSize && isOverlayFontSize(rawFontSize) ? rawFontSize : undefined,
    platform: rawPlatform && isOverlayPlatform(rawPlatform) ? rawPlatform : undefined,
  });
}

// Tipos para juegos (ahora dinámicos)
export interface Game {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  isCustom?: boolean;
}

export interface MessageInterval {
  min: number; // ms
  max: number; // ms
  label: string;
}

export const INTERVAL_PRESETS: MessageInterval[] = [
  { min: 4000, max:  7000, label: '4–7seg'  },
  { min: 2000, max:  4000, label: '2–4seg'  },
  { min: 1000, max:  2000, label: '1–2seg'  },
  { min: 500, max:  1000, label: '0.5–1seg'  },
];

export const DEFAULT_INTERVAL: MessageInterval = INTERVAL_PRESETS[2]; // 2–4s

export interface StreamConfig {
  gameId: string | null;
  isActive: boolean;
  messageInterval: MessageInterval;
}

// Tipos para servicios de IA
export interface AIServiceMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIService {
  name: string;
  chat: (messages: AIServiceMessage[]) => Promise<AsyncIterable<string>>;
}

// Tipos para cache y límites de usuario
export interface UserGameLimit {
  userId: string;
  games: string[];
  createdAt: number;
}

export interface CachedPhrases {
  gameName: string;
  personality: AudiencePersonality;
  phrases: MessagePattern;
  generatedAt: number;
  generatedBy: string; // userId que las generó
}

// Respuesta del endpoint generate-phrases
export interface GeneratePhrasesResponse {
  success: boolean;
  gameName: string;
  phrases?: MessagePattern;
  error?: string;
  limitReached?: boolean;
  currentGames?: string[];
  mode?: StreamMode;
  personality?: AudiencePersonality;
}

export type VoiceIntent = 'opinion' | 'question' | 'reaction' | 'gameplay' | 'casual' | 'none';

/** Intercambio de voz guardado únicamente durante el directo actual. */
export interface VoiceTurn {
  transcript: string;
  topic: string | null;
  intent: VoiceIntent;
  timestamp: number;
}

/** Contexto mínimo que se envía al modelo para resolver referencias entre frases. */
export interface VoiceReactionContext {
  activeGame: string | null;
  spokenTopic: string | null;
  recentTurns: VoiceTurn[];
}

/** Resultado estructurado del análisis y generación de una frase de voz. */
export interface VoiceAnalysis {
  topic: string | null;
  intent: VoiceIntent;
  confidence: number;
  usesPreviousTopic: boolean;
  messages: string[];
}

// Respuesta del endpoint voice-react
export interface VoiceReactResponse {
  ok: boolean;
  skipped?: boolean;    // true si no se generaron reacciones (silencio, fallo de IA, etc.)
  reason?: string;      // motivo del skip (solo para logs/debug)
  transcript?: string;  // transcripción detectada (útil en dev)
  count?: number;       // nº de reacciones encoladas
  topic?: string | null;
  intent?: VoiceIntent;
  confidence?: number;
  usesPreviousTopic?: boolean;
  turn?: VoiceTurn;
  context?: VoiceTurn[];
  error?: string;
}

/** Estado del capturador de voz del dashboard (hook useVoiceCapture) */
export type VoiceStatus = 'idle' | 'requesting' | 'listening' | 'processing' | 'permission-denied' | 'error';

// Configuración del overlay para OBS
export interface OverlayConfig {
  token: string;
  game: string;
  mode: StreamMode;
  personality: AudiencePersonality;
  speed: number; // índice de INTERVAL_PRESETS (0-3)
  platform: 'twitch' | 'kick';
}
