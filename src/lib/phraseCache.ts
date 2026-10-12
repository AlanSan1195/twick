import type { AudiencePersonality, MessagePattern } from '../utils/types';
import { DEFAULT_AUDIENCE_PERSONALITY } from '../utils/types';
import { MESSAGE_PATTERNS } from './messagePatterns';

// ============================================
// CACHE DE FRASES POR JUEGO
// ============================================

interface CachedGame {
  phrases: MessagePattern;
  generatedAt: number;
  generatedBy: string;
  personality: AudiencePersonality;
}

// Cache global de frases por juego y personalidad (normalizado a minúsculas)
const phrasesCache = new Map<string, CachedGame>();

/**
 * Normaliza el nombre del juego para usar como key
 */
export function normalizeGameName(gameName: string): string {
  return gameName.toLowerCase().trim();
}

function getPhraseCacheKey(gameName: string, personality: AudiencePersonality): string {
  return `${normalizeGameName(gameName)}::${personality}`;
}

/**
 * Obtiene las frases de un juego del cache
 */
export function getCachedPhrases(
  gameName: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): MessagePattern | null {
  const key = getPhraseCacheKey(gameName, personality);
  const cached = phrasesCache.get(key);
  return cached?.phrases || null;
}

/**
 * Guarda frases de un juego en el cache
 */
export function setCachedPhrases(
  gameName: string,
  phrases: MessagePattern,
  userId: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): void {
  const key = getPhraseCacheKey(gameName, personality);
  phrasesCache.set(key, {
    phrases,
    generatedAt: Date.now(),
    generatedBy: userId,
    personality,
  });
}

/**
 * Verifica si un juego existe en el cache
 */
export function hasGameInCache(
  gameName: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): boolean {
  return phrasesCache.has(getPhraseCacheKey(gameName, personality));
}

// ============================================
// LÍMITE DE JUEGOS POR USUARIO
// ============================================

const MAX_GAMES_PER_USER = 4;
const USER_GAMES_TTL_MS = 48 * 60 * 60 * 1000; // 48 horas

interface UserGames {
  games: string[]; // Nombres de juegos (normalizados)
  createdAt: number;
}

// Cache de juegos por usuario
const userGamesCache = new Map<string, UserGames>();
const userGameReservations = new Map<string, Map<string, number>>();

export interface UserGameReservation {
  userId: string;
  gameName: string;
  active: boolean;
}

/**
 * Purga la entrada del usuario si han pasado más de 48 horas desde su primer juego
 */
function purgeIfExpired(userId: string): void {
  const userGames = userGamesCache.get(userId);
  if (userGames && Date.now() - userGames.createdAt >= USER_GAMES_TTL_MS) {
    userGamesCache.delete(userId);
    console.log(`[Cache] Slots de usuario ${userId} reseteados por expiración (48h)`);
  }
}

/**
 * Obtiene los juegos de un usuario
 */
export function getUserGames(userId: string): string[] {
  purgeIfExpired(userId);
  return userGamesCache.get(userId)?.games || [];
}

/**
 * Verifica si el usuario puede agregar más juegos
 */
export function canUserAddGame(userId: string): boolean {
  const userGames = getUserGames(userId);
  return userGames.length + getReservedGameCount(userId) < MAX_GAMES_PER_USER;
}

function getReservedGameCount(userId: string): number {
  return userGameReservations.get(userId)?.size ?? 0;
}

/** Reserva de forma síncrona un slot para solicitudes concurrentes. */
export function reserveUserGameSlot(userId: string, gameName: string): UserGameReservation | null {
  purgeIfExpired(userId);
  const normalizedName = normalizeGameName(gameName);
  const userGames = userGamesCache.get(userId);

  if (userGames?.games.includes(normalizedName)) {
    return { userId, gameName: normalizedName, active: false };
  }

  let reservations = userGameReservations.get(userId);
  const existingCount = reservations?.get(normalizedName);
  if (existingCount !== undefined) {
    reservations?.set(normalizedName, existingCount + 1);
    return { userId, gameName: normalizedName, active: true };
  }

  if ((userGames?.games.length ?? 0) + getReservedGameCount(userId) >= MAX_GAMES_PER_USER) {
    return null;
  }

  if (!reservations) {
    reservations = new Map<string, number>();
    userGameReservations.set(userId, reservations);
  }
  reservations.set(normalizedName, 1);
  return { userId, gameName: normalizedName, active: true };
}

