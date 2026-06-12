import type { AudiencePersonality, MessageCategory, ChatMessage, MessagePattern, StreamMode } from '../utils/types';
import { DEFAULT_AUDIENCE_PERSONALITY } from '../utils/types';
import { getPhrasesForGame } from './phraseCache';
import { generateUsernamePool } from './usernameGenerator';

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================
// SHUFFLE POOL DE USERNAMES POR JUEGO
// Garantiza que no se repita un username hasta
// haber rotado todos los disponibles.
// ============================================

interface UsernamePool {
  queue: string[];
  source: string[];
}

const usernamePools = new Map<string, UsernamePool>();

/** Cantidad de usernames procedurales generados por juego */
const USERNAME_POOL_SIZE = 60;

// Pools de usernames procedurales por juego.
// Se generan una sola vez por juego para que la audiencia sea estable
// (los mismos "viewers" durante toda la sesión de stream).
const generatedUsernameSources = new Map<string, string[]>();

function getUsernameSource(gameName: string): string[] {
  let source = generatedUsernameSources.get(gameName);
  if (!source) {
    source = generateUsernamePool(USERNAME_POOL_SIZE);
    generatedUsernameSources.set(gameName, source);
  }
  return source;
}

function shuffled<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getNextUsername(gameName: string, usernames: string[]): string {
  let pool = usernamePools.get(gameName);

  // Si no existe pool o la fuente cambió de tamaño (juego recargado), reiniciar
  if (!pool || pool.source.length !== usernames.length) {
    pool = { queue: shuffled(usernames), source: usernames };
    usernamePools.set(gameName, pool);
  }

  // Si se agotó el pool, rebarajar para la siguiente ronda
  if (pool.queue.length === 0) {
    pool.queue = shuffled(pool.source);
  }

  return pool.queue.pop()!;
}

interface CategoryWeight {
  category: MessageCategory;
  weight: number;
}

const CATEGORY_WEIGHTS: Record<AudiencePersonality, Record<StreamMode, CategoryWeight[]>> = {
  sarcastic: {
    game: [
      { category: 'gameplay', weight: 0.38 },
      { category: 'reactions', weight: 0.42 },
      { category: 'questions', weight: 0.20 },
    ],
    justchatting: [
      { category: 'comments', weight: 0.48 },
      { category: 'reactions', weight: 0.30 },
      { category: 'questions', weight: 0.22 },
    ],
  },
  normal: {
    game: [
      { category: 'gameplay', weight: 0.45 },
      { category: 'reactions', weight: 0.30 },
      { category: 'questions', weight: 0.25 },
    ],
    justchatting: [
      { category: 'comments', weight: 0.45 },
      { category: 'reactions', weight: 0.25 },
      { category: 'questions', weight: 0.30 },
    ],
  },
  curious: {
    game: [
      { category: 'gameplay', weight: 0.35 },
      { category: 'reactions', weight: 0.20 },
      { category: 'questions', weight: 0.45 },
    ],
    justchatting: [
      { category: 'comments', weight: 0.30 },
      { category: 'reactions', weight: 0.15 },
      { category: 'questions', weight: 0.55 },
    ],
  },
  chaotic: {
    game: [
      { category: 'gameplay', weight: 0.30 },
      { category: 'reactions', weight: 0.55 },
      { category: 'questions', weight: 0.15 },
    ],
    justchatting: [
      { category: 'comments', weight: 0.35 },
      { category: 'reactions', weight: 0.45 },
      { category: 'questions', weight: 0.20 },
    ],
  },
  chill: {
    game: [
      { category: 'gameplay', weight: 0.48 },
      { category: 'reactions', weight: 0.22 },
      { category: 'questions', weight: 0.30 },
    ],
    justchatting: [
      { category: 'comments', weight: 0.55 },
      { category: 'reactions', weight: 0.15 },
      { category: 'questions', weight: 0.30 },
    ],
  },
};

// ============================================
// SUSCRIPCIONES SIMULADAS
// Con baja probabilidad, un mensaje normal se reemplaza por una
// suscripción destacada (estilo resub de Twitch) con su mensaje adjunto.
// ============================================

/** Probabilidad de que un tick del stream sea una suscripción */
const SUB_CHANCE = 0.045;

/** Tiempo mínimo entre suscripciones por juego (evita rachas) */
const SUB_COOLDOWN_MS = 45_000;

const lastSubTimestamps = new Map<string, number>();

