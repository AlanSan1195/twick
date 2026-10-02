import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { VoiceStatus } from '../utils/types';

interface Props {
  status: VoiceStatus;
  audioLevel: RefObject<number>;
  speechActive: RefObject<boolean>;
  waveform: RefObject<Float32Array<ArrayBuffer>>;
}

interface Particle {
  baseX: number;
  baseY: number;
  baseZ: number;
  speed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const PARTICLE_COUNT = 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Interpola las muestras de audio para formar una trayectoria continua. */
function waveAt(samples: Float32Array, position: number): number {
  const scaled = position * (samples.length - 1);
  const index = Math.min(samples.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  const before = samples[Math.max(0, index - 1)];
  const current = samples[index];
  const next = samples[index + 1];
  const after = samples[Math.min(samples.length - 1, index + 2)];
  const fractionSquared = fraction * fraction;
  const fractionCubed = fractionSquared * fraction;
  const interpolated = 0.5 * (
    2 * current
    + (-before + next) * fraction
    + (2 * before - 5 * current + 4 * next - after) * fractionSquared
    + (-before + 3 * current - 3 * next + after) * fractionCubed
  );
  return Math.max(-1, Math.min(1, interpolated));
}

/** Distribuye puntos estables sobre una esfera para conservar su identidad al transformarse. */
function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / PARTICLE_COUNT;
    const ringRadius = Math.sqrt(1 - y * y);
    const angle = index * GOLDEN_ANGLE;
    return {
      baseX: Math.cos(angle) * ringRadius,
      baseY: y,
      baseZ: Math.sin(angle) * ringRadius,
      speed: (0.16 + (index % 13) * 0.009) * (index % 7 === 0 ? -1 : 1),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    };
  });
}

/** Partículas orbitales de baja carga; React solo controla su montaje y sus estados. */
export default function VoiceParticleOrb({ status, audioLevel, speechActive, waveform }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  const syncRef = useRef<(() => void) | null>(null);
  statusRef.current = status;

  useEffect(() => {
    syncRef.current?.();
  }, [status]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!host || !canvas || !context) return;

    const particles = createParticles();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let inView = true;
    let initialized = false;
    let frameId = 0;
    let lastTime = 0;
    let elapsed = 0;
    let morph = 0;
    let accent = '#7c22ff';
    let neutral = '#eae7ff';

    const refreshAccent = () => {
      accent = getComputedStyle(canvas).getPropertyValue('--color-primary').trim() || '#7c22ff';
      neutral = document.documentElement.classList.contains('dark') ? '#eae7ff' : '#292638';
      if (!frameId) draw(0, true);
    };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!frameId) draw(0, true);
    };

    const draw = (delta: number, still = false) => {
      if (!width || !height) return;
      const active = statusRef.current === 'listening' || statusRef.current === 'processing';
      const speaking = active && speechActive.current && !reducedMotion.matches && !still;
      const targetMorph = speaking ? 1 : 0;
      morph += (targetMorph - morph) * (still ? 1 : 1 - Math.exp(-delta * 7));
      if (!still) elapsed += delta;

      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(height * 0.34, width * 0.24);
      const waveExtent = Math.min(width * 0.45, 190);
      const samples = waveform.current;
      const level = Math.min(1, audioLevel.current * 5);
      const baseAlpha = active ? 1 : 0.48;

      const wavePoint = (position: number) => {
        // Los extremos vuelven al eje; la zona central conserva los picos de la voz.
        const envelope = Math.sin(Math.PI * position) ** 1.35;
        const sample = waveAt(samples, position);
        const shaped = Math.sign(sample) * Math.abs(sample) ** 0.68;
        return centerY - shaped * envelope * height * 0.46;
      };

      for (let index = 0; index < particles.length; index++) {
        const particle = particles[index];
        const angle = elapsed * particle.speed;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rotatedX = particle.baseX * cos + particle.baseZ * sin;
        const rotatedZ = particle.baseZ * cos - particle.baseX * sin;
        const tilt = elapsed * 0.045;
        const orbY = particle.baseY * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
        const depth = particle.baseY * Math.sin(tilt) + rotatedZ * Math.cos(tilt);
        const perspective = 3 / (3 - depth);
        const sphereX = centerX + rotatedX * radius * perspective;
        const sphereY = centerY + orbY * radius * perspective;

        const position = index / (PARTICLE_COUNT - 1);
        const sample = waveAt(samples, position);
        const waveX = centerX + (position * 2 - 1) * waveExtent;
        const scatter = Math.sin(index * 47.17) * (0.5 + level * 0.65);
        const waveY = wavePoint(position) + scatter;
        const targetX = sphereX + (waveX - sphereX) * morph;
        const targetY = sphereY + (waveY - sphereY) * morph;

        if (!initialized || still) {
          particle.x = targetX;
          particle.y = targetY;
          particle.vx = 0;
          particle.vy = 0;
        } else {
          // Resorte amortiguado: la partícula sigue su órbita mientras entra y sale de la onda.
          particle.vx += ((targetX - particle.x) * 100 - particle.vx * 19) * delta;
          particle.vy += ((targetY - particle.y) * 100 - particle.vy * 19) * delta;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
        }

        const peakStrength = Math.max(0, (Math.abs(sample) - 0.32) / 0.68);
        const size = (1.1 + (depth + 1) * 0.62) * (1 - morph * 0.38) * (1 + morph * peakStrength * 0.22);
        const sphereAlpha = 0.35 + (depth + 1) * 0.28;
        const waveAlpha = 0.61 + Math.abs(sample) * 0.27 + peakStrength * 0.1;
        context.globalAlpha = baseAlpha * (sphereAlpha * (1 - morph) + waveAlpha * morph);
        context.fillStyle = morph > 0.6
          ? (index % 4 === 0 ? neutral : accent)
          : (index % 5 === 0 ? accent : neutral);
        context.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      }

      // Una línea muy tenue une los puntos solo cuando la trayectoria ya está formada.
      if (morph > 0.82) {
        const reveal = (morph - 0.82) / 0.18;
        context.beginPath();
        for (let index = 0; index < PARTICLE_COUNT; index++) {
          const position = index / (PARTICLE_COUNT - 1);
          const x = centerX + (position * 2 - 1) * waveExtent;
          const y = wavePoint(position);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.globalAlpha = baseAlpha * reveal * 0.4;
        context.strokeStyle = accent;
        context.lineWidth = 0.75;
        context.stroke();
      }
      initialized = true;
      context.globalAlpha = 1;
    };

    const frame = (now: number) => {
      frameId = 0;
      const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = now;
      draw(delta);
      frameId = requestAnimationFrame(frame);
    };

    const sync = () => {
      const active = statusRef.current === 'listening' || statusRef.current === 'processing';
      const shouldAnimate = active && inView && !document.hidden && !reducedMotion.matches;
      if (shouldAnimate && !frameId) {
        lastTime = 0;
        frameId = requestAnimationFrame(frame);
      } else if (!shouldAnimate) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        lastTime = 0;
        if (inView && !document.hidden) draw(0, true);
      }
    };

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    const sizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(refreshAccent);
    visibilityObserver.observe(host);
    sizeObserver.observe(host);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    syncRef.current = sync;
    resize();
    refreshAccent();
    sync();

    return () => {
      syncRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      visibilityObserver.disconnect();
      sizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, [audioLevel, speechActive, waveform]);

  return (
    <div ref={hostRef} aria-hidden="true" className="relative h-44 w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
