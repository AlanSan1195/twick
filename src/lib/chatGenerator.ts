import type { MessageCategory, ChatMessage, MessagePattern, StreamMode } from '../utils/types';
import { getPhrasesForGame } from './phraseCache';

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

function getRandomCategory(mode: StreamMode): MessageCategory {
  if (mode === 'justchatting') {
    // JC: más comentarios y reacciones, menos preguntas
    const categories: MessageCategory[] = ['comments', 'reactions', 'questions'];
    const weights = [0.50, 0.25, 0.15];
    const random = Math.random();
    let sum = 0;
    for (let i = 0; i < categories.length; i++) {
      sum += weights[i];
      if (random < sum) return categories[i];
    }
    return 'comments';
  }

  // Modo juego: gameplay y preguntas con peso mayor
  const categories: MessageCategory[] = ['gameplay', 'reactions', 'questions'];
  const weights = [0.5, 0.4, 0.1];
  const random = Math.random();
  let sum = 0;
  for (let i = 0; i < categories.length; i++) {
    sum += weights[i];
    if (random < sum) return categories[i];
  }
  return 'gameplay';
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
  usernames: [
    'usersin_vida',
    'lag_eterno',
    'patata_gamer',
    'noobEtterno99',
    'el_delchat',
    'viewer_errandom',
    'pandagamer_x',
    'sombra67',
    'doncomedia',
    'tostadora_pro',
    'abuelitagamer',
    'capitansalami',
    'pinguinoMAAafioso',
    'coci',
    'reyattack',
    'ROCKETMAN',
    'twicki',
    'twick',
    'rockit'
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
export function generateMessage(gameName: string, mode: StreamMode = 'game'): ChatMessage {
  const patterns = getPhrasesForGame(gameName) || FALLBACK_PHRASES;
  const category = getRandomCategory(mode);

  // Para JC, si la categoria es 'comments' pero no hay frases (juego en cache sin comments), usar gameplay como fallback
  let messageArray = patterns[category as keyof MessagePattern] ?? [];
  if (!messageArray || messageArray.length === 0) {
    const fallbackCat: keyof MessagePattern = mode === 'justchatting' ? 'comments' : 'gameplay';
    messageArray = FALLBACK_PHRASES[fallbackCat] ?? FALLBACK_PHRASES.gameplay;
  }

  const content = messageArray.length > 0
    ? getRandomElement(messageArray as string[])
    : getRandomElement(FALLBACK_PHRASES.gameplay);

  const usernameSource = patterns.usernames?.length ? patterns.usernames : FALLBACK_PHRASES.usernames!;

  return {
    id: crypto.randomUUID(),
    username: getNextUsername(gameName, usernameSource),
    content,
    timestamp: Date.now(),
    category
  };
}

export function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Genera mensajes de saludo iniciales para el inicio del stream
 */
export function generateInitialGreetings(gameName: string): ChatMessage[] {
  const patterns = getPhrasesForGame(gameName);

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

  const usernameSource = patterns?.usernames?.length ? patterns.usernames : FALLBACK_PHRASES.usernames!;

  const messages: ChatMessage[] = shuffled.map((content, index) => ({
    id: crypto.randomUUID(),
    username: getNextUsername(gameName, usernameSource),
    content,
    timestamp: Date.now() + index * 100,
    category: 'reactions' as MessageCategory
  }));

  return messages;
}
