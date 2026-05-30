// Tipos base para mensajes de chat
export type MessageCategory = 'gameplay' | 'reactions' | 'questions' | 'comments';

export type WaveType = 'laugh' | 'hype' | 'fear' | 'omg';

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

export interface ChatMessage {
  id: string;
  username: string;
  content: string;
  timestamp: number;
  category: MessageCategory;
  personality: AudiencePersonality;
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

// Configuración del overlay para OBS
export interface OverlayConfig {
  token: string;
  game: string;
  mode: StreamMode;
  personality: AudiencePersonality;
  speed: number; // índice de INTERVAL_PRESETS (0-3)
  platform: 'twitch' | 'kick';
}
