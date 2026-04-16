import type { StreamSource } from '../utils/types';

// ============================================
// RATE LIMITER — ventana deslizante en memoria
// ============================================
//
// Dos mecanismos independientes:
// 1. Rate limit por IP: limita requests/ventana a cualquier ruta protegida
// 2. Streams SSE por usuario: dashboard y overlay pueden coexistir

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
// 2. STREAMS SSE POR USUARIO (dashboard + overlay)
// ============================================
//
// Cada usuario puede tener hasta 2 streams SSE simultáneos:
// uno desde el dashboard y otro desde el overlay de OBS.
// Si llega una nueva conexión del mismo source, el stream anterior
// de ese source se cancela automáticamente.
// Las keys son compuestas: "userId:dashboard" o "userId:overlay".

const activeControllers = new Map<string, AbortController>();

/** Construye la key compuesta para el mapa de controllers */
function streamKey(userId: string, source: StreamSource): string {
  return `${userId}:${source}`;
}

/**
 * Registra un nuevo stream SSE para un usuario y source.
 * Si ya existía uno activo del mismo source, lo cancela primero.
 * Devuelve el AbortController que el stream debe usar para su cleanup.
 */
export function registerStream(userId: string, source: StreamSource = 'dashboard'): AbortController {
  const key = streamKey(userId, source);

  // Cancelar el stream anterior del mismo source si existe
  activeControllers.get(key)?.abort();

  const controller = new AbortController();
  activeControllers.set(key, controller);
  return controller;
}

/**
 * Elimina el registro del stream cuando termina.
 * Solo borra si el controller coincide con el registrado actualmente
 * (evita borrar el de un stream más nuevo que ya lo reemplazó).
 */
export function unregisterStream(userId: string, source: StreamSource, controller: AbortController): void {
  const key = streamKey(userId, source);
  if (activeControllers.get(key) === controller) {
    activeControllers.delete(key);
  }
}

/**
 * Devuelve true si el usuario tiene al menos un stream SSE activo
 * (dashboard, overlay o ambos).
 * Usado por chat-wave para validar que hay un stream al que enviar oleadas.
 */
export function hasActiveStream(userId: string): boolean {
  return activeControllers.has(streamKey(userId, 'dashboard'))
    || activeControllers.has(streamKey(userId, 'overlay'));
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
