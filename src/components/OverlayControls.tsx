import type {
  ChatAppearance,
  ChatAppearanceInput,
  OverlayFontSize,
  OverlayVisualConfig,
} from '../utils/types';
import OverlayPreview from './OverlayPreview';

interface OverlayControlsProps {
  fontSize: OverlayFontSize;
  onFontSizeChange: (value: OverlayFontSize) => void;
  platform: OverlayVisualConfig['platform'];
  chatAppearance: ChatAppearance;
  onUpdateAppearance: (patch: ChatAppearanceInput) => void;
  onSelectPreset: (preset: ChatAppearance['preset']) => void;
  onResetAppearance: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}

export default function OverlayControls({
  fontSize,
  onFontSizeChange,
  platform,
  chatAppearance,
  onUpdateAppearance,
  onSelectPreset,
  onResetAppearance,
  saveState,
}: OverlayControlsProps) {
  const bgMode = 'transparent' as const;
  const bgColor = '#000000';
  const bgOpacity = 70;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2 mt-2 px-2">
              <label className="font-jet text-xs text-black/50 dark:text-white/50 uppercase tracking-[0.08em] flex-shrink-0">Texto</label>
              <div className="flex min-w-0 flex-1 gap-1">
                {([
                  { value: 'small', label: 'S' },
                  { value: 'medium', label: 'M' },
                  { value: 'large', label: 'G' },
                ] as { value: OverlayFontSize; label: string }[]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => onFontSizeChange(value)}
                    className={`flex-1 py-1 text-xs font-jet border uppercase tracking-[0.08em] transition-all cursor-pointer
                      ${fontSize === value
                        ? 'bg-primary text-bg-primary border-primary'
                        : 'border-black/30 dark:border-white/15 dark:bg-black hover:dark:bg-black text-black/50 dark:text-white/40 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:hover:text-white'
                      }`}
                    style={fontSize === value ? { color: 'var(--color-primary-text)' } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 w-full min-w-0 px-2 border border-black/20 bg-black/[0.02] pt-2 dark:border-white/5 dark:bg-black/30">
              <div className="space-y-3 pb-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-departure text-xs uppercase tracking-[0.1em] text-black/60 dark:text-white/70">Personalización del chat</p>
                    <p className="font-jet text-[0.62rem] text-black/40 dark:text-white/40 leading-relaxed mt-1">Ajusta el estilo de los mensajes y míralo reflejado al instante en la vista previa y OBS.</p>
                  </div>
                  <button
                    type="button"
                    onClick={onResetAppearance}
                    className="shrink-0 font-jet text-[0.58rem] uppercase tracking-[0.08em] text-black/45 dark:text-white/40 hover:text-primary transition-colors cursor-pointer"
                  >
                    Restaurar
                  </button>
                </div>

                <div>
                  <span className="font-jet text-[0.62rem] uppercase tracking-[0.08em] text-black/50 dark:text-white/50">Preset</span>
                  <div className="grid grid-cols-2 gap-1 mt-1" role="group" aria-label="Preset de apariencia del chat">
                    {([
                      { value: 'cards', label: 'Tarjetas' },
                      { value: 'separated-name', label: 'Nombre separado' },
                    ] as { value: ChatAppearance['preset']; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onSelectPreset(value)}
                        aria-pressed={chatAppearance.preset === value}
                        className={`min-h-8 px-1 py-1 text-[0.58rem] font-jet border uppercase tracking-[0.05em] transition-all cursor-pointer ${chatAppearance.preset === value ? 'bg-primary text-bg-primary border-primary' : 'border-black/25 dark:border-white/15 dark:bg-black text-black/50 dark:text-white/45 hover:border-primary/60 hover:bg-primary/10'}`}
                        style={chatAppearance.preset === value ? { color: 'var(--color-primary-text)' } : undefined}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="font-jet text-[0.62rem] uppercase tracking-[0.08em] text-black/50 dark:text-white/50">Alineación</span>
                  <div className="grid grid-cols-2 gap-1 mt-1" role="group" aria-label="Alineación de mensajes">
                    {([
                      { value: 'left', label: 'Izquierda' },
                      { value: 'alternating', label: 'Alternada' },
                    ] as { value: ChatAppearance['alignment']; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onUpdateAppearance({ alignment: value })}
                        aria-pressed={chatAppearance.alignment === value}
                        className={`py-1.5 text-[0.6rem] font-jet border uppercase tracking-[0.08em] transition-all cursor-pointer ${chatAppearance.alignment === value ? 'bg-primary text-bg-primary border-primary' : 'border-black/25 dark:border-white/15 dark:bg-black text-black/50 dark:text-white/45 hover:border-primary/60 hover:bg-primary/10'}`}
                        style={chatAppearance.alignment === value ? { color: 'var(--color-primary-text)' } : undefined}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                  {([
                    { key: 'messageGap', label: 'Separación', min: 0, max: 24, step: 1, suffix: 'px' },
                    { key: 'padding', label: 'Relleno', min: 0, max: 32, step: 1, suffix: 'px' },
                    { key: 'radius', label: 'Radio', min: 0, max: 24, step: 1, suffix: 'px' },
                    { key: 'cardOpacity', label: 'Opacidad tarjeta', min: 0, max: 100, step: 1, suffix: '%' },
                    { key: 'borderWidth', label: 'Borde', min: 0, max: 4, step: 1, suffix: 'px' },
                  ] as { key: 'messageGap' | 'padding' | 'radius' | 'cardOpacity' | 'borderWidth'; label: string; min: number; max: number; step: number; suffix: string }[]).map(({ key, label, min, max, step, suffix }) => (
                    <label key={key} htmlFor={`chat-appearance-${key}`} className="flex min-w-0 flex-col gap-1">
                      <span className="flex justify-between font-jet text-[0.58rem] uppercase tracking-[0.06em] text-black/50 dark:text-white/45"><span>{label}</span><span>{chatAppearance[key]}{suffix}</span></span>
                      <input
                        id={`chat-appearance-${key}`}
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={chatAppearance[key]}
                        onChange={(event) => onUpdateAppearance({ [key]: Number(event.target.value) })}
                        className="w-full accent-primary h-1 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  <label htmlFor="chat-appearance-card-color" className="flex items-center justify-between gap-2 font-jet text-[0.58rem] uppercase tracking-[0.06em] text-black/50 dark:text-white/45">
                    <span>Tarjeta</span>
                    <input id="chat-appearance-card-color" type="color" value={chatAppearance.cardColor} onChange={(event) => onUpdateAppearance({ cardColor: event.target.value })} className="h-7 w-9 cursor-pointer border border-black/30 dark:border-white/20 bg-transparent p-0.5" />
                  </label>
                  <label htmlFor="chat-appearance-border-color" className="flex items-center justify-between gap-2 font-jet text-[0.58rem] uppercase tracking-[0.06em] text-black/50 dark:text-white/45">
                    <span>Borde</span>
                    <input id="chat-appearance-border-color" type="color" value={chatAppearance.borderColor} onChange={(event) => onUpdateAppearance({ borderColor: event.target.value })} className="h-7 w-9 cursor-pointer border border-black/30 dark:border-white/20 bg-transparent p-0.5" />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-2 w-full min-w-0">
              <OverlayPreview
                bgMode={bgMode}
                bgColor={bgColor}
                bgOpacity={bgOpacity}
                fontSize={fontSize}
                platform={platform}
                appearance={chatAppearance}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="font-jet text-xs text-black/45 dark:text-white/35 leading-relaxed">
                {saveState === 'saving' && 'Guardando cambios para OBS…'}
                {saveState === 'saved' && 'Cambios sincronizados con OBS.'}
                {saveState === 'error' && 'No se pudo sincronizar; inténtalo de nuevo.'}
                {saveState === 'idle' && 'Los cambios se aplican en OBS sin reemplazar la URL.'}
              </p>
            </div>
    </div>
  );
}
