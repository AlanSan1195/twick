import { useEffect, useRef, useState } from 'react';

interface Props {
  count: number;
}

interface Pixel {
  x: number;
  y: number;
  size: number;
}

interface Particle extends Pixel {
  dx: number;
  dy: number;
  delay: number;
}

const DIGITS = [
  ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  ['00110', '01110', '00110', '00110', '00110', '00110', '01111'],
  ['01110', '11011', '00011', '00110', '01100', '11000', '11111'],
  ['11110', '00011', '00011', '01110', '00011', '00011', '11110'],
  ['00011', '00111', '01111', '11011', '11111', '00011', '00011'],
  ['11111', '11000', '11000', '11110', '00011', '00011', '11110'],
  ['01110', '11000', '11000', '11110', '11011', '11011', '01110'],
  ['11111', '00011', '00110', '00110', '01100', '01100', '01100'],
  ['01110', '11011', '11011', '01110', '11011', '11011', '01110'],
  ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
] as const;

const CANVAS_SIZE = 104;
const BREAK_DURATION = 460;
const BUILD_DURATION = 320;

function getPixels(count: number): Pixel[] {
  const digits = String(count);
  const columns = digits.length * 6 - 1;
  const cell = Math.min(10, Math.floor(84 / columns));
  const size = Math.max(1, cell - 1);
  const offsetX = Math.floor((CANVAS_SIZE - columns * cell - 2) / 2);
  const offsetY = Math.floor((CANVAS_SIZE - 7 * cell - 2) / 2);
  const pixels: Pixel[] = [];

  for (let digit = 0; digit < digits.length; digit++) {
    DIGITS[Number(digits[digit])].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '1') {
          pixels.push({ x: offsetX + (digit * 6 + x) * cell, y: offsetY + y * cell, size });
        }
      }
    });
  }
  return pixels;
}

