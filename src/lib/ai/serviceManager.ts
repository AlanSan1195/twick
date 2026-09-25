import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import type { AIService, AIServiceMessage } from './types';
import type {
  AudiencePersonality,
  MessagePattern,
  StreamMode,
  VoiceAnalysis,
  VoiceIntent,
  VoiceReactionContext,
} from '../../utils/types';
import { DEFAULT_AUDIENCE_PERSONALITY } from '../../utils/types';

// Lista de servicios disponibles con failover
const services: AIService[] = [
  groqService,
  cerebrasService,
];

let currentServiceIndex = 0;

const PERSONALITY_PROMPTS: Record<AudiencePersonality, string> = {
  sarcastic: 'sarcastic: el chat hace comentarios sarcásticos, irónicos y con humor peculiar; se burla moderadamente de la situación sin insultar ni atacar al streamer, con frases cortas y ocurrentes.',
  normal: 'normal: el chat actúa como una audiencia fanática pero respetuosa, hace comentarios interesantes, atentos y positivos sobre el juego o tema, sin exagerar ni spamear.',
  curious: 'curious: el chat hace puras preguntas tecnicas del videojuego como rendimiento graficos etc... o el tema escogido',
  chaotic: 'chaotic: el chat escribe SOLO mensajes ultra cortos de 1 a 3 palabras como "jaja", "siii", "vamos", "osita", "nooo", "wtf", "uff", "lol"; nunca frases largas ni explicaciones.',
  chill: 'chill: el chat es relajado, con comentarios tranquilos, humor suave, baja intensidad y menos gritos o exageración.',
};

function getPersonalityPrompt(personality: AudiencePersonality): string {
  return PERSONALITY_PROMPTS[personality];
}

/**
 * Obtiene el siguiente servicio usando round-robin
 */
function getNextService(): AIService {
  const service = services[currentServiceIndex];
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}

/**
 * Intenta usar un servicio de IA con failover automático
 */
export async function chatWithAI(messages: AIServiceMessage[]): Promise<string> {
  let lastError: Error | null = null;
  
  // Intentar con cada servicio hasta que uno funcione
  for (let i = 0; i < services.length; i++) {
    const service = getNextService();
    
    try {
      console.log(`[AI] Usando servicio: ${service.name}`);
      const stream = await service.chat(messages);
      
      // Consumir el stream y concatenar la respuesta
      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
      }
      
      return fullResponse;
    } catch (error) {
      console.error(`[AI] Error con ${service.name}:`, error);
      lastError = error as Error;
      // Continuar con el siguiente servicio
    }
  }
  
  throw lastError || new Error('Todos los servicios de IA fallaron');
}

/**
 * Toma una muestra aleatoria de frases reales del juego para anclar al modelo
 * a su vocabulario, armas, personajes y ambientación auténticos. Prioriza
 * gameplay y questions porque son las que más contexto específico aportan.
 */
function buildGameContext(gamePhrases: MessagePattern): string {
  const pool = [
    ...gamePhrases.gameplay,
    ...gamePhrases.questions,
    ...(gamePhrases.comments ?? []),
  ];
  if (pool.length === 0) return '';

  // Muestra de hasta 12 frases sin repetir
  const sample: string[] = [];
  const copy = [...pool];
  for (let i = 0; i < 12 && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    sample.push(copy.splice(idx, 1)[0]);
  }
  return sample.map((phrase) => `- ${phrase}`).join('\n');
}

/**
 * Genera reacciones cortas de chat a lo que el streamer acaba de decir por el micrófono.
 * Si se pasan `gamePhrases` (frases reales cacheadas del juego), se inyectan como
 * contexto para que las reacciones sean fieles al juego y no inventen elementos de otros.
 * Devuelve un análisis vacío si la IA falla o la respuesta no es parseable (fallo silencioso:
 * el mic sigue funcionando y simplemente no se encola ninguna oleada).
 */
