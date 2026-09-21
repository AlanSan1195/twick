import type { APIRoute } from 'astro';
import type {
  ChatMessage,
  StreamMode,
  VoiceIntent,
  VoiceReactResponse,
  VoiceReactionContext,
  VoiceTurn,
} from '../../utils/types';
import { resolveAudiencePersonality } from '../../utils/types';
import { transcribeAudio } from '../../lib/ai/services/groq';
import { generateVoiceReactions } from '../../lib/ai/serviceManager';
import { getPhrasesForGame } from '../../lib/phraseCache';
import { generateMessage } from '../../lib/chatGenerator';
import { enqueueVoiceWave } from '../../lib/waveManager';
import { hasActiveStream, checkVoiceRateLimit } from '../../lib/rateLimiter';
import { resolveSessionUserId } from '../../lib/devAuth';

/** Tamaño máximo del audio (~1.5MB, de sobra para 10s de opus/aac) */
const MAX_AUDIO_BYTES = 1_500_000;

/** Longitud mínima de transcripción para considerarla útil */
const MIN_TRANSCRIPT_LENGTH = 6;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_CONTEXT_TURNS = 3;
const MAX_CONTEXT_TRANSCRIPT_LENGTH = 240;
const MAX_CONTEXT_TOPIC_LENGTH = 80;
const VOICE_INTENTS: VoiceIntent[] = ['opinion', 'question', 'reaction', 'gameplay', 'casual', 'none'];

interface VoiceSessionState {
  sessionId: string;
  lastSequence: number;
  retiredSessionIds: string[];
}

/** Estado efímero: un nuevo voiceSessionId invalida cualquier respuesta anterior. */
const voiceSessions = new Map<string, VoiceSessionState>();

function jsonResponse(body: VoiceReactResponse | { error: string }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVoiceIntent(value: unknown): value is VoiceIntent {
  return typeof value === 'string' && VOICE_INTENTS.includes(value as VoiceIntent);
}

/** Valida y recorta el contexto enviado por el navegador para mantenerlo acotado. */
function parseRecentTurns(value: FormDataEntryValue | null): VoiceTurn[] {
  if (typeof value !== 'string' || value.length > 12_000) return [];

  try {
    // JSON.parse devuelve unknown intencionalmente: cada campo se valida abajo.
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isRecord)
      .map((turn): VoiceTurn | null => {
        const transcript = typeof turn.transcript === 'string'
          ? turn.transcript.trim().slice(0, MAX_CONTEXT_TRANSCRIPT_LENGTH)
          : '';
        const topic = typeof turn.topic === 'string'
          ? turn.topic.trim().slice(0, MAX_CONTEXT_TOPIC_LENGTH)
          : null;
        const timestamp = typeof turn.timestamp === 'number' && Number.isFinite(turn.timestamp)
          ? turn.timestamp
          : Date.now();
        if (!transcript || !isVoiceIntent(turn.intent)) return null;
        return { transcript, topic: topic || null, intent: turn.intent, timestamp };
      })
      .filter((turn): turn is VoiceTurn => turn !== null)
      .slice(-MAX_CONTEXT_TURNS);
  } catch {
    return [];
  }
}

