import type { APIRoute } from 'astro';
import { generateGamePhrases, generateChatTopicPhrases } from '../../lib/ai';
import { 
  getCachedPhrases, 
  setCachedPhrases, 
  canUserAddGame, 
  addGameToUser,
  getUserGames,
  getRemainingSlots,
  userHasGame,
  normalizeGameName,
  getUserResetsAt
} from '../../lib/phraseCache';
import type { GeneratePhrasesResponse, StreamMode } from '../../utils/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Obtener userId de Clerk
    const auth = locals.auth?.();
    const userId = auth?.userId;

    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No autenticado',
        gameName: ''
      } as GeneratePhrasesResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener el nombre del juego/tema y el modo del body
    const body = await request.json();
    const { gameName, mode = 'game' } = body as { gameName: string; mode?: StreamMode };

    if (!gameName || typeof gameName !== 'string' || gameName.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Nombre requerido',
        gameName: ''
      } as GeneratePhrasesResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedGame = normalizeGameName(gameName);

    // Verificar si ya existe en cache global (cualquier usuario lo generó)
    const existingPhrases = getCachedPhrases(normalizedGame);
    if (existingPhrases) {
      // Agregar a la lista del usuario si no lo tiene
      if (!userHasGame(userId, normalizedGame)) {
        if (!canUserAddGame(userId)) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Has alcanzado el límite de 4 juegos',
            gameName: normalizedGame,
            limitReached: true,
            currentGames: getUserGames(userId)
          } as GeneratePhrasesResponse), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        addGameToUser(userId, normalizedGame);
      }

      return new Response(JSON.stringify({
        success: true,
        gameName: normalizedGame,
        phrases: existingPhrases,
        currentGames: getUserGames(userId),
        mode
      } as GeneratePhrasesResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar límite de juegos del usuario (aplica igual a temas JC)
    if (!userHasGame(userId, normalizedGame) && !canUserAddGame(userId)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Has alcanzado el límite de 4 juegos. No puedes agregar más.',
        gameName: normalizedGame,
        limitReached: true,
        currentGames: getUserGames(userId)
      } as GeneratePhrasesResponse), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar nuevas frases con IA según el modo
    console.log(`[API] Generando frases para: ${gameName} (usuario: ${userId}, modo: ${mode})`);

    let phrases;
    try {
      phrases = mode === 'justchatting'
        ? await generateChatTopicPhrases(gameName)
        : await generateGamePhrases(gameName);
    } catch (aiError) {
      const err = aiError as Error & { code?: string };
      if (err.code === 'INVALID_GAME') {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_GAME',
          gameName: normalizedGame,
        } as GeneratePhrasesResponse), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (err.code === 'INVALID_TOPIC') {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_TOPIC',
          gameName: normalizedGame,
        } as GeneratePhrasesResponse), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw aiError;
    }

    // Guardar en cache
    setCachedPhrases(normalizedGame, phrases, userId);
    addGameToUser(userId, normalizedGame);

    console.log(`[API] Frases generadas exitosamente para: ${gameName} (modo: ${mode})`);

    return new Response(JSON.stringify({
      success: true,
      gameName: normalizedGame,
      phrases,
      currentGames: getUserGames(userId),
      mode
    } as GeneratePhrasesResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[API] Error generando frases:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
      gameName: ''
    } as GeneratePhrasesResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// GET para obtener info del usuario
export const GET: APIRoute = async ({ locals }) => {
  const auth = locals.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    return new Response(JSON.stringify({
      authenticated: false,
      games: [],
      remainingSlots: 0
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    authenticated: true,
    games: getUserGames(userId),
    remainingSlots: getRemainingSlots(userId),
    resetsAt: getUserResetsAt(userId)
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
