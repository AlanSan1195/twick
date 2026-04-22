import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { generateOverlayToken } from '../lib/overlayTokens';

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
      const auth = context.locals.auth?.();
      const userId = auth?.userId;

      if (!userId) {
        throw new Error('No autenticado');
      }

      const token = generateOverlayToken(userId);
      return { token };
    },
  }),
};