function isValidSessionId(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_SESSION_ID_LENGTH
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isCurrentSession(userId: string, sessionId: string, sequence: number): boolean {
  const state = voiceSessions.get(userId);
  return state?.sessionId === sessionId && state.lastSequence === sequence;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = resolveSessionUserId(locals, request);

    if (!userId) {
      return jsonResponse({ error: 'No autenticado' }, 401);
    }

    // El usuario debe tener un stream SSE activo al que enviar las reacciones.
    if (!hasActiveStream(userId, 'dashboard')) {
      return jsonResponse({ error: 'No hay stream activo para este usuario' }, 400);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonResponse({ error: 'Se esperaba un body multipart/form-data' }, 400);
    }

    const audio = formData.get('audio');
    const modeRaw = formData.get('mode');
    const mode: StreamMode = modeRaw === 'justchatting' ? 'justchatting' : 'game';
    const legacyGame = formData.get('game');
    const activeGameRaw = formData.get('activeGame');
    const activeGame = typeof activeGameRaw === 'string'
      ? activeGameRaw.trim().slice(0, MAX_CONTEXT_TOPIC_LENGTH) || null
      : mode === 'game' && typeof legacyGame === 'string'
        ? legacyGame.trim().slice(0, MAX_CONTEXT_TOPIC_LENGTH) || null
        : null;
    const spokenTopicRaw = formData.get('spokenTopic');
    const spokenTopic = typeof spokenTopicRaw === 'string'
      ? spokenTopicRaw.trim().slice(0, MAX_CONTEXT_TOPIC_LENGTH) || null
      : mode === 'justchatting' && typeof legacyGame === 'string'
        ? legacyGame.trim().slice(0, MAX_CONTEXT_TOPIC_LENGTH) || null
        : null;
    const personality = resolveAudiencePersonality(
      typeof formData.get('personality') === 'string' ? formData.get('personality') as string : null,
    );
    const voiceSessionId = formData.get('voiceSessionId');
    const segmentSequenceRaw = formData.get('segmentSequence');
    const segmentSequence = typeof segmentSequenceRaw === 'string' ? Number(segmentSequenceRaw) : NaN;
    const recentTurns = parseRecentTurns(formData.get('recentTurns'));

    if (!(audio instanceof File) || audio.size === 0) {
      return jsonResponse({ error: 'Falta el archivo de audio' }, 400);
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonResponse({ error: 'El audio excede el tamaño máximo permitido' }, 400);
    }

    if (!activeGame && !spokenTopic) {
      return jsonResponse({ error: 'Falta el juego o tema activo' }, 400);
    }

    if (typeof voiceSessionId !== 'string' || !isValidSessionId(voiceSessionId)) {
      return jsonResponse({ error: 'Sesión de voz inválida' }, 400);
    }

    if (!Number.isSafeInteger(segmentSequence) || segmentSequence < 0) {
      return jsonResponse({ error: 'Secuencia de voz inválida' }, 400);
    }

    const previousState = voiceSessions.get(userId);
    if (!previousState) {
      voiceSessions.set(userId, { sessionId: voiceSessionId, lastSequence: -1, retiredSessionIds: [] });
    } else if (previousState.sessionId !== voiceSessionId) {
      // Solo el primer segmento puede abrir una sesión nueva. Las sesiones retiradas
      // nunca pueden recuperar el estado aunque una respuesta antigua llegue tarde.
      if (segmentSequence !== 0 || previousState.retiredSessionIds.includes(voiceSessionId)) {
        return jsonResponse({ ok: true, skipped: true, reason: 'stale_segment' }, 200);
      }
      voiceSessions.set(userId, {
        sessionId: voiceSessionId,
        lastSequence: -1,
        retiredSessionIds: [...previousState.retiredSessionIds, previousState.sessionId].slice(-8),
      });
    }
    const state = voiceSessions.get(userId)!;
    if (state.sessionId !== voiceSessionId || segmentSequence <= state.lastSequence) {
      return jsonResponse({ ok: true, skipped: true, reason: 'stale_segment' }, 200);
    }
    // Límite específico de voz: no consumirlo con duplicados o segmentos atrasados.
    if (!checkVoiceRateLimit(userId)) {
      return jsonResponse({ error: 'Demasiados segmentos de voz, espera un momento' }, 429);
    }
    // Reservar la secuencia antes de esperar a Whisper evita duplicados concurrentes.
    state.lastSequence = segmentSequence;

    // Transcribir con Groq Whisper — si falla, fallo silencioso para no romper el ciclo del mic.
    let transcript: string;
    try {
      transcript = await transcribeAudio(audio);
    } catch (error) {
      console.error('[API] Error transcribiendo voz:', error);
      return jsonResponse({ ok: true, skipped: true, reason: 'transcription_failed' }, 200);
    }

    // Filtro anti-alucinación: en silencio Whisper inventa cosas como "Gracias.".
    if (transcript.length < MIN_TRANSCRIPT_LENGTH || !/[a-záéíóúñ]/i.test(transcript)) {
      return jsonResponse({ ok: true, skipped: true, reason: 'empty_transcript' }, 200);
    }

    const context: VoiceReactionContext = { activeGame, spokenTopic, recentTurns };
    // Las frases ancladas solo pertenecen al juego activo; serviceManager las ignora
    // cuando el análisis detecta que la frase cambió a otro tema.
    const gamePhrases = activeGame ? getPhrasesForGame(activeGame, personality) : null;
    const analysis = await generateVoiceReactions(transcript, context, mode, personality, gamePhrases);

    // Si el streamer detuvo o reinició el directo durante la llamada, no publicar la respuesta vieja.
    if (!isCurrentSession(userId, voiceSessionId, segmentSequence)) {
      return jsonResponse({ ok: true, skipped: true, reason: 'stale_segment' }, 200);
    }

    // El stream del dashboard puede haberse cerrado mientras terminaba la IA.
    if (!hasActiveStream(userId, 'dashboard')) {
      return jsonResponse({ ok: true, skipped: true, reason: 'stream_closed' }, 200);
    }

    const turn: VoiceTurn = {
      transcript: transcript.slice(0, MAX_CONTEXT_TRANSCRIPT_LENGTH),
      topic: analysis.topic,
      intent: analysis.intent,
      timestamp: Date.now(),
    };
    const contextTurns = [...recentTurns, turn].slice(-MAX_CONTEXT_TURNS);

    if (analysis.messages.length === 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: 'no_reactions',
        transcript,
        topic: analysis.topic,
        intent: analysis.intent,
        confidence: analysis.confidence,
        usesPreviousTopic: analysis.usesPreviousTopic,
        turn,
        context: contextTurns,
      }, 200);
    }

    // Crear cada ChatMessage una sola vez. Ambos SSE reciben exactamente estos IDs,
    // autores, timestamps y orden mediante waveManager.
    const messageTopic = analysis.topic ?? spokenTopic ?? activeGame ?? 'chat';
    const messages: ChatMessage[] = analysis.messages.map((content, index) => ({
      ...generateMessage(messageTopic, mode, personality),
      content,
      category: 'reactions',
      timestamp: Date.now() + index,
    }));
    enqueueVoiceWave(userId, messages);
    console.log(`[API] Oleada de voz encolada: ${messages.length} reacciones sobre "${analysis.topic ?? 'tema general'}" para "${transcript.slice(0, 60)}"`);

    return jsonResponse({
      ok: true,
      count: messages.length,
      transcript,
      topic: analysis.topic,
      intent: analysis.intent,
      confidence: analysis.confidence,
      usesPreviousTopic: analysis.usesPreviousTopic,
      turn,
      context: contextTurns,
    }, 200);
  } catch (error) {
    console.error('[API] Error en voice-react:', error);
    return jsonResponse({ error: 'Error interno' }, 500);
  }
};
