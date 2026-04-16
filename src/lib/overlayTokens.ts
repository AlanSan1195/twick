// ============================================
// TOKENS DE OVERLAY — autenticación para OBS Browser Source
// ============================================
//
// OBS no tiene sesión de Clerk, así que el overlay se autentica
// mediante un token temporal generado desde el dashboard.
// Cada usuario puede tener como máximo 1 token activo.
// Los tokens expiran tras 24 horas.

/** Tiempo de vida de un token de overlay (24 horas) */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Intervalo de limpieza de tokens expirados (30 min) */
const CLEANUP_INTERVAL = 30 * 60 * 1000;

interface OverlayTokenEntry {
  userId: string;
  createdAt: number;
}

/** Mapa token → datos del usuario */
const tokenStore = new Map<string, OverlayTokenEntry>();

/** Mapa userId → token activo (para revocar al generar uno nuevo) */
const userTokenIndex = new Map<string, string>();

// ============================================
// Generador de tokens (crypto.randomUUID)
// ============================================

/**
 * Genera un nuevo token de overlay para el usuario.
 * Si el usuario ya tenía un token, lo revoca antes de crear uno nuevo.
 */
export function generateOverlayToken(userId: string): string {
  // Revocar token anterior si existe
  const previousToken = userTokenIndex.get(userId);
  if (previousToken) {
    tokenStore.delete(previousToken);
  }

  const token = crypto.randomUUID();

  tokenStore.set(token, {
    userId,
    createdAt: Date.now(),
  });
  userTokenIndex.set(userId, token);

  console.log(`[Overlay] Token generado para usuario ${userId}`);
  return token;
}

/**
 * Valida un token de overlay.
 * Devuelve el userId asociado o null si el token es inválido/expirado.
 */
export function validateOverlayToken(token: string): string | null {
  const entry = tokenStore.get(token);
  if (!entry) return null;

  // Verificar expiración
  if (Date.now() - entry.createdAt >= TOKEN_TTL_MS) {
    tokenStore.delete(token);
    userTokenIndex.delete(entry.userId);
    console.log(`[Overlay] Token expirado para usuario ${entry.userId}`);
    return null;
  }

  return entry.userId;
}

/**
 * Revoca el token activo de un usuario.
 */
export function revokeOverlayToken(userId: string): boolean {
  const token = userTokenIndex.get(userId);
  if (!token) return false;

  tokenStore.delete(token);
  userTokenIndex.delete(userId);
  console.log(`[Overlay] Token revocado para usuario ${userId}`);
  return true;
}

/**
 * Verifica si un usuario tiene un token activo (no expirado).
 */
export function hasActiveToken(userId: string): boolean {
  const token = userTokenIndex.get(userId);
  if (!token) return false;

  // Verificar que no haya expirado
  const entry = tokenStore.get(token);
  if (!entry || Date.now() - entry.createdAt >= TOKEN_TTL_MS) {
    tokenStore.delete(token);
    userTokenIndex.delete(userId);
    return false;
  }

  return true;
}

/**
 * Obtiene el token activo de un usuario (si existe y no ha expirado).
 */
export function getActiveToken(userId: string): string | null {
  const token = userTokenIndex.get(userId);
  if (!token) return null;

  // Verificar que no haya expirado
  if (validateOverlayToken(token) === null) return null;

  return token;
}

// ============================================
// LIMPIEZA PERIÓDICA
// ============================================

function cleanup(): void {
  const now = Date.now();

  for (const [token, entry] of tokenStore) {
    if (now - entry.createdAt >= TOKEN_TTL_MS) {
      tokenStore.delete(token);
      userTokenIndex.delete(entry.userId);
    }
  }
}

// Ejecutar limpieza periódica solo en server
if (typeof globalThis.setInterval === 'function') {
  const cleanupId = setInterval(cleanup, CLEANUP_INTERVAL);
  if (typeof cleanupId === 'object' && 'unref' in cleanupId) {
    cleanupId.unref();
  }
}