export default function PixelSlotCounter({ count }: Props) {
  const value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialCountRef = useRef(value);
  const updateRef = useRef<((next: number) => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let targetCount = initialCountRef.current;
    let visibleCount = targetCount;
    let frame: number | null = null;
    let ink = '';
    let accent = '';
    let paint = () => drawNumber(visibleCount);

    const cancelAnimation = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const clear = () => {
      context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      context.globalAlpha = 1;
    };
    const drawPixel = (pixel: Pixel, x = pixel.x, y = pixel.y, opacity = 1, scale = 1) => {
      const size = pixel.size * scale;
      const inset = (pixel.size - size) / 2;
      const left = x + inset;
      const top = y + inset;
      const depth = Math.min(3, pixel.size / 3) * scale;
      const bevel = Math.min(1, size / 4);
      const rowShade = (pixel.y / CANVAS_SIZE) * 0.2;

      // La extrusión comparte una dirección de luz para conservar el volumen al fragmentarse.
      context.beginPath();
      context.moveTo(left + size, top);
      context.lineTo(left + size + depth, top + depth);
      context.lineTo(left + size + depth, top + size + depth);
      context.lineTo(left + depth, top + size + depth);
      context.lineTo(left, top + size);
      context.lineTo(left + size, top + size);
      context.closePath();
      context.globalAlpha = opacity;
      context.fillStyle = accent;
      context.fill();
      context.globalAlpha = opacity * 0.48;
      context.fillStyle = '#000';
      context.fill();

      // Los biseles nítidos y el sombreado por fila dan relieve sin difuminar la cuadrícula.
      context.globalAlpha = opacity;
      context.fillStyle = accent;
      context.fillRect(left, top, size, size);
      context.globalAlpha = opacity * rowShade;
      context.fillStyle = '#000';
      context.fillRect(left, top, size, size);
      context.globalAlpha = opacity * (0.48 - rowShade);
      context.fillStyle = '#fff';
      context.fillRect(left, top, size, bevel);
      context.globalAlpha = opacity * 0.18;
      context.fillRect(left, top + bevel, bevel, size - bevel);
      context.globalAlpha = opacity * 0.24;
      context.fillStyle = '#000';
      context.fillRect(left + size - bevel, top + bevel, bevel, size - bevel);
      context.fillRect(left + bevel, top + size - bevel, size - bevel, bevel);
    };
    function drawNumber(next: number) {
      clear();
      for (const pixel of getPixels(next)) drawPixel(pixel);
    }

    // El tamaño físico sigue el DPR; la cuadrícula permanece en coordenadas CSS.
    const refreshSurface = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(CANVAS_SIZE * ratio);
      canvas.height = Math.round(CANVAS_SIZE * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
      const styles = window.getComputedStyle(canvas);
      ink = styles.color;
      accent = styles.getPropertyValue('--color-primary').trim() || ink;
      paint();
    };

    updateRef.current = (next) => {
      const decreases = next < targetCount;
      if (next === targetCount) return;
      targetCount = next;
      cancelAnimation();

      if (!decreases || motionQuery.matches) {
        visibleCount = next;
        paint = () => drawNumber(next);
        paint();
        return;
      }

      // Se destruye el número visible y cualquier actualización converge al último valor.
      const particles: Particle[] = getPixels(visibleCount).map((pixel) => ({
        ...pixel,
        dx: (Math.random() - 0.5) * 30,
        dy: -8 - Math.random() * 14,
        delay: Math.random() * 0.18,
      }));
      const nextPixels = getPixels(next);
      const startedAt = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startedAt;
        paint = () => {
          clear();
          if (elapsed < BREAK_DURATION) {
            const progress = elapsed / BREAK_DURATION;
            for (const particle of particles) {
              const phase = Math.max(0, (progress - particle.delay) / (1 - particle.delay));
              const drift = 1 - (1 - phase) ** 2;
              drawPixel(particle, particle.x + particle.dx * drift,
                particle.y + particle.dy * drift + 32 * phase ** 2,
                (1 - phase) ** 1.4, 1 - phase * 0.6);
            }
          } else {
            visibleCount = next;
            const progress = Math.min(1, (elapsed - BREAK_DURATION) / BUILD_DURATION);
            nextPixels.forEach((pixel, index) => {
              const delay = (index / nextPixels.length) * 0.2;
              const phase = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
              const eased = 1 - (1 - phase) ** 3;
              drawPixel(pixel, pixel.x, pixel.y + (1 - eased) * 8, eased, 0.65 + eased * 0.35);
            });
          }
        };
        paint();
        if (elapsed < BREAK_DURATION + BUILD_DURATION) {
          frame = window.requestAnimationFrame(animate);
        } else {
          frame = null;
          visibleCount = next;
          paint = () => drawNumber(next);
          paint();
        }
      };
      frame = window.requestAnimationFrame(animate);
    };

    const handleMotionChange = () => {
      if (!motionQuery.matches) return;
      cancelAnimation();
      visibleCount = targetCount;
      paint = () => drawNumber(targetCount);
      paint();
    };
    const observer = new MutationObserver(refreshSurface);
    const options = { attributes: true, attributeFilter: ['class', 'style', 'data-platform', 'data-theme'] };
    observer.observe(document.documentElement, options);
    observer.observe(document.body, options);
    motionQuery.addEventListener('change', handleMotionChange);
    themeQuery.addEventListener('change', refreshSurface);
    window.addEventListener('resize', refreshSurface);
    refreshSurface();
    setReady(true);

    return () => {
      cancelAnimation();
      observer.disconnect();
      motionQuery.removeEventListener('change', handleMotionChange);
      themeQuery.removeEventListener('change', refreshSurface);
      window.removeEventListener('resize', refreshSurface);
      updateRef.current = null;
    };
  }, []);

  useEffect(() => {
    updateRef.current?.(value);
  }, [value]);

  return (
    <div className="flex shrink-0 flex-col items-center font-jet">
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {value} juego{value !== 1 ? 's' : ''} disponible{value !== 1 ? 's' : ''}
      </span>
      <div className="relative h-[104px] w-[104px]" aria-hidden="true">
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
          className={`absolute inset-0 h-full w-full text-black dark:text-white ${ready ? '' : 'invisible'}`} />
        {!ready && <span className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-primary">{value}</span>}
      </div>
      <span aria-hidden="true" className="text-[9px] uppercase tracking-[0.12em] text-black/60 dark:text-white/60">
      creditos
      </span>
    </div>
  );
}
