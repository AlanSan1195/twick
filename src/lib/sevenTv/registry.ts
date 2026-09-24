/**
 * Única configuración necesaria para activar sets 7TV para todos los streams.
 * Para añadir un set, agrega aquí su URL de página o de API.
 */
export const SEVEN_TV_SET_URLS = [
  'https://7tv.app/emote-sets/01FEEQAQM0000409S3FGDM8BN7',
] as const;

export interface SevenTvSetSource {
  setId: string;
  apiUrl: string;
}

const SET_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Valida el registro y devuelve una sola fuente por cada ID de set. */
export function getSevenTvSetSources(
  urls: readonly string[] = SEVEN_TV_SET_URLS,
): SevenTvSetSource[] {
  const seenIds = new Set<string>();
  const sources: SevenTvSetSource[] = [];

  urls.forEach((rawUrl, index) => {
    try {
      const url = new URL(rawUrl);
      let setId: string | undefined;

      const hasExactOrigin =
        url.protocol === 'https:' &&
        url.port === '' &&
        url.username === '' &&
        url.password === '';

      if (hasExactOrigin && url.hostname === '7tv.app') {
        setId = url.pathname.match(/^\/emote-sets\/([^/]+)\/?$/)?.[1];
      } else if (hasExactOrigin && url.hostname === '7tv.io') {
        setId = url.pathname.match(/^\/v3\/emote-sets\/([^/]+)\/?$/)?.[1];
      }

      if (!setId || !SET_ID_PATTERN.test(setId)) {
        console.warn(`[7TV] URL de set inválida en la posición ${index + 1}; se omite.`);
        return;
      }

      if (seenIds.has(setId)) {
        return;
      }

      seenIds.add(setId);
      sources.push({
        setId,
        apiUrl: `https://7tv.io/v3/emote-sets/${encodeURIComponent(setId)}`,
      });
    } catch {
      console.warn(`[7TV] URL de set inválida en la posición ${index + 1}; se omite.`);
    }
  });

  return sources;
}
