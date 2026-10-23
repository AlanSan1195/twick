import type { APIRoute } from 'astro';
import { getSevenTvCatalogSnapshot } from '../../../lib/sevenTv/catalog';
import { resolveSessionUserId } from '../../../lib/devAuth';

export const GET: APIRoute = async ({ locals, request }) => {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  if (!resolveSessionUserId(locals, request)) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const emotes = getSevenTvCatalogSnapshot().map(({ id, name, imageUrl }) =>
    ({ id, name, url: imageUrl }),
  );
  const emote = emotes.length > 0 ? emotes[Math.floor(Math.random() * emotes.length)] : null;

  return new Response(JSON.stringify({ emote, count: emotes.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