const VOICE_INTENTS: VoiceIntent[] = ['opinion', 'question', 'reaction', 'gameplay', 'casual', 'none'];
const STREAM_TERMS = /\b(stream(?:ing)?|chat|audiencia|directo|directa|en vivo|transmisión|transmision)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyVoiceAnalysis(): VoiceAnalysis {
  return {
    topic: null,
    intent: 'none',
    confidence: 0,
    usesPreviousTopic: false,
    messages: [],
  };
}

function normalizeVoiceTopic(value: string | null): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

/**
 * Analiza una frase y genera sus reacciones en una sola llamada estructurada.
 * El tema hablado tiene prioridad sobre el juego activo, que solo sirve como
 * contexto cuando la frase sigue hablando de ese juego.
 */
export async function generateVoiceReactions(
  transcript: string,
  context: VoiceReactionContext,
  mode: StreamMode,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
  gamePhrases?: MessagePattern | null,
): Promise<VoiceAnalysis> {
  const activeGameLabel = context.activeGame ?? 'ninguno';
  const previousTurns = context.recentTurns.length > 0
    ? context.recentTurns.map((turn) => ({
      transcript: turn.transcript,
      topic: turn.topic,
      intent: turn.intent,
    }))
    : [];

  // No exponemos frases del juego activo si la interfaz ya conoce un tema distinto.
  // En el flujo normal spokenTopic es null y el modelo decide si la frase cambia de tema.
  const topicIsActiveGame = context.spokenTopic === null
    || normalizeVoiceTopic(context.spokenTopic) === normalizeVoiceTopic(context.activeGame);
  const gameContext = topicIsActiveGame && gamePhrases ? buildGameContext(gamePhrases) : '';
  const contextBlock = gameContext
    ? `\n\nCONTEXTO DEL JUEGO ACTIVO "${activeGameLabel}". Úsalo solo si el tema detectado es ese mismo juego; ignóralo por completo cuando el streamer mencione otro tema:\n${gameContext}`
    : '';

  const systemPrompt = `Eres el chat en vivo de un stream de Twitch en español.
Analiza lo que el streamer acaba de decir y devuelve el análisis junto con sus reacciones en un único objeto JSON.

REGLAS DE ENRUTAMIENTO:
- El tema nombrado explícitamente por el streamer tiene prioridad absoluta sobre el juego activo.
- Si menciona GTA 5 mientras juega Minecraft, responde únicamente sobre GTA 5; no mezcles Minecraft ni el streaming.
- Usa el juego activo solo cuando la frase habla de jugar, construir, morir, conseguir objetos o avanzar en ese juego.
- Usa el tema "stream" solo si la frase menciona explícitamente stream, streaming, chat, audiencia, directo, en vivo o transmisión.
- Para referencias como "¿y cuál prefieren?", usa el último tema relevante de recentTurns y marca usesPreviousTopic=true.
- Si no hay tema claro, usa topic=null e intent="none" y devuelve mensajes=[]. No fuerces el juego activo.

REGLAS DE RESPUESTA:
- intent debe ser uno de: opinion, question, reaction, gameplay, casual, none.
- Genera entre 6 y 10 mensajes, excepto cuando intent sea none.
- Mensajes de 1 a 10 palabras, naturales, variados y en español coloquial de Twitch.
- Si pregunta algo, ofrece opiniones distintas; si afirma algo, reacciona sin repetir literalmente sus palabras.
- No inventes datos concretos del tema. Si no conoces un detalle, responde con una duda natural.
- Personalidad obligatoria: ${getPersonalityPrompt(personality)}
- No uses comillas dentro de los mensajes.
- Devuelve EXACTAMENTE este objeto JSON, sin markdown ni texto extra:
{"topic":"GTA 5", "intent":"opinion", "confidence":0.95, "usesPreviousTopic":false, "messages":["uff juegazo", "ese sí tiene historia", "yo sí le entro", "qué buena conversación", "hay opiniones divididas", "el chat se va a encender"]}${contextBlock}`;

  const userPrompt = `Juego activo: ${activeGameLabel}
Modo del stream: ${mode}
Tema previo indicado por el cliente: ${context.spokenTopic ?? 'ninguno'}
recentTurns: ${JSON.stringify(previousTurns)}
Transcripción actual: "${transcript}"

Analiza la transcripción y genera el objeto JSON solicitado.`;

  try {
    const response = await chatWithAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const withoutMarkdown = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const start = withoutMarkdown.indexOf('{');
    const end = withoutMarkdown.lastIndexOf('}');
    const cleanResponse = start >= 0 && end > start
      ? withoutMarkdown.slice(start, end + 1)
      : withoutMarkdown;
    const parsed: unknown = JSON.parse(cleanResponse);
    if (!isRecord(parsed)) return emptyVoiceAnalysis();

    const rawIntent = parsed.intent;
    const intent: VoiceIntent = typeof rawIntent === 'string' && VOICE_INTENTS.includes(rawIntent as VoiceIntent)
      ? rawIntent as VoiceIntent
      : 'none';
    const rawTopic = typeof parsed.topic === 'string' ? parsed.topic.trim().slice(0, 80) : '';
    const usesPreviousTopic = parsed.usesPreviousTopic === true;
    const hasExplicitStreamTerm = STREAM_TERMS.test(transcript);
    const topic = rawTopic.length > 0 && (!/stream|streaming|directo|chat|audiencia/i.test(rawTopic)
      || hasExplicitStreamTerm
      || usesPreviousTopic)
      ? rawTopic
      : null;
    const rawConfidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : 0;
    const confidence = Math.min(1, Math.max(0, rawConfidence));
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages
        .filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
        .map((message) => message.trim().slice(0, 160))
        .slice(0, 10)
      : [];

    if (intent === 'none' || !topic) {
      return { topic, intent: 'none', confidence, usesPreviousTopic, messages: [] };
    }

    return { topic, intent, confidence, usesPreviousTopic, messages };
  } catch (error) {
    console.error('[AI] Error generando análisis de voz:', error);
    return emptyVoiceAnalysis();
  }
}

