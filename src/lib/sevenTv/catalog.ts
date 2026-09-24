import { getSevenTvSetSources } from './registry';

export interface SevenTvEmote {
  id: string;
  name: string;
  setId: string;
  imageUrl: string;
}

export interface SevenTvSetCatalog {
  setId: string;
  emotes: SevenTvEmote[];
}

interface CachedSet {
  emotes: SevenTvEmote[];
  fetchedAt: number;
}

interface SevenTvImageFile {
  name: string;
  format: string;
  width: number;
  height: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_MAX_AGE_MS = 60 * 60 * 1000;
const FAILURE_RETRY_COOLDOWN_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 5 * 1000;
const MAX_CONCURRENT_SET_REQUESTS = 3;
const DISPLAY_IMAGE_WIDTH = 48;

const cacheBySetId = new Map<string, CachedSet>();
const inFlightBySetId = new Map<string, Promise<void>>();
const retryAfterBySetId = new Map<string, number>();
const fetchQueue: Array<() => void> = [];
let activeFetches = 0;
// La configuración se valida una vez; importar el módulo nunca inicia solicitudes de red.
const configuredSources = getSevenTvSetSources();

function withFetchSlot<T>(operation: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeFetches += 1;
      operation()
        .then(resolve, reject)
        .finally(() => {
          activeFetches -= 1;
          fetchQueue.shift()?.();
        });
    };

    if (activeFetches < MAX_CONCURRENT_SET_REQUESTS) {
      start();
    } else {
      fetchQueue.push(start);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImageFiles(value: unknown): SevenTvImageFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): SevenTvImageFile[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const { name, format, width, height } = entry;
    if (
      typeof name !== 'string' ||
      typeof format !== 'string' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return [];
    }

    return [{ name, format, width, height }];
  });
}

function getImageUrl(hostValue: unknown, file: SevenTvImageFile): string | null {
  if (!isRecord(hostValue) || typeof hostValue.url !== 'string') {
    return null;
  }

  try {
    const hostUrl = new URL(hostValue.url, 'https://cdn.7tv.app');
    if (
      hostUrl.protocol !== 'https:' ||
      hostUrl.hostname !== 'cdn.7tv.app' ||
      hostUrl.port !== '' ||
      hostUrl.username !== '' ||
      hostUrl.password !== ''
    ) {
      return null;
    }

    const basePath = hostUrl.pathname.replace(/\/$/, '');
    const imageUrl = new URL(`${basePath}/${encodeURIComponent(file.name)}`, hostUrl.origin);
    if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'cdn.7tv.app') {
      return null;
    }

    return imageUrl.toString();
  } catch {
    return null;
  }
}

function parseEmote(value: unknown, setId: string): SevenTvEmote | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || typeof value.name !== 'string' || value.name.length === 0) {
    return null;
  }

  if (!isRecord(value.data) || !isRecord(value.data.host)) {
    return null;
  }

  const files = parseImageFiles(value.data.host.files)
    .filter((file) => file.format.toUpperCase() === 'WEBP')
    .sort((left, right) => {
      const leftDistance = Math.abs(left.width - DISPLAY_IMAGE_WIDTH);
      const rightDistance = Math.abs(right.width - DISPLAY_IMAGE_WIDTH);
      return leftDistance - rightDistance || right.width - left.width;
    });

  for (const file of files) {
    const imageUrl = getImageUrl(value.data.host, file);
    if (imageUrl) {
      return { id: value.id, name: value.name, setId, imageUrl };
    }
  }

  return null;
}

function parseSetResponse(value: unknown, setId: string): SevenTvEmote[] {
  // El JSON de un servidor externo se recibe como unknown y solo se usa tras validar cada campo.
  if (!isRecord(value) || !Array.isArray(value.emotes)) {
    throw new Error('La respuesta no contiene una lista de emotes válida.');
  }

  return value.emotes.flatMap((emote): SevenTvEmote[] => {
    const normalized = parseEmote(emote, setId);
    return normalized ? [normalized] : [];
  });
}

async function fetchSet(apiUrl: string, setId: string): Promise<SevenTvEmote[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // El cuerpo se valida en parseSetResponse antes de incorporarse al catálogo.
    const payload: unknown = await response.json();
    return parseSetResponse(payload, setId);
  } finally {
    clearTimeout(timeout);
  }
}

function startSetLoad(setId: string, apiUrl: string): void {
  if (inFlightBySetId.has(setId) || (retryAfterBySetId.get(setId) ?? 0) > Date.now()) {
    return;
  }

  const request = withFetchSlot(() => fetchSet(apiUrl, setId))
    .then((emotes) => {
      cacheBySetId.set(setId, { emotes, fetchedAt: Date.now() });
      retryAfterBySetId.delete(setId);
      console.info(`[7TV] Set ${setId}: ${emotes.length} emotes utilizables.`);
    })
    .catch((error: unknown) => {
      retryAfterBySetId.set(setId, Date.now() + FAILURE_RETRY_COOLDOWN_MS);
      const detail = error instanceof Error ? error.message : 'error desconocido';
      console.warn(`[7TV] Falló la carga del set ${setId}: ${detail}`);
    })
    .finally(() => {
      inFlightBySetId.delete(setId);
    });

  inFlightBySetId.set(setId, request);
}

/**
 * Devuelve sincrónicamente el último catálogo usable y dispara en segundo plano
 * las cargas iniciales o vencidas. Cada entrada conserva el ID de su set para
 * que el selector posterior pueda repartir elecciones entre sets.
 */
export function getSevenTvCatalogSnapshot(
  urls?: readonly string[],
): SevenTvSetCatalog[] {
  const sources = urls ? getSevenTvSetSources(urls) : configuredSources;
  const now = Date.now();
  const seenEmoteIds = new Set<string>();
  const catalogs: SevenTvSetCatalog[] = [];

  for (const source of sources) {
    const cached = cacheBySetId.get(source.setId);
    if (!cached || now - cached.fetchedAt >= CACHE_TTL_MS) {
      startSetLoad(source.setId, source.apiUrl);
    }

    if (!cached || now - cached.fetchedAt > STALE_MAX_AGE_MS) {
      continue;
    }

    const emotes = cached.emotes.filter((emote) => {
      if (seenEmoteIds.has(emote.id)) {
        return false;
      }
      seenEmoteIds.add(emote.id);
      return true;
    });

    if (emotes.length > 0) {
      catalogs.push({ setId: source.setId, emotes });
    }
  }

  return catalogs;
}
