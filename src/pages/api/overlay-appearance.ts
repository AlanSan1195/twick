import type { APIRoute } from 'astro';
import { resolveSessionUserId } from '../../lib/devAuth';
import {
  getStoredOverlayVisualConfig,
  saveOverlayVisualConfig,
} from '../../lib/overlayVisualConfig';
import {
  isOverlayVisualConfigInput,
  normalizeOverlayVisualConfig,
} from '../../utils/types';

const jsonHeaders = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ request, locals }) => {
  const userId = resolveSessionUserId(locals, request);
  if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: jsonHeaders });

  try {
    return new Response(JSON.stringify({ config: getStoredOverlayVisualConfig(userId) }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[Overlay] Error leyendo apariencia:', error);
    return new Response(JSON.stringify({ error: 'No se pudo leer la apariencia' }), { status: 500, headers: jsonHeaders });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const userId = resolveSessionUserId(locals, request);
  if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: jsonHeaders });

  try {
    // request.json devuelve unknown intencionalmente; el type guard limita la entrada antes de normalizarla.
    const body: unknown = await request.json();
    if (!isOverlayVisualConfigInput(body)) {
      return new Response(JSON.stringify({ error: 'Configuración inválida' }), { status: 400, headers: jsonHeaders });
    }

    const config = saveOverlayVisualConfig(userId, normalizeOverlayVisualConfig(body));
    return new Response(JSON.stringify({ config }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error('[Overlay] Error guardando apariencia:', error);
    return new Response(JSON.stringify({ error: 'No se pudo guardar la apariencia' }), { status: 500, headers: jsonHeaders });
  }
};