/** Confirma el slot reservado después de una generación exitosa. */
export function commitUserGameReservation(reservation: UserGameReservation): boolean {
  if (!reservation.active) {
    return userHasGame(reservation.userId, reservation.gameName);
  }

  const reservations = userGameReservations.get(reservation.userId);
  reservations?.delete(reservation.gameName);
  if (reservations?.size === 0) userGameReservations.delete(reservation.userId);
  reservation.active = false;

  return addGameToUser(reservation.userId, reservation.gameName);
}

/** Libera la reserva cuando la generación falla. */
export function releaseUserGameReservation(reservation: UserGameReservation): void {
  if (!reservation.active) return;

  const reservations = userGameReservations.get(reservation.userId);
  const count = reservations?.get(reservation.gameName);
  if (count !== undefined) {
    if (count <= 1) reservations?.delete(reservation.gameName);
    else reservations?.set(reservation.gameName, count - 1);
  }
  if (reservations?.size === 0) userGameReservations.delete(reservation.userId);
  reservation.active = false;
}

/**
 * Obtiene cuántos slots le quedan al usuario
 */
export function getRemainingSlots(userId: string): number {
  const userGames = getUserGames(userId);
  return Math.max(0, MAX_GAMES_PER_USER - userGames.length - getReservedGameCount(userId));
}

/**
 * Agrega un juego a la lista del usuario
 */
export function addGameToUser(userId: string, gameName: string): boolean {
  purgeIfExpired(userId);
  const normalizedName = normalizeGameName(gameName);
  const userGames = userGamesCache.get(userId);
  
  if (userGames) {
    // Verificar si ya tiene el juego
    if (userGames.games.includes(normalizedName)) {
      return true; // Ya lo tiene, no cuenta como nuevo
    }
    
    // Verificar límite
    if (userGames.games.length + getReservedGameCount(userId) >= MAX_GAMES_PER_USER) {
      return false;
    }
    
    userGames.games.push(normalizedName);
  } else {
    if (getReservedGameCount(userId) >= MAX_GAMES_PER_USER) {
      return false;
    }
    // Primera vez del usuario
    userGamesCache.set(userId, {
      games: [normalizedName],
      createdAt: Date.now()
    });
  }
  
  return true;
}

/**
 * Verifica si un usuario ya tiene un juego específico
 */
export function userHasGame(userId: string, gameName: string): boolean {
  const normalizedName = normalizeGameName(gameName);
  const userGames = getUserGames(userId);
  return userGames.includes(normalizedName);
}

/**
 * Obtiene el timestamp (ms) en que expiran los slots del usuario, o null si no tiene juegos
 */
export function getUserResetsAt(userId: string): number | null {
  purgeIfExpired(userId);
  const userGames = userGamesCache.get(userId);
  if (!userGames || userGames.games.length === 0) return null;
  return userGames.createdAt + USER_GAMES_TTL_MS;
}

/**
 * Obtiene las frases para un juego, ya sea del cache o hardcodeadas
 */
export function getPhrasesForGame(
  gameName: string,
  personality: AudiencePersonality = DEFAULT_AUDIENCE_PERSONALITY,
): MessagePattern | null {
  // Primero buscar en cache dinámico
  const cached = getCachedPhrases(gameName, personality);
  if (cached) {
    return cached;
  }
  
  // Buscar en los juegos hardcodeados como fallback
  const normalizedName = normalizeGameName(gameName);
  
  // Mapeo de nombres comunes a IDs hardcodeados
  const hardcodedMapping: Record<string, keyof typeof MESSAGE_PATTERNS> = {
    'red dead redemption 2': 'rdr2',
    'rdr2': 'rdr2',
    'red dead': 'rdr2',
    "baldur's gate 3": 'bg3',
    'baldurs gate 3': 'bg3',
    'bg3': 'bg3',
    'minecraft': 'minecraft',
  };
  
  const hardcodedId = hardcodedMapping[normalizedName];
  if (hardcodedId && MESSAGE_PATTERNS[hardcodedId]) {
    return MESSAGE_PATTERNS[hardcodedId];
  }
  
  return null;
}

// ============================================
// ESTADÍSTICAS (para debugging)
// ============================================

export function getCacheStats() {
  return {
    totalGames: phrasesCache.size,
    totalUsers: userGamesCache.size,
    games: Array.from(phrasesCache.keys()),
  };
}
