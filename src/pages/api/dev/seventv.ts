import type { APIRoute } from 'astro';
import { getSevenTvCatalogSnapshot } from '../../../lib/sevenTv/catalog';

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
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
