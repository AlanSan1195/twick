import type { APIRoute } from 'astro';
import type { StreamMode, VoiceReactResponse } from '../../utils/types';
import { resolveAudiencePersonality } from '../../utils/types';
import { transcribeAudio } from '../../lib/ai/services/groq';
import { generateVoiceReactions } from '../../lib/ai/serviceManager';
import { getPhrasesForGame } from '../../lib/phraseCache';
import { enqueueVoiceWave } from '../../lib/waveManager';
import { hasActiveStream, checkVoiceRateLimit } from '../../lib/rateLimiter';
import { resolveSessionUserId } from '../../lib/devAuth';

/** Tamaño máximo del audio (~1.5MB, de sobra para 10s de opus/aac) */
const MAX_AUDIO_BYTES = 1_500_000;

/** Longitud mínima de transcripción para considerarla útil */
const MIN_TRANSCRIPT_LENGTH = 6;

function jsonResponse(body: VoiceReactResponse | { error: string }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = resolveSessionUserId(locals, request);

    if (!userId) {
      return jsonResponse({ error: 'No autenticado' }, 401);
    }

    // El usuario debe tener un stream SSE activo al que enviar las reacciones
    if (!hasActiveStream(userId)) {
      return jsonResponse({ error: 'No hay stream activo para este usuario' }, 400);
    }

    // Límite específico de voz: el endpoint llama a la IA dos veces
    if (!checkVoiceRateLimit(userId)) {
      return jsonResponse({ error: 'Demasiados segmentos de voz, espera un momento' }, 429);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonResponse({ error: 'Se esperaba un body multipart/form-data' }, 400);
    }

    const audio = formData.get('audio');
    const game = formData.get('game');
    const personality = resolveAudiencePersonality(
      typeof formData.get('personality') === 'string' ? (formData.get('personality') as string) : null
    );
    const modeRaw = formData.get('mode');
    const mode: StreamMode = modeRaw === 'justchatting' ? 'justchatting' : 'game';

    if (!(audio instanceof File) || audio.size === 0) {
      return jsonResponse({ error: 'Falta el archivo de audio' }, 400);
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonResponse({ error: 'El audio excede el tamaño máximo permitido' }, 400);
    }

    if (typeof game !== 'string' || game.trim().length === 0) {
      return jsonResponse({ error: 'Falta el nombre del juego o tema' }, 400);
    }

    // Transcribir con Groq Whisper — si falla, fallo silencioso para no romper el ciclo del mic
    let transcript: string;
    try {
      transcript = await transcribeAudio(audio);
    } catch (error) {
      console.error('[API] Error transcribiendo voz:', error);
      return jsonResponse({ ok: true, skipped: true, reason: 'transcription_failed' }, 200);
    }

    // Filtro anti-alucinación: en silencio Whisper inventa cosas como "Gracias." o "Subtítulos por..."
    if (transcript.length < MIN_TRANSCRIPT_LENGTH || !/[a-záéíóúñ]/i.test(transcript)) {
      return jsonResponse({ ok: true, skipped: true, reason: 'empty_transcript' }, 200);
    }

    // Frases reales cacheadas del juego — anclan las reacciones a su contexto auténtico
    const gamePhrases = getPhrasesForGame(game.trim(), personality);
    const phrases = await generateVoiceReactions(transcript, game.trim(), mode, personality, gamePhrases);

    if (phrases.length === 0) {
      return jsonResponse({ ok: true, skipped: true, reason: 'no_reactions', transcript }, 200);
    }

    enqueueVoiceWave(userId, phrases);
    console.log(`[API] Oleada de voz encolada: ${phrases.length} reacciones para "${transcript.slice(0, 60)}"`);

    return jsonResponse({ ok: true, count: phrases.length, transcript }, 200);
  } catch (error) {
    console.error('[API] Error en voice-react:', error);
    return jsonResponse({ error: 'Error interno' }, 500);
  }
};
