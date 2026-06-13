import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// ============================================
// VoiceWaveform — ondas de sonido reactivas a la voz
// ============================================
//
// Anima un conjunto de barras según el nivel de audio real del micrófono.
// Lee el nivel desde un ref (no prop) y actualiza el DOM con requestAnimationFrame,
// así el componente padre no se re-renderiza en cada frame. Un suavizado (lerp)
// interpola entre las muestras del nivel (~100ms) para lograr 60fps fluidos.

interface Props {
  /** Si está escuchando: arranca la animación. Al desactivarse, las barras se aplanan */
  active: boolean;
  /** Ref al nivel de audio actual (RMS 0–1 aprox) expuesto por useVoiceCapture */
  levelRef: RefObject<number>;
}

const BAR_COUNT = 5;

/** RMS típico de voz; por encima de este valor las barras llegan a su altura máxima */
const LEVEL_NORMALIZE = 0.2;

/** Altura mínima de cada barra (escala) cuando hay silencio */
const MIN_SCALE = 0.18;

export default function VoiceWaveform({ active, levelRef }: Props) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Aplanar las barras al dejar de escuchar
      smoothRef.current = 0;
      for (const bar of barsRef.current) {
        if (bar) bar.style.transform = `scaleY(${MIN_SCALE})`;
      }
      return;
    }

    const animate = () => {
      const target = Math.min(1, (levelRef.current ?? 0) / LEVEL_NORMALIZE);
      // Suavizado exponencial hacia el nivel objetivo
      smoothRef.current += (target - smoothRef.current) * 0.35;
      const level = smoothRef.current;
      const t = performance.now() / 150;

      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        // Las barras centrales reaccionan más; oscilación temporal para efecto onda
        const center = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
        const wave = 0.55 + 0.45 * Math.sin(t + i * 0.9);
        const scale = MIN_SCALE + level * (0.45 + 0.55 * center) * wave;
        bar.style.transform = `scaleY(${Math.min(1, scale)})`;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, levelRef]);

  return (
    <span className="inline-flex items-center gap-[2px] h-4" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="w-[3px] h-full bg-primary rounded-full"
          style={{ transform: `scaleY(${MIN_SCALE})`, backgroundColor: 'var(--color-primary)' }}
        />
      ))}
    </span>
  );
}
