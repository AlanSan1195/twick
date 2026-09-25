export interface SevenTvEmote {
  id: string;
  name: string;
  imageUrl: string;
}

interface CachedCatalog {
  emotes: SevenTvEmote[];
  fetchedAt: number;
}

interface SevenTvImage {
  url: string;
  width: number;
}

const API_URL = 'https://7tv.io/v4/gql';
const TOP_QUERY = 'query TopEmotes { emotes { search(sort: { order: DESCENDING, sortBy: TOP_ALL_TIME }, page: 1, perPage: 100) { items { id defaultName images { url mime width height scale } } } } }';
const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_MAX_AGE_MS = 60 * 60 * 1000;
const FAILURE_RETRY_COOLDOWN_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 5 * 1000;
const DISPLAY_IMAGE_WIDTH = 48;

let cache: CachedCatalog | null = null;
let inFlight: Promise<void> | null = null;
let retryAfter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImage(value: unknown): SevenTvImage | null {
  if (!isRecord(value) || typeof value.url !== 'string' ||
    typeof value.mime !== 'string' || typeof value.width !== 'number' ||
    !Number.isFinite(value.width) || value.width <= 0 ||
    value.mime.toLowerCase() !== 'image/webp') {
    return null;
  }

  try {
    const url = new URL(value.url, 'https://cdn.7tv.app');
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.7tv.app' ||
      url.port !== '' || url.username !== '' || url.password !== '') {
      return null;
    }
    return { url: url.toString(), width: value.width };
  } catch {
    return null;
  }
}

function parseTopResponse(value: unknown): SevenTvEmote[] {
  // La respuesta externa se valida antes de incorporarla al catálogo.
  if (!isRecord(value) || (Array.isArray(value.errors) && value.errors.length > 0) ||
    !isRecord(value.data) || !isRecord(value.data.emotes) ||
    !isRecord(value.data.emotes.search) || !Array.isArray(value.data.emotes.search.items)) {
    throw new Error('La respuesta GraphQL de Top no es válida.');
  }

  const seenIds = new Set<string>();
  const emotes: SevenTvEmote[] = [];
  for (const item of value.data.emotes.search.items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id ||
      typeof item.defaultName !== 'string' || !item.defaultName ||
      !Array.isArray(item.images) || seenIds.has(item.id)) {
      continue;
    }

    const images = item.images.flatMap((image): SevenTvImage[] => {
      const parsed = parseImage(image);
      return parsed ? [parsed] : [];
    });
    images.sort((left, right) =>
      Math.abs(left.width - DISPLAY_IMAGE_WIDTH) - Math.abs(right.width - DISPLAY_IMAGE_WIDTH) ||
      right.width - left.width ||
      Number(left.url.includes('_static.')) - Number(right.url.includes('_static.')),
    );
    if (images.length === 0) continue;

    seenIds.add(item.id);
    emotes.push({ id: item.id, name: item.defaultName, imageUrl: images[0].url });
  }

  if (emotes.length === 0) throw new Error('Top no devolvió emotes utilizables.');
  return emotes;
}

async function fetchTop(): Promise<SevenTvEmote[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: TOP_QUERY }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    return parseTopResponse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function startLoad(): void {
  if (inFlight || retryAfter > Date.now()) return;

  inFlight = fetchTop()
    .then((emotes) => {
      cache = { emotes, fetchedAt: Date.now() };
      retryAfter = 0;
      console.info(`[7TV] Top: ${emotes.length} emotes utilizables.`);
    })
    .catch((error: unknown) => {
      retryAfter = Date.now() + FAILURE_RETRY_COOLDOWN_MS;
      const detail = error instanceof Error ? error.message : 'error desconocido';
      console.warn(`[7TV] Falló la carga de Top: ${detail}`);
    })
    .finally(() => { inFlight = null; });
}

/** Devuelve la última lista Top utilizable y refresca en segundo plano sin bloquear el stream. */
export function getSevenTvCatalogSnapshot(): SevenTvEmote[] {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt >= CACHE_TTL_MS) startLoad();
  return cache && now - cache.fetchedAt <= STALE_MAX_AGE_MS ? cache.emotes : [];
}