/**
 * Genera frases de chat para un tema de Just Chatting usando IA
 */
export async function generateChatTopicPhrases(
  topic: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): Promise<{
  gameplay: string[];
  reactions: string[];
  questions: string[];
  comments: string[];
  usernames: string[];
  greetings: string[];
  initialReactions: string[];
}> {
  const systemPrompt = `Eres un generador de comentarios de chat de Twitch/YouTube para streams de tipo "Just Chatting" (charla libre con la audiencia).
Genera comentarios auténticos, variados y entretenidos.

VALIDACIÓN OBLIGATORIA:
- PRIMERO verifica si el input es un tema de conversación coherente y apropiado para un stream.
- Si el input contiene insultos, la palabra sexo, contenido sexual explícito, violencia, spam, código, comandos, o simplemente no tiene sentido como tema de conversación, devuelve EXACTAMENTE este JSON y nada más:
  {"error": "INVALID_TOPIC", "reason": "breve descripción de por qué no es válido"}
- Temas válidos incluyen: aspectos de la vida personal, hobbies, opiniones, noticias, cultura pop, viajes, comida, música, tecnología, etc.
- Solo procede si el tema es apropiado para una conversación en stream.

REGLAS para generar frases (solo si el tema es válido):
- Los comentarios deben ser cortos (1-50 palabras máximo), como chat real de Twitch
- Usa español casual y coloquial, jerga de internet
- El tono debe ser de conversación, no de juego — más opiniones, anécdotas cortas, chistes
- Personalidad obligatoria de la audiencia: ${getPersonalityPrompt(personality)}
- Varía entre comentarios, reacciones cortas y preguntas
- Escribe las frases sin emojis; el chat decide después cuándo añadirlos
- NO repitas frases
- Adapta el contenido específicamente al tema mencionado`;

  const userPrompt = `Genera comentarios de chat de Twitch para un stream de "Just Chatting" sobre el tema: "${topic}" con personalidad "${personality}".

Devuelve EXACTAMENTE este formato JSON (sin markdown, solo el JSON):
{
  "comments": ["frase1", "frase2", ... hasta 200 comentarios y opiniones sobre el tema],
  "reactions": ["frase1", "frase2", ... hasta 60 reacciones cortas emocionales],
  "questions": ["frase1", "frase2", ... hasta 120 preguntas que haría el chat al streamer],
  "gameplay": [],
  "usernames": ["username1", "username2", ... hasta 180 nombres de usuario estilo Twitch, creativos y variados, usa nombre de personas normales , modera el uso del guion bajo usalo muy poco , o números, sin espacios]
}`;

  const response = await chatWithAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);

  try {
    const cleanResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanResponse);

    // Detectar rechazo por tema inválido
    if (parsed.error === 'INVALID_TOPIC') {
      const invalidError = new Error(parsed.reason || 'Tema no válido');
      (invalidError as Error & { code: string }).code = 'INVALID_TOPIC';
      throw invalidError;
    }

    if (!parsed.comments || !parsed.reactions || !parsed.questions) {
      throw new Error('Estructura JSON inválida');
    }

    return {
      gameplay: [],
      reactions: Array.isArray(parsed.reactions) ? parsed.reactions : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      usernames: Array.isArray(parsed.usernames) ? parsed.usernames : [],
      greetings: [],
      initialReactions: [],
    };
  } catch (parseError) {
    if ((parseError as Error & { code?: string }).code === 'INVALID_TOPIC') {
      throw parseError;
    }
    console.error('[AI] Error parseando respuesta JC:', parseError);
    console.error('[AI] Respuesta raw:', response);
    throw new Error('No se pudo parsear la respuesta de la IA');
  }
}
/**
 * Genera saludos y reacciones iniciales para el inicio del stream
 */
