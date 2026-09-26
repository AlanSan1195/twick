import type { APIRoute } from 'astro';
import { generateMessage, getRandomInterval, generateInitialGreetings } from '../../lib/chatGenerator';
import { registerStream, unregisterStream } from '../../lib/rateLimiter';
import {
  hasActiveWave,
  getNextWavePhrase,
  clearWaves,
  subscribeWaveWake,
} from '../../lib/waveManager';
import { validateOverlayToken } from '../../lib/overlayTokens';
import {
  resolveInitialOverlayVisualConfig,
  getStoredOverlayVisualConfig,
  subscribeOverlayVisualConfig,
} from '../../lib/overlayVisualConfig';
import { resolveSessionUserId } from '../../lib/devAuth';
import type { ChatMessage, StreamMode, StreamSource } from '../../utils/types';
import { resolveAudiencePersonality } from '../../utils/types';
import { getSevenTvCatalogSnapshot } from '../../lib/sevenTv/catalog';
import { prepareChatMessage } from '../../lib/chatRealism';
import { selectSevenTvEmotes, type SevenTvSelectionState } from '../../lib/sevenTv/selector';

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
  request: Request,
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

  // 2. Auth con Clerk o sesión local de desarrollo
  const sessionUserId = resolveSessionUserId(locals, request);
  if (sessionUserId) {
    const source = (url.searchParams.get('source') as StreamSource) ?? 'dashboard';
    return { userId: sessionUserId, source };
  }

  return null;
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const authResult = resolveAuth(locals, request, url);

  if (!authResult) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { userId, source } = authResult;

  const gameName = url.searchParams.get('game');
  const mode = (url.searchParams.get('mode') ?? 'game') as StreamMode;
  const personality = resolveAudiencePersonality(url.searchParams.get('personality'));
  const enableGreetings = url.searchParams.get('greetings') !== 'false';
  const initialVisualConfig = getStoredOverlayVisualConfig(userId)
    ?? resolveInitialOverlayVisualConfig(url.searchParams);

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
      let unsubscribeVisualConfig: (() => void) | null = null;
      let sevenTvSelectionState: SevenTvSelectionState = {
        recentIds: [],
      };

      const withChatRealism = (message: ChatMessage): ChatMessage => {
        const prepared = prepareChatMessage(message, Math.random);
        if (prepared.decoration !== 'sevenTv') return prepared.message;

        const selection = selectSevenTvEmotes(
          prepared.message, getSevenTvCatalogSnapshot(), sevenTvSelectionState, Math.random,
        );
        sevenTvSelectionState = selection.nextState;
        return { ...prepared.message, emotes: selection.emotes };
      };

      const sendVisualConfig = (config: typeof initialVisualConfig) => {
        try {
          controller.enqueue(encoder.encode(`event: visual-config\ndata: ${JSON.stringify(config)}\n\n`));
        } catch {
          // El overlay pudo cerrar la conexión mientras se enviaba el cambio.
        }
      };

      if (source === 'overlay') {
        sendVisualConfig(initialVisualConfig);
        unsubscribeVisualConfig = subscribeOverlayVisualConfig(userId, sendVisualConfig);
      }

      // Enviar mensajes de saludo iniciales al iniciar el stream (si está habilitado)
      const initialGreetings = enableGreetings
        ? generateInitialGreetings(gameName, personality).map(withChatRealism)
        : [];
      for (const greeting of initialGreetings) {
        try {
          const data = `data: ${JSON.stringify(greeting)}\n\n`;
          controller.enqueue(encoder.encode(data));
          await new Promise(resolve => setTimeout(resolve, getRandomInterval(800, 1600)));
        } catch {
          // Stream cerrado, salir
          unsubscribeVisualConfig?.();
          unsubscribeVisualConfig = null;
          return;
        }
      }

      const sendMessage = (): boolean => {
        try {
          const message = withChatRealism(generateMessage(gameName, mode, personality));
          const data = `data: ${JSON.stringify(message)}\n\n`;
          controller.enqueue(encoder.encode(data));
          return true;
        } catch (error) {
          console.error('Error generando mensaje:', error);
          try {
            const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'Error generando mensaje' })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
            return true;
          } catch {
            return false;
          }
        }
      };

      const sendWaveMessage = (phrase: string): boolean => {
        try {
          const message = generateMessage(gameName, mode, personality);
          const waveMessage = withChatRealism({ ...message, content: phrase, category: 'reactions' as const });
          const data = `data: ${JSON.stringify(waveMessage)}\n\n`;
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          return false;
        }
      };

      const sendPrebuiltWaveMessage = (message: ChatMessage): boolean => {
        try {
          // Los mensajes de voz ya se construyeron una sola vez en voice-react.
          // Conservarlos intactos mantiene el mismo ID, autor y texto en dashboard y overlay.
          const data = `data: ${JSON.stringify(message)}\n\n`;
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          return false;
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

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let isClosed = false;

      const scheduleNext = (delay: number) => {
        if (isClosed) return;

        timeoutId = setTimeout(() => {
          if (isClosed) return;

          if (hasActiveWave(userId, source)) {
            const waveItem = getNextWavePhrase(userId, source);

            if (typeof waveItem === 'string') {
              if (!sendWaveMessage(waveItem)) {
                cleanup();
                return;
              }
              scheduleNext(getRandomInterval(180, 350));
              return;
            }

            if (waveItem) {
              if (!sendPrebuiltWaveMessage(waveItem)) {
                cleanup();
                return;
              }
              scheduleNext(getRandomInterval(600, 1200));
              return;
            }
          } else {
            if (!sendMessage()) {
              cleanup();
              return;
            }
          }

          scheduleNext(getRandomInterval(intervalMin, intervalMax));
        }, delay);
      };

      scheduleNext(getRandomInterval(intervalMin, intervalMax));
      const unsubscribeWaveWake = subscribeWaveWake(userId, source, () => {
        if (isClosed) return;
        if (timeoutId) clearTimeout(timeoutId);
        scheduleNext(0);
      });

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (timeoutId) clearTimeout(timeoutId);
        clearTimeout(maxDurationId);
        clearInterval(heartbeatId);
        clearWaves(userId, source);
        unsubscribeWaveWake();
        unsubscribeVisualConfig?.();
        unsubscribeVisualConfig = null;
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
