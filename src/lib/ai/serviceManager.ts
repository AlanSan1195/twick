import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import type { AIService, AIServiceMessage } from './types';

// Lista de servicios disponibles con failover
const services: AIService[] = [
  groqService,
  cerebrasService,
];

let currentServiceIndex = 0;

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
 * Genera frases de chat para un tema de Just Chatting usando IA
 */
export async function generateChatTopicPhrases(topic: string): Promise<{
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
- Varía entre comentarios, reacciones cortas y preguntas
- NO repitas frases
- Adapta el contenido específicamente al tema mencionado`;

  const userPrompt = `Genera comentarios de chat de Twitch para un stream de "Just Chatting" sobre el tema: "${topic}"

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
export async function generateGreetings(gameName: string, mode: 'game' | 'justchatting'): Promise<{
  greetings: string[];
  initialReactions: string[];
}> {
  const systemPrompt = `Eres un generador de mensajes de chat de Twitch/YouTube.
Tu tarea es crear mensajes de SALUDO y BIENVENIDA que los espectadores envían cuando un stream está por comenzar o apenas empieza.

REGLAS:
- Los saludos deben ser realistas y variados (hola, bienvenido, alegra, etc.)
- Incluye reacciones emocionales iniciales de emoción/anticipación
- Usa español casual y coloquial de Twitch
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

export async function generateGamePhrases(gameName: string): Promise<{
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
- Incluye variedad: comentarios sobre gameplay, reacciones, preguntas y emotes
- Usa jerga de gamers y cultura de internet
- Incluye emotes populares como: 🤯, 🕹️, 😂, ❤️, 🥲, 🤬,🤓
- Algunos pueden tener emojis pero no abuses
- Varía entre comentarios serios, graciosos, preguntas y reacciones
- NO repitas frases
- Adapta el contenido específicamente al juego mencionado`;

  const userPrompt = `Genera comentarios de chat de Twitch para el videojuego: "${gameName}"

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
