import type {
  VoiceConversationRelation,
  VoiceEmotion,
  VoiceIntent,
  VoiceStoryMessage,
  VoiceStoryState,
  VoiceStoryTurn,
} from '../utils/types';

/** Límites compartidos por el dashboard y la API para mantener la historia acotada. */
export const VOICE_STORY_LIMITS = {
  maxTurns: 6,
  maxMessagesPerTurn: 10,
  maxSummaryLength: 800,
  maxPreviousTopics: 4,
  maxContextBytes: 24_000,
  maxTranscriptLength: 240,
  maxTopicLength: 80,
  maxBeatLength: 180,
  maxMessageIdLength: 128,
  maxUsernameLength: 32,
  maxMessageLength: 160,
} as const;

/** Devuelve el tamaño serializado real para controlar el límite del contexto. */
export function getVoiceStoryByteSize(state: VoiceStoryState): number {
  return new TextEncoder().encode(JSON.stringify(state)).byteLength;
}

const VOICE_INTENTS: readonly VoiceIntent[] = [
  'opinion',
  'question',
  'reaction',
  'gameplay',
  'casual',
  'none',
];

const VOICE_RELATIONS: readonly VoiceConversationRelation[] = [
  'new_topic',
  'continuation',
  'follow_up',
  'reply_to_chat',
  'topic_shift',
  'none',
];

const VOICE_EMOTIONS: readonly VoiceEmotion[] = [
  'neutral',
  'curious',
  'surprised',
  'amused',
  'confused',
  'excited',
  'frustrated',
];

/** Crea una historia nueva sin referencias a sesiones anteriores. */
export function createEmptyVoiceStory(): VoiceStoryState {
  return {
    summary: '',
    activeTopic: null,
    previousTopics: [],
    recentTurns: [],
  };
}

/** Alias explícito para usar al cerrar o reiniciar el micrófono. */
export function clearVoiceStory(): VoiceStoryState {
  return createEmptyVoiceStory();
}

/**
 * Comprueba una frontera de datos recibidos desde el navegador.
 * `unknown` es intencional: la historia llega serializada y no debe asumirse válida.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Las funciones de normalización reciben unknown porque procesan JSON externo
// y deben validar cada campo antes de incorporarlo al estado tipado.
function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, maxLength);
  return text.length > 0 ? text : null;
}

function readNullableText(value: unknown, maxLength: number): string | null {
  return readText(value, maxLength);
}

function readSequence(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isVoiceIntent(value: unknown): value is VoiceIntent {
  return typeof value === 'string' && VOICE_INTENTS.includes(value as VoiceIntent);
}

function isVoiceConversationRelation(value: unknown): value is VoiceConversationRelation {
  return typeof value === 'string' && VOICE_RELATIONS.includes(value as VoiceConversationRelation);
}

function isVoiceEmotion(value: unknown): value is VoiceEmotion {
  return typeof value === 'string' && VOICE_EMOTIONS.includes(value as VoiceEmotion);
}

function normalizeTopicKey(topic: string): string {
  return topic.trim().toLocaleLowerCase();
}

function addUniqueTopic(topics: string[], topic: string): string[] {
  const topicKey = normalizeTopicKey(topic);
  const withoutDuplicate = topics.filter((current) => normalizeTopicKey(current) !== topicKey);
  return [...withoutDuplicate, topic].slice(-VOICE_STORY_LIMITS.maxPreviousTopics);
}

function normalizeMessage(value: unknown): VoiceStoryMessage | null {
  if (!isRecord(value)) return null;

  const id = readText(value.id, VOICE_STORY_LIMITS.maxMessageIdLength);
  const content = readText(value.content, VOICE_STORY_LIMITS.maxMessageLength);
  if (!id || !content) return null;

  return {
    id,
    username: readText(value.username, VOICE_STORY_LIMITS.maxUsernameLength) ?? 'chat',
    content,
  };
}

function normalizeTurn(value: unknown): VoiceStoryTurn | null {
  if (!isRecord(value)) return null;

  const transcript = readText(value.transcript, VOICE_STORY_LIMITS.maxTranscriptLength);
  if (!transcript) return null;

  const chatMessages = Array.isArray(value.chatMessages)
    ? value.chatMessages
      .map(normalizeMessage)
      .filter((message): message is VoiceStoryMessage => message !== null)
      .slice(0, VOICE_STORY_LIMITS.maxMessagesPerTurn)
    : [];

  return {
    sequence: readSequence(value.sequence),
    transcript,
    topic: readNullableText(value.topic, VOICE_STORY_LIMITS.maxTopicLength),
    intent: isVoiceIntent(value.intent) ? value.intent : 'none',
    relation: isVoiceConversationRelation(value.relation) ? value.relation : 'none',
    emotion: isVoiceEmotion(value.emotion) ? value.emotion : 'neutral',
    referencedMessageId: readNullableText(value.referencedMessageId, VOICE_STORY_LIMITS.maxMessageIdLength),
    chatMessages,
    beat: readText(value.beat, VOICE_STORY_LIMITS.maxBeatLength) ?? '',
    timestamp: readTimestamp(value.timestamp),
  };
}

function isPersistableTurn(turn: VoiceStoryTurn): boolean {
  return turn.intent !== 'none' && turn.chatMessages.length > 0;
}

function normalizePreviousTopics(value: unknown, activeTopic: string | null): string[] {
  if (!Array.isArray(value)) return [];

  const topics: string[] = [];
  for (const item of value) {
    const topic = readText(item, VOICE_STORY_LIMITS.maxTopicLength);
    if (!topic) continue;
    if (activeTopic && normalizeTopicKey(topic) === normalizeTopicKey(activeTopic)) continue;
    if (topics.some((current) => normalizeTopicKey(current) === normalizeTopicKey(topic))) continue;
    topics.push(topic);
  }
  return topics.slice(-VOICE_STORY_LIMITS.maxPreviousTopics);
}

/**
 * Valida y recorta una historia procedente del navegador o de una respuesta de IA.
 * La función siempre devuelve un objeto nuevo y nunca modifica la entrada.
 */
