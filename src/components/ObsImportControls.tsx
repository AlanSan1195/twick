import { useEffect, useRef, useState } from 'react';
import { IconBroadcast, IconCheck, IconCopy } from '@tabler/icons-react';

interface ObsImportControlsProps {
  overlayToken: string | null;
  overlayLoading: boolean;
  onGenerateOverlayToken: () => void;
  buildOverlayUrl: () => string;
}

export default function ObsImportControls({
  overlayToken,
  overlayLoading,
  onGenerateOverlayToken,
  buildOverlayUrl,
}: ObsImportControlsProps) {
  const [copied, setCopied] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const overlayUrl = overlayToken ? buildOverlayUrl() : '';

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    if (!overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
    } catch {
      // Si no hay acceso al portapapeles, dejar el enlace seleccionado para copiarlo.
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }
  };

  return (
    <section aria-labelledby="obs-import-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" aria-hidden="true">
          <div className="absolute h-4 w-px bg-black/50 dark:bg-white/40" />
          <div className="h-4 w-px rotate-90 bg-black/50 dark:bg-white/40" />
        </div>
        <h2 id="obs-import-title" className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">Importar a OBS</h2>
        <div className="h-px flex-1 bg-black/30 dark:bg-white/30" aria-hidden="true" />
      </div>

      {!overlayToken ? (
        <button
          type="button"
          onClick={onGenerateOverlayToken}
          disabled={overlayLoading}
          className="flex min-h-9 items-center justify-center gap-2 border border-black/35 px-3 py-2 font-jet text-xs uppercase tracking-[0.08em] text-black/60 transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50 dark:border-white/30 dark:bg-black dark:text-white/60 cursor-pointer"
        >
          <IconBroadcast size={14} aria-hidden="true" />
          {overlayLoading ? 'Generando enlace…' : 'Generar enlace para OBS'}
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 gap-1">
            <label htmlFor="obs-overlay-url" className="sr-only">Enlace del chat para OBS</label>
            <input
              ref={urlInputRef}
              id="obs-overlay-url"
              type="text"
              readOnly
              value={overlayUrl}
              placeholder="Selecciona un juego o tema"
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 truncate border border-black/30 bg-black/[0.03] px-2.5 py-1.5 font-jet text-xs text-black/60 focus:border-primary/50 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white/80"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!overlayUrl}
              aria-label={copied ? 'Enlace copiado' : 'Copiar enlace de OBS'}
              className="flex min-h-8 flex-shrink-0 items-center justify-center gap-1 border border-black/30 px-2 font-jet text-[0.65rem] uppercase tracking-[0.04em] text-black/60 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-black dark:text-white/70 cursor-pointer"
            >
              {copied ? <IconCheck size={14} aria-hidden="true" /> : <IconCopy size={14} aria-hidden="true" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
          {!overlayUrl && <p className="font-jet text-[0.62rem] text-black/45 dark:text-white/40">Selecciona un juego o tema para crear la URL.</p>}
          <span className="sr-only" role="status">{copied ? 'Enlace copiado al portapapeles' : ''}</span>
        </div>
      )}
    </section>
  );
}
