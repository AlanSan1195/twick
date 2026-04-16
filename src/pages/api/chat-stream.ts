import type { APIRoute } from 'astro';
import { generateMessage, getRandomInterval } from '../../lib/chatGenerator';
import { registerStream, unregisterStream } from '../../lib/rateLimiter';
import { hasActiveWave, getNextWavePhrase, clearWaves } from '../../lib/waveManager';
import { validateOverlayToken } from '../../lib/overlayTokens';
import type { StreamMode, StreamSource } from '../../utils/types';

const INTERVAL_MIN_BOUND = 500;
const INTERVAL_MAX_BOUND = 30_000;
const HEARTBEAT_INTERVAL = 30_000;

/** Duracion maxima de un stream SSE (2 horas) */
const MAX_STREAM_DURATION = 2 * 60 * 60 * 1000;

/**
 * Resuelve el userId desde Clerk o desde un token de overlay.
 * Devuelve [userId, source] o null si no se puede autenticar.
 */
function resolveAuth(
  locals: App.Locals,
  url: URL,
): { userId: string; source: StreamSource } | null {
  // 1. Intentar auth con token de overlay (query param)
  const token = url.searchParams.get('token');
  if (token) {
    const tokenUserId = validateOverlayToken(token);
    if (tokenUserId) {
      return { userId: tokenUserId, source: 'overlay' };
    }
    // Token inválido — no intentar Clerk, fallar directamente
    return null;
  }

  // 2. Auth con Clerk (sesión del dashboard)
  const auth = locals.auth?.();
  const clerkUserId = auth?.userId;
  if (clerkUserId) {
    const source = (url.searchParams.get('source') as StreamSource) ?? 'dashboard';
    return { userId: clerkUserId, source };
  }

  return null;
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const authResult = resolveAuth(locals, url);

  if (!authResult) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { userId, source } = authResult;

  const gameName = url.searchParams.get('game');
  const mode = (url.searchParams.get('mode') ?? 'game') as StreamMode;

  if (!gameName || gameName.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid game parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rawMin = Number(url.searchParams.get('min'));
  const rawMax = Number(url.searchParams.get('max'));
  const intervalMin = Number.isFinite(rawMin) && rawMin >= INTERVAL_MIN_BOUND ? rawMin : 2000;
  const intervalMax = Number.isFinite(rawMax) && rawMax <= INTERVAL_MAX_BOUND && rawMax > intervalMin ? rawMax : 4000;

  // Registrar el stream con source: si el usuario ya tenía uno abierto
  // del mismo source (otra pestaña), se cancela automáticamente.
  const streamController = registerStream(userId, source);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendMessage = () => {
        try {
          const message = generateMessage(gameName, mode);
          const data = `data: ${JSON.stringify(message)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          console.error('Error generando mensaje:', error);
          try {
            const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'Error generando mensaje' })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          } catch {
            // Stream ya cerrado
          }
        }
      };

      const sendWaveMessage = (phrase: string) => {
        try {
          const message = generateMessage(gameName, mode);
          const waveMessage = { ...message, content: phrase, category: 'reactions' as const };
          const data = `data: ${JSON.stringify(waveMessage)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream ya cerrado, ignorar
        }
      };

      // Heartbeat cada 30s para mantener viva la conexion contra proxies
      const heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // Stream ya cerrado, ignorar
        }
      }, HEARTBEAT_INTERVAL);

      const scheduleNext = (): ReturnType<typeof setTimeout> => {
        if (hasActiveWave(userId, source)) {
          const phrase = getNextWavePhrase(userId, source);
          if (phrase) sendWaveMessage(phrase);
          return setTimeout(scheduleNext, getRandomInterval(180, 350));
        }
        const interval = getRandomInterval(intervalMin, intervalMax);
        return setTimeout(() => {
          sendMessage();
          timeoutId = scheduleNext();
        }, interval);
      };

      let timeoutId = scheduleNext();

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearTimeout(maxDurationId);
        clearInterval(heartbeatId);
        clearWaves(userId, source);
        unregisterStream(userId, source, streamController);
        try { controller.close(); } catch { /* ya cerrado */ }
      };

      // Timeout maximo del stream (2h)
      const maxDurationId = setTimeout(() => {
        try {
          const closeEvent = `data: ${JSON.stringify({ type: 'stream-end', message: 'Duracion maxima alcanzada' })}\n\n`;
          controller.enqueue(encoder.encode(closeEvent));
        } catch { /* ignorar */ }
        cleanup();
      }, MAX_STREAM_DURATION);

      // El cliente cierra la pestaña o hace Stop
      request.signal.addEventListener('abort', cleanup);

      // El servidor cancela este stream porque llegó uno nuevo del mismo source
      streamController.signal.addEventListener('abort', cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
};
