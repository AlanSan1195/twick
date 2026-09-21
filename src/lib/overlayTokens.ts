import { getOverlayState, updateOverlayState } from './overlayPersistence';

// ============================================
// TOKENS DE OVERLAY — autenticación para OBS Browser Source
// ============================================

/** Tiempo de vida de un token de overlay (24 horas) */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Intervalo de limpieza de tokens expirados (30 min) */
const CLEANUP_INTERVAL = 30 * 60 * 1000;

function isExpired(createdAt: number): boolean {
  return Date.now() - createdAt >= TOKEN_TTL_MS;
}

function removeExpiredTokens(): void {
  const current = getOverlayState();
  let changed = false;
  for (const [token, entry] of Object.entries(current.tokens)) {
    if (isExpired(entry.createdAt)) {
      delete current.tokens[token];
      if (current.userTokens[entry.userId] === token) delete current.userTokens[entry.userId];
      changed = true;
    }
  }
  if (changed) updateOverlayState(() => current);
}

/** Genera un token y revoca el token previo del usuario. */
export function generateOverlayToken(userId: string): string {
  const token = crypto.randomUUID();
  updateOverlayState((current) => {
    const previousToken = current.userTokens[userId];
    if (previousToken) delete current.tokens[previousToken];
    current.tokens[token] = { userId, createdAt: Date.now() };
    current.userTokens[userId] = token;
    return current;
  });
  console.log(`[Overlay] Token generado para usuario ${userId}`);
  return token;
}

/** Valida un token de overlay y devuelve el userId asociado. */
export function validateOverlayToken(token: string): string | null {
  const current = getOverlayState();
  const entry = current.tokens[token];
  if (!entry) return null;
  if (isExpired(entry.createdAt)) {
    delete current.tokens[token];
    if (current.userTokens[entry.userId] === token) delete current.userTokens[entry.userId];
    updateOverlayState(() => current);
    console.log(`[Overlay] Token expirado para usuario ${entry.userId}`);
    return null;
  }
  return entry.userId;
}

/** Revoca el token activo de un usuario. */
export function revokeOverlayToken(userId: string): boolean {
  const current = getOverlayState();
  const token = current.userTokens[userId];
  if (!token) return false;
  delete current.tokens[token];
  delete current.userTokens[userId];
  updateOverlayState(() => current);
  console.log(`[Overlay] Token revocado para usuario ${userId}`);
  return true;
}

/** Verifica si un usuario tiene un token activo (no expirado). */
export function hasActiveToken(userId: string): boolean {
  return getActiveToken(userId) !== null;
}

/** Obtiene el token activo de un usuario (si existe y no ha expirado). */
export function getActiveToken(userId: string): string | null {
  const current = getOverlayState();
  const token = current.userTokens[userId];
  if (!token) return null;
  return validateOverlayToken(token) === null ? null : token;
}

function cleanup(): void {
  removeExpiredTokens();
}

if (typeof globalThis.setInterval === 'function') {
  const cleanupId = setInterval(cleanup, CLEANUP_INTERVAL);
  if (typeof cleanupId === 'object' && 'unref' in cleanupId) cleanupId.unref();
}