// Mensajes que el suscriptor escribe junto a su sub
const SUB_FOLLOWUP_MESSAGES = [
  'mi buen amooo',
  'aquí apoyando como siempre',
  'no me pierdo un stream',
  'toma mi prime crack',
  'el mejor canal, sin duda',
  'feliz de aportar mi granito',
  'a seguir creciendo!!',
  'este canal lo vale',
  'un placer apoyar',
  'vamos con todo',
  '❤️❤️❤️',
  'pog',
  'ya era hora de renovar jaja',
  'contigo hasta el final',
  'el sub mejor invertido',
];

function maybeCreateSubMessage(
  gameName: string,
  personality: AudiencePersonality,
): ChatMessage | null {
  const now = Date.now();
  const lastSub = lastSubTimestamps.get(gameName) ?? 0;

  if (now - lastSub < SUB_COOLDOWN_MS || Math.random() >= SUB_CHANCE) {
    return null;
  }

  lastSubTimestamps.set(gameName, now);

  return {
    id: crypto.randomUUID(),
    username: getNextUsername(gameName, getUsernameSource(gameName)),
    content: getRandomElement(SUB_FOLLOWUP_MESSAGES),
    timestamp: now,
    category: 'reactions',
    personality,
    sub: {
      months: Math.floor(Math.random() * 48) + 1,
      tier: Math.random() < 0.7 ? 'Prime' : 'Nivel 1',
    },
  };
}

const CHAOTIC_SHORT_MESSAGES = [
  'jaja',
  'jajaja',
  'siii',
  'vamos',
  'osita',
  'nooo',
  'wtf',
  'uff',
  'lol',
  'aaa',
  'xd',
  'yaaa',
  'bruh',
  'boom',
  'ehhh',
  'full',
  'top',
  'no way',
  'queee',
  'joya',
];

function getRandomCategory(
  mode: StreamMode,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): MessageCategory {
  const weights = CATEGORY_WEIGHTS[personality][mode];
  const random = Math.random();
  let sum = 0;
  for (const item of weights) {
    sum += item.weight;
    if (random < sum) return item.category;
  }
  return weights[0]?.category ?? 'gameplay';
}

function getChaoticContent(content: string): string {
  const words = content.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 3 && content.length <= 18) {
    return content;
  }

  return getRandomElement(CHAOTIC_SHORT_MESSAGES);
}

// Frases genéricas de fallback
const FALLBACK_PHRASES: MessagePattern = {
  gameplay: [
    'Nice!',
    'eres la polla alan san',
    'Bien jugado, pero no le llegas al xokas',
    'Eso estuvo genial, ojala,hagas colab',
    'Que pro pro pro pro',
    'Increible homiee',
    'Brutal he burtal!!',
    'Me encanta este juego',
    'Sigue asi crack',
    'Vas a topeee',
    'Dale con todooo',
    'A por todasss',
    'Eres un maquinaaa',
    'ibai te va a regañar',
    'illojuan ?',
    'mierdon histrico',
    ''
  ],
  reactions: [
    'JAJAJA',
    'WTF',
    'XD',
    'LOL',
    'JAJAJAJASJAJSAJSJAJSA',
    'jajaja',
    'No puede ser, ay no ',
    '😂😂😂',
    '😭😭😭',
    'el diaaaablo',
    'jajJAjjAAJAJajaJAAJA',
    'XD AJAJ ',
    'yaaaaaaa',
    'mmmmmm',
    'mmm'
  ],
  questions: [
    'Cuantas horas llevas?',
    'Que tal el juego?',
    'Lo recomiendas?',
    'si es tan bueno como dicen?',
    'Es dificil?',
    'Vale la pena comprarlo?',
    'Cual es tu parte favorita?',
    'Hay muchos bugs?',
    'Se puede jugar en cooperativo?',
    'Que tal los graficos?',
  ],
  comments: [
    'jaja buena historia',
    'eso me pasó igual a mi',
    'no lo puedo creer',
    'sigue contando!!',
    'eso suena brutal',
    'literalmente yo',
    'cuéntame más',
    '😂😂😂',
    'el chat no puede con esto',
  ],
  greetings: [
    'Hola holaaa!!',
    'yujuuu ya vamos a empezar',
    'Una semana sin conectarte, excelente qué emoción, cómo estás?',
    'Ahora sí vamos a jugar y a reir',
    'Holaaaaaa',
    'Hellow a todos',
    'Por finuuu',
    'Buenas buenas',
    'Wenas wenas',
    'Ya estaba echando de menos el stream',
    'Buenasss',
    'Hola buenas',
    'Weno ya empezó',
    'Ayy por fin apareciste',
    'Buen día streamer',
    'Vamos Vamos Vamos',
    'Qué pasa crack',
    'Empezó el mejor stream',
    'Hola hola',
    'Ya Era Hora',
    'Vamo a darle',
    'Buen finde',
    'Qué tal hoy?',
    "Ya we're",
    'Eyyyyy',
    'Qué pasaaa',
    'Agradezco que начало',
    'Buenastardes',
    'Hola desde Colombia',
    'Hola desde España',
    'Hola desde México',
    'Ya está online',
    'Por fin vuelve el mejor',
    'No puedo creer que esté aquí',
    'A la carga',
    'Vamos con todo',
    'Vamo vamo',
    'Ya era hora de verte',
    'Buenísimo que iniziemos',
    'Qué bueno verte otra vez',
    'Genial que estés aquí',
    'Vamos a pasarla bien',
    'Yo preparando las palomitas',
    'A divertirse',
    'Dale stream',
  ],
  initialReactions: [
    'letsgoo',
    'emocionado',
    'por fin',
    'ya Era Hora',
    'ansiioso',
    'aqui estoy',
    'presente',
    'ready',
    'por finnn',
    'Qué emoción',
    'Vamo vamo',
    'aaaaaa',
    'lets gooo',
    'emocion',
    'ansioso',
    'YA',
    'Ya por fin',
    'empecemos',
    'venga venga',
    'vamosss',
    'por fin vuelve',
    'genial',
    'Qué buen día para un stream',
    'Perfecto',
    'Me tienes here',
    'Boa',
    'Ggg',
    'Pog',
    'PogChamp',
    'lets go',
    'Ya Era Hora',
    'Emocionaaao',
    'Que bueno',
    'Ammm',
    'Me encanta este momento',
    'Listo para reir',
    'A la aventura',
    'Buena energía',
    'Positivo',
    'Ayy qué bueno',
    'Vamo a echarnos unas risas',
    'Que rico',
    'Me tiene feliz',
    'Esto es lo mejor',
    'Vamos a disfrutarlo',
  ],
};

