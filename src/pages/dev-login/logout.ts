import type { APIRoute } from 'astro';
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from '../../lib/devAuth';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  if (!isDevAuthEnabled()) {
    return new Response(JSON.stringify({ error: 'No disponible' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  cookies.delete(DEV_AUTH_COOKIE, { path: '/' });
  return redirect('/');
};
