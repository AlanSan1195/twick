import type { MessagePattern } from '../utils/types';
import { MESSAGE_PATTERNS } from './messagePatterns';

// ============================================
// CACHE DE FRASES POR JUEGO
// ============================================

interface CachedGame {
  phrases: MessagePattern;
  generatedAt: number;
  generatedBy: string;
}

// Cache global de frases por juego (normalizado a minúsculas)
const phrasesCache = new Map<string, CachedGame>();

/**
 * Normaliza el nombre del juego para usar como key
 */
export function normalizeGameName(gameName: string): string {
  return gameName.toLowerCase().trim();
}

/**
 * Obtiene las frases de un juego del cache
 */
export function getCachedPhrases(gameName: string): MessagePattern | null {
  const key = normalizeGameName(gameName);
  const cached = phrasesCache.get(key);
  return cached?.phrases || null;
}

/**
 * Guarda frases de un juego en el cache
 */
export function setCachedPhrases(gameName: string, phrases: MessagePattern, userId: string): void {
  const key = normalizeGameName(gameName);
  phrasesCache.set(key, {
    phrases,
    generatedAt: Date.now(),
    generatedBy: userId
  });
}

/**
 * Verifica si un juego existe en el cache
 */
export function hasGameInCache(gameName: string): boolean {
  return phrasesCache.has(normalizeGameName(gameName));
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
  return userGames.length < MAX_GAMES_PER_USER;
}

/**
 * Obtiene cuántos slots le quedan al usuario
 */
export function getRemainingSlots(userId: string): number {
  const userGames = getUserGames(userId);
  return MAX_GAMES_PER_USER - userGames.length;
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
    if (userGames.games.length >= MAX_GAMES_PER_USER) {
      return false;
    }
    
    userGames.games.push(normalizedName);
  } else {
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
export function getPhrasesForGame(gameName: string): MessagePattern | null {
  // Primero buscar en cache dinámico
  const cached = getCachedPhrases(gameName);
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
