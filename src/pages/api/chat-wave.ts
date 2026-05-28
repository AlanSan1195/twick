import type { APIRoute } from 'astro';
import type { WaveType } from '../../utils/types';
import { enqueueWave } from '../../lib/waveManager';
import { hasActiveStream } from '../../lib/rateLimiter';
import { resolveSessionUserId } from '../../lib/devAuth';

const VALID_WAVE_TYPES: WaveType[] = ['laugh', 'hype', 'fear', 'omg'];

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = resolveSessionUserId(locals, request);

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // El usuario debe tener un stream SSE activo
  if (!hasActiveStream(userId)) {
    return new Response(
      JSON.stringify({ error: 'No hay stream activo para este usuario' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Body JSON invalido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const type = (body as Record<string, unknown>)?.type as WaveType;

  if (!VALID_WAVE_TYPES.includes(type)) {
    return new Response(
      JSON.stringify({ error: `Tipo de oleada invalido. Valores aceptados: ${VALID_WAVE_TYPES.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  enqueueWave(userId, type);

  return new Response(
    JSON.stringify({ ok: true, type }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
