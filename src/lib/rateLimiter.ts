// ============================================
// RATE LIMITER — ventana deslizante en memoria
// ============================================
//
// Dos mecanismos independientes:
// 1. Rate limit por IP: limita requests/ventana a cualquier ruta protegida
// 2. Conexiones SSE concurrentes por userId: limita streams abiertos simultaneos

// ============================================
// 1. RATE LIMIT POR IP (ventana deslizante)
// ============================================

interface RateLimitEntry {
  timestamps: number[];
}

const ipRateLimits = new Map<string, RateLimitEntry>();

/** Intervalo de limpieza de entradas expiradas (5 min) */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/** Ventana de tiempo para contar requests (1 min) */
const WINDOW_MS = 60 * 1000;

/** Maximo de requests por IP dentro de la ventana */
const MAX_REQUESTS_PER_WINDOW = 60;

/**
 * Verifica si una IP puede hacer un request.
 * Retorna `true` si esta permitido, `false` si excede el limite.
 */
export function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry) {
    ipRateLimits.set(ip, { timestamps: [now] });
    return true;
  }

  // Filtrar timestamps fuera de la ventana
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
  entry.timestamps.push(now);

  return entry.timestamps.length <= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Obtiene cuantos requests quedan para una IP en la ventana actual.
 */
export function getRemainingRequests(ip: string): number {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry) return MAX_REQUESTS_PER_WINDOW;

  const active = entry.timestamps.filter((t) => now - t < WINDOW_MS);
  return Math.max(0, MAX_REQUESTS_PER_WINDOW - active.length);
}

// ============================================
// 2. CONEXIONES SSE CONCURRENTES POR USUARIO
// ============================================

/** Maximo de streams SSE abiertos por usuario */
const MAX_CONCURRENT_STREAMS = 3;

/** userId -> cantidad de conexiones activas */
const activeStreams = new Map<string, number>();

/**
 * Intenta registrar una nueva conexion SSE para un usuario.
 * Retorna `true` si se permite, `false` si excede el limite.
 */
export function acquireStream(userId: string): boolean {
  const current = activeStreams.get(userId) ?? 0;

  if (current >= MAX_CONCURRENT_STREAMS) {
    return false;
  }

  activeStreams.set(userId, current + 1);
  return true;
}

/**
 * Libera una conexion SSE cuando el cliente se desconecta.
 * Debe llamarse siempre en el cleanup del stream.
 */
export function releaseStream(userId: string): void {
  const current = activeStreams.get(userId) ?? 0;
  const next = current - 1;

  if (next <= 0) {
    activeStreams.delete(userId);
  } else {
    activeStreams.set(userId, next);
  }
}

/**
 * Obtiene la cantidad de streams activos de un usuario.
 */
export function getActiveStreamCount(userId: string): number {
  return activeStreams.get(userId) ?? 0;
}

// ============================================
// LIMPIEZA PERIODICA
// ============================================

/**
 * Elimina entradas expiradas del rate limiter de IPs.
 * Se ejecuta automaticamente cada CLEANUP_INTERVAL.
 */
function cleanup(): void {
  const now = Date.now();

  for (const [ip, entry] of ipRateLimits) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (entry.timestamps.length === 0) {
      ipRateLimits.delete(ip);
    }
  }
}

// Ejecutar limpieza periodica solo en server (no en build)
if (typeof globalThis.setInterval === 'function') {
  const cleanupId = setInterval(cleanup, CLEANUP_INTERVAL);
  // Permitir que el proceso termine sin esperar al intervalo
  if (typeof cleanupId === 'object' && 'unref' in cleanupId) {
    cleanupId.unref();
  }
}

// ============================================
// CONSTANTES EXPORTADAS (para headers)
// ============================================

export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;
export const RATE_LIMIT_MAX_REQUESTS = MAX_REQUESTS_PER_WINDOW;
export const SSE_MAX_CONCURRENT = MAX_CONCURRENT_STREAMS;
