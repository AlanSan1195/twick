import type { APIRoute } from 'astro';
import {
  generateOverlayToken,
  revokeOverlayToken,
  getActiveToken,
} from '../../lib/overlayTokens';

/**
 * POST /api/overlay-token — Genera un token de overlay para el usuario autenticado.
 * Si ya tenía un token activo, lo reemplaza.
 */
export const POST: APIRoute = async ({ locals }) => {
  const auth = locals.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = generateOverlayToken(userId);

  return new Response(
    JSON.stringify({ token }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

/**
 * GET /api/overlay-token — Obtiene el token activo del usuario (si existe).
 */
export const GET: APIRoute = async ({ locals }) => {
  const auth = locals.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = getActiveToken(userId);

  return new Response(
    JSON.stringify({ token }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

/**
 * DELETE /api/overlay-token — Revoca el token activo del usuario.
 */
export const DELETE: APIRoute = async ({ locals }) => {
  const auth = locals.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'No autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const revoked = revokeOverlayToken(userId);

  return new Response(
    JSON.stringify({ revoked }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