export async function generateGreetings(
  gameName: string,
  mode: StreamMode,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): Promise<{
  greetings: string[];
  initialReactions: string[];
}> {
  const systemPrompt = `Eres un generador de mensajes de chat de Twitch/YouTube.
Tu tarea es crear mensajes de SALUDO y BIENVENIDA que los espectadores envían cuando un stream está por comenzar o apenas empieza.

REGLAS:
- Los saludos deben ser realistas y variados (hola, bienvenido, alegra, etc.)
- Incluye reacciones emocionales iniciales de emoción/anticipación
- Usa español casual y coloquial de Twitch
- Personalidad obligatoria de la audiencia: ${getPersonalityPrompt(personality)}
- Los mensajes deben ser cortos (1-20 palabras)
- NO repitas frases
- Evita saludos genéricos, sé específico al contexto`;

  const contextLabel = mode === 'justchatting' ? 'Just Chatting' : 'jugando a';

  const userPrompt = `Genera mensajes de chat de bienvenida para un stream de Twitch donde el streamer va a estar ${contextLabel} "${gameName}"

Devuelve EXACTAMENTE este formato JSON (sin markdown, solo el JSON):
{
  "greetings": ["hola", "holaaa", "bienvenido", "yujuuu", "por fin", ... hasta 60 saludos diversos y realistas],
  "initialReactions": ["emocionado", "letsgoo", "por fin", "ya era hora", "ansiioso", ... hasta 60 reacciones iniciales de emoción/anticipación]
}`;

  const response = await chatWithAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);

  try {
    const cleanResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanResponse);

    return {
      greetings: Array.isArray(parsed.greetings) ? parsed.greetings : [],
      initialReactions: Array.isArray(parsed.initialReactions) ? parsed.initialReactions : [],
    };
  } catch (parseError) {
    console.error('[AI] Error parseando saludos:', parseError);
    console.error('[AI] Respuesta raw:', response);
    return { greetings: [], initialReactions: [] };
  }
}

