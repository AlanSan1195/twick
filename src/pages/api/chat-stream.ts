import type { APIRoute } from 'astro';
import { generateMessage, getRandomInterval } from '../../lib/chatGenerator';
import { acquireStream, releaseStream, SSE_MAX_CONCURRENT } from '../../lib/rateLimiter';
import type { StreamMode } from '../../utils/types';

const INTERVAL_MIN_BOUND = 500;
const INTERVAL_MAX_BOUND = 30_000;
const HEARTBEAT_INTERVAL = 30_000;

/** Duracion maxima de un stream SSE (2 horas) */
const MAX_STREAM_DURATION = 2 * 60 * 60 * 1000;

export const GET: APIRoute = async ({ request, url, locals }) => {
  // Obtener userId de Clerk (la ruta ya esta protegida por auth middleware)
  const auth = locals.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const gameName = url.searchParams.get('game');
  const mode = (url.searchParams.get('mode') ?? 'game') as StreamMode;

  if (!gameName || gameName.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid game parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar limite de conexiones SSE concurrentes
  if (!acquireStream(userId)) {
    return new Response(
      JSON.stringify({
        error: `Limite de ${SSE_MAX_CONCURRENT} streams concurrentes alcanzado`,
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rawMin = Number(url.searchParams.get('min'));
  const rawMax = Number(url.searchParams.get('max'));
  const intervalMin = Number.isFinite(rawMin) && rawMin >= INTERVAL_MIN_BOUND ? rawMin : 2000;
  const intervalMax = Number.isFinite(rawMax) && rawMax <= INTERVAL_MAX_BOUND && rawMax > intervalMin ? rawMax : 4000;

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
          // Enviar evento de error al cliente y cerrar limpiamente
          try {
            const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'Error generando mensaje' })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          } catch {
            // Stream ya cerrado
          }
        }
      };

      // Heartbeat: comentario SSE cada 30s para mantener viva la conexion
      // contra proxies y balanceadores que cortan conexiones idle
      const heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // El stream ya fue cerrado, ignorar
        }
      }, HEARTBEAT_INTERVAL);

      const scheduleNext = () => {
        const interval = getRandomInterval(intervalMin, intervalMax);
        return setTimeout(() => {
          sendMessage();
          timeoutId = scheduleNext();
        }, interval);
      };

      let timeoutId = scheduleNext();

      // Timeout maximo del stream (2h) para evitar conexiones eternas
      const maxDurationId = setTimeout(() => {
        clearTimeout(timeoutId);
        clearInterval(heartbeatId);
        releaseStream(userId);
        try {
          const closeEvent = `data: ${JSON.stringify({ type: 'stream-end', message: 'Duracion maxima alcanzada' })}\n\n`;
          controller.enqueue(encoder.encode(closeEvent));
          controller.close();
        } catch {
          // Stream ya cerrado
        }
      }, MAX_STREAM_DURATION);

      // Cleanup al desconectar el cliente
      request.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        clearTimeout(maxDurationId);
        clearInterval(heartbeatId);
        releaseStream(userId);
        controller.close();
      });
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