/**
 * Genera un mensaje de chat para un juego/tema específico
 */
export function generateMessage(
  gameName: string,
  mode: StreamMode = 'game',
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): ChatMessage {
  // De vez en cuando, el tick produce una suscripción destacada en vez de un mensaje normal
  const subMessage = maybeCreateSubMessage(gameName, personality);
  if (subMessage) {
    return subMessage;
  }

  const patterns = getPhrasesForGame(gameName, personality) || FALLBACK_PHRASES;
  const category = getRandomCategory(mode, personality);

  // Para JC, si la categoria es 'comments' pero no hay frases (juego en cache sin comments), usar gameplay como fallback
  let messageArray = patterns[category as keyof MessagePattern] ?? [];
  if (!messageArray || messageArray.length === 0) {
    const fallbackCat: keyof MessagePattern = mode === 'justchatting' ? 'comments' : 'gameplay';
    messageArray = FALLBACK_PHRASES[fallbackCat] ?? FALLBACK_PHRASES.gameplay;
  }

  const rawContent = messageArray.length > 0
    ? getRandomElement(messageArray as string[])
    : getRandomElement(FALLBACK_PHRASES.gameplay);
  const content = personality === 'chaotic' ? getChaoticContent(rawContent) : rawContent;

  return {
    id: crypto.randomUUID(),
    username: getNextUsername(gameName, getUsernameSource(gameName)),
    content,
    timestamp: Date.now(),
    category,
    personality,
  };
}

export function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Genera mensajes de saludo iniciales para el inicio del stream
 */
export function generateInitialGreetings(
  gameName: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): ChatMessage[] {
  const patterns = getPhrasesForGame(gameName, personality);

  const greetings = patterns?.greetings ?? FALLBACK_PHRASES.greetings ?? [];
  const initialReactions = patterns?.initialReactions ?? FALLBACK_PHRASES.initialReactions ?? [];

  if (greetings.length === 0 && initialReactions.length === 0) {
    return [];
  }

  const allGreetings = [...greetings, ...initialReactions];
  const count = Math.min(25, allGreetings.length); // Al menos 20 saludos

  const shuffled = allGreetings
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
    .slice(0, count);

  const messages: ChatMessage[] = shuffled.map((content, index) => ({
    id: crypto.randomUUID(),
    username: getNextUsername(gameName, getUsernameSource(gameName)),
    content: personality === 'chaotic' ? getChaoticContent(content) : content,
    timestamp: Date.now() + index * 100,
    category: 'reactions' as MessageCategory,
    personality,
  }));

  return messages;
}
