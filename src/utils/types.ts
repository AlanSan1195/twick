// Tipos base para mensajes de chat
export type MessageCategory = 'gameplay' | 'reactions' | 'questions' | 'comments';

export type WaveType = 'laugh' | 'hype' | 'fear' | 'omg';

export type StreamMode = 'game' | 'justchatting';

/** Origen del stream SSE: dashboard (panel de control) u overlay (OBS Browser Source) */
export type StreamSource = 'dashboard' | 'overlay';

export interface MessagePattern {
  gameplay: string[];
  reactions: string[];
  questions: string[];
  comments?: string[];
  usernames?: string[];
}

export interface ChatMessage {
  id: string;
  username: string;
  content: string;
  timestamp: number;
  category: MessageCategory;
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
}

// Configuración del overlay para OBS
export interface OverlayConfig {
  token: string;
  game: string;
  mode: StreamMode;
  speed: number; // índice de INTERVAL_PRESETS (0-3)
  platform: 'twitch' | 'kick';
}