export async function generateGamePhrases(
  gameName: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): Promise<{
  gameplay: string[];
  reactions: string[];
  questions: string[];
  emotes: string[];
  usernames: string[];
  greetings: string[];
  initialReactions: string[];
}> {
  const systemPrompt = `Eres un generador de comentarios de chat de Twitch/YouTube para streams de videojuegos.
Genera comentarios auténticos, variados y entretenidos que los espectadores escribirían durante un stream.

VALIDACIÓN OBLIGATORIA:
- PRIMERO verifica si el input es un videojuego real y conocido.
- Si el input NO es un videojuego (por ejemplo: palabras aleatorias, insultos, frases, contenido sexual, violento o inapropiado, nombres de personas, marcas no relacionadas, comandos, código, etc.), devuelve EXACTAMENTE este JSON y nada más:
  {"error": "INVALID_GAME", "reason": "breve descripción de por qué no es válido"}
- Solo procede a generar frases si el input es claramente un videojuego o franquicia de videojuegos reconocible.

REGLAS para generar frases (solo si el input es un videojuego válido):
- Los comentarios deben ser cortos y medios (1-65 palabras máximo)
- Usa español casual y coloquial
- Incluye variedad: comentarios sobre gameplay, reacciones y preguntas
- Usa jerga de gamers y cultura de internet
- Personalidad obligatoria de la audiencia: ${getPersonalityPrompt(personality)}
- Escribe las frases sin emojis ni nombres de emotes; el chat decide después cuándo añadirlos
- Varía entre comentarios serios, graciosos, preguntas y reacciones
- NO repitas frases
- Adapta el contenido específicamente al juego mencionado`;

  const userPrompt = `Genera comentarios de chat de Twitch para el videojuego: "${gameName}" con personalidad "${personality}".

Devuelve EXACTAMENTE este formato JSON (sin markdown, solo el JSON):
{
  "gameplay": ["frase1", "frase2", ... hasta 200 frases sobre gameplay/mecánicas],
  "reactions": ["frase1", "frase2", ... hasta 60 frases de reacciones cortas],
  "questions": ["frase1", "frase2", ... hasta 120 preguntas que haría el chat],
  "emotes": ["emote1", "emote2", ... hasta 40 emotes populares usados en Twitch/YouTube],
  "usernames": ["username1", "username2", ... hasta 180 nombres de usuario estilo Twitch, creativos y variados, usa nombre de personas normales , modera el uso del guion bajo usalo muy poco , o números, sin espacios]
}`;

  const response = await chatWithAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);

  // Parsear la respuesta JSON
  try {
    // Limpiar posibles caracteres extra
    const cleanResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const parsed = JSON.parse(cleanResponse);

    // Detectar rechazo por input inválido
    if (parsed.error === 'INVALID_GAME') {
      const invalidError = new Error(parsed.reason || 'Input no válido');
      (invalidError as Error & { code: string }).code = 'INVALID_GAME';
      throw invalidError;
    }
    
    // Validar estructura
    if (!parsed.gameplay || !parsed.reactions || !parsed.questions || !parsed.emotes) {
      throw new Error('Estructura JSON inválida');
    }
    
    return {
      gameplay: Array.isArray(parsed.gameplay) ? parsed.gameplay : [],
      reactions: Array.isArray(parsed.reactions) ? parsed.reactions : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      emotes: Array.isArray(parsed.emotes) ? parsed.emotes : [],
      usernames: Array.isArray(parsed.usernames) ? parsed.usernames : [],
      greetings: [],
      initialReactions: [],
    };
  } catch (parseError) {
    // Re-lanzar errores de validación sin envolverlos
    if ((parseError as Error & { code?: string }).code === 'INVALID_GAME') {
      throw parseError;
    }
    console.error('[AI] Error parseando respuesta:', parseError);
    console.error('[AI] Respuesta raw:', response);
    throw new Error('No se pudo parsear la respuesta de la IA');
  }
}