export function sanitizeVoiceStory(input: unknown): VoiceStoryState {
  if (!isRecord(input)) return createEmptyVoiceStory();

  const activeTopic = readNullableText(input.activeTopic, VOICE_STORY_LIMITS.maxTopicLength);
  const summary = readText(input.summary, VOICE_STORY_LIMITS.maxSummaryLength) ?? '';
  const previousTopics = normalizePreviousTopics(input.previousTopics, activeTopic);
  const normalizedTurns = Array.isArray(input.recentTurns)
    ? input.recentTurns
      .map(normalizeTurn)
      .filter((turn): turn is VoiceStoryTurn => turn !== null && isPersistableTurn(turn))
      .slice(-VOICE_STORY_LIMITS.maxTurns)
    : [];
  const messageIds = new Set(
    normalizedTurns.flatMap((turn) => turn.chatMessages.map((message) => message.id)),
  );
  const recentTurns = normalizedTurns.map((turn) => (
    turn.referencedMessageId && messageIds.has(turn.referencedMessageId)
      ? turn
      : { ...turn, referencedMessageId: null }
  ));

  const normalizedStory: VoiceStoryState = {
    summary,
    activeTopic,
    previousTopics,
    recentTurns,
  };

  // Si un cliente antiguo envía demasiados turnos, conserva el estado más
  // reciente y elimina los turnos más viejos hasta entrar en el presupuesto.
  let boundedTurns = normalizedStory.recentTurns;
  while (boundedTurns.length > 0 && getVoiceStoryByteSize({
    ...normalizedStory,
    recentTurns: boundedTurns,
  }) > VOICE_STORY_LIMITS.maxContextBytes) {
    boundedTurns = boundedTurns.slice(1);
  }

  const boundedStory = { ...normalizedStory, recentTurns: boundedTurns };
  return getVoiceStoryByteSize(boundedStory) <= VOICE_STORY_LIMITS.maxContextBytes
    ? boundedStory
    : createEmptyVoiceStory();
}

/**
 * Agrega un turno válido sin mutar el estado anterior.
 * `nextSummary` permite guardar el resumen producido por la misma llamada de IA;
 * si se omite, se añade el beat del turno como resumen provisional.
 */
export function appendVoiceStoryTurn(
  state: VoiceStoryState,
  turn: VoiceStoryTurn,
  nextSummary?: string,
): VoiceStoryState {
  const base = sanitizeVoiceStory(state);
  const normalizedTurn = normalizeTurn(turn);
  if (!normalizedTurn || !isPersistableTurn(normalizedTurn)) return base;

  const nextTurns = [...base.recentTurns, normalizedTurn].slice(-VOICE_STORY_LIMITS.maxTurns);
  const topicChanged = Boolean(
    normalizedTurn.topic
      && base.activeTopic
      && normalizeTopicKey(normalizedTurn.topic) !== normalizeTopicKey(base.activeTopic),
  );
  const previousTopics = topicChanged && base.activeTopic
    ? addUniqueTopic(base.previousTopics, base.activeTopic)
    : [...base.previousTopics];
  const activeTopic = normalizedTurn.topic ?? base.activeTopic;
  const filteredPreviousTopics = activeTopic
    ? previousTopics.filter((topic) => normalizeTopicKey(topic) !== normalizeTopicKey(activeTopic))
    : previousTopics;
  const providedSummary = readText(nextSummary, VOICE_STORY_LIMITS.maxSummaryLength);
  const fallbackSummary = [base.summary, normalizedTurn.beat]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .slice(-VOICE_STORY_LIMITS.maxSummaryLength);

  return sanitizeVoiceStory({
    summary: providedSummary ?? fallbackSummary,
    activeTopic,
    previousTopics: filteredPreviousTopics,
    recentTurns: nextTurns,
  });
}

/** Indica si un mensaje pertenece a los turnos guardados de esta historia. */
export function isKnownReferencedMessage(state: VoiceStoryState, messageId: string): boolean {
  const normalizedId = messageId.trim();
  if (!normalizedId) return false;

  return state.recentTurns.some((turn) => turn.chatMessages.some((message) => message.id === normalizedId));
}
