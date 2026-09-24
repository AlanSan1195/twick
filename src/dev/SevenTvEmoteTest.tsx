import { useEffect, useState } from 'react';

interface DiagnosticEmote {
  id: string;
  name: string;
  setId: string;
  url: string;
}

export default function SevenTvEmoteTest() {
  const [emote, setEmote] = useState<DiagnosticEmote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/dev/seventv', { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudo leer el catálogo (${response.status}).`);

        const data = await response.json() as { emote?: DiagnosticEmote | null; count?: number };
        if (!isActive) return;

        if (data.emote) {
          setEmote(data.emote);
          setError(null);
          setLoading(false);
          return;
        }

        attempts += 1;
        if (attempts >= 15) {
          setError('El catálogo aún no tiene emotes disponibles.');
          setLoading(false);
          return;
        }
        timeoutId = setTimeout(loadCatalog, 2000);
      } catch (caught) {
        if (!isActive) return;
        setError(caught instanceof Error ? caught.message : 'Error desconocido al cargar el catálogo.');
        setLoading(false);
      }
    };

    void loadCatalog();
    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-white/90">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Diagnóstico de emotes 7TV</h2>
      {loading ? (
        <p className="mt-3 text-sm text-white/60">Esperando el catálogo del servidor…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-amber-300">{error}</p>
      ) : emote ? (
        <div className="mt-4 flex items-center gap-3">
          <img
            src={emote.url}
            alt={emote.name}
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            loading="lazy"
            onError={() => setError('El CDN no pudo entregar la imagen normalizada.')}
          />
          <div>
            <p className="text-sm font-semibold">{emote.name}</p>
            <p className="text-xs text-white/50">Set {emote.setId}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
