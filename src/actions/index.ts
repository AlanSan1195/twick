import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { generateOverlayToken } from '../lib/overlayTokens';
import { resolveSessionUserId } from '../lib/devAuth';

// ============================================
// ACTIONS — lógica server-side sin fetch desde el cliente
// ============================================

export const server = {
  /**
   * Genera un token de overlay para el usuario autenticado.
   * Al ejecutarse en SSR, Clerk siempre resuelve correctamente.
   */
  generateOverlayToken: defineAction({
    input: z.object({}),
    handler: async (_input, context) => {
      const userId = resolveSessionUserId(context.locals, context.request);

      if (!userId) {
        throw new Error('No autenticado');
      }

      const token = generateOverlayToken(userId);
      return { token };
    },
  }),
};
