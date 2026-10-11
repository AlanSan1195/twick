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
  driftX: number;
  driftY: number;
  driftZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  targetVelocityX: number;
  targetVelocityY: number;
  targetVelocityZ: number;
  nextTurn: number;
  repelX: number;
  repelY: number;
  repelScale: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

const PARTICLE_COUNT = 480;
const SPHERE_LIMIT = 0.94;

/** Suaviza las muestras reteniendo las crestas reales de la voz. */
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

function randomDirection(): [number, number, number] {
  const vertical = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const horizontal = Math.sqrt(1 - vertical * vertical);
  return [horizontal * Math.cos(angle), vertical, horizontal * Math.sin(angle)];
}

/** Siembra partículas por todo el volumen y asigna a cada una su propio rumbo lento. */
function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const [directionX, directionY, directionZ] = randomDirection();
    const distance = Math.cbrt(Math.random()) * SPHERE_LIMIT;
    const [velocityDirectionX, velocityDirectionY, velocityDirectionZ] = randomDirection();
    const speed = 0.035 + Math.random() * 0.045;
    return {
      driftX: directionX * distance,
      driftY: directionY * distance,
      driftZ: directionZ * distance,
      velocityX: velocityDirectionX * speed,
      velocityY: velocityDirectionY * speed,
      velocityZ: velocityDirectionZ * speed,
      targetVelocityX: velocityDirectionX * speed,
      targetVelocityY: velocityDirectionY * speed,
      targetVelocityZ: velocityDirectionZ * speed,
      nextTurn: 1 + Math.random() * 3,
      repelX: 0,
      repelY: 0,
      repelScale: 0.9 + Math.random() * 0.2,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0.75 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
    };
  });
}

/** Partículas flotantes de baja carga; React solo controla su montaje y sus estados. */
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
    let frameId = 0;
    let lastTime = 0;
    let elapsed = 0;
    let initialized = false;
    let morph = 0;
    let accent = '#B987FF';
    let neutral = '#F4F0FF';
    const pointer = { x: 0, y: 0, inside: false };

    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const bounds = host.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.inside = true;
    };

    const releasePointer = () => {
      pointer.inside = false;
    };

    const refreshAccent = () => {
      const darkTheme = document.documentElement.classList.contains('dark');
      const platform = document.documentElement.dataset.platform;
      const platformAccents: Record<string, { dark: string; light: string }> = {
        twitch: { dark: '#B987FF', light: '#651FCC' },
        kick: { dark: '#9BFF79', light: '#287A13' },
      };
      const platformAccent = platform ? platformAccents[platform.toLowerCase()] : undefined;
      accent = platformAccent
        ? (darkTheme ? platformAccent.dark : platformAccent.light)
        : (darkTheme ? '#B987FF' : '#651FCC');
      neutral = darkTheme ? '#F4F0FF' : '#302B38';
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
      const level = speaking ? Math.min(1, audioLevel.current * 5) : 0;
      const baseAlpha = active ? 1 : 0.48;
      const repel = active && pointer.inside && !speechActive.current && morph < 0.15 && !still;
      const repelRadiusX = Math.max(24, Math.min(radius * 0.9, 44));
      const repelRadiusY = Math.max(18, Math.min(radius * 0.63, 32));
      const repelDistance = Math.min(radius * 0.35, 56);
      const repelEase = still ? 1 : 1 - Math.exp(-delta * 13);

      const wavePoint = (position: number) => {
        const envelope = Math.sin(Math.PI * position) ** 1.35;
        const sample = waveAt(samples, position);
        const shaped = Math.sign(sample) * Math.abs(sample) ** 0.68;
        return centerY - shaped * envelope * height * 0.46;
      };

      for (let index = 0; index < particles.length; index++) {
        const particle = particles[index];
        if (!still) {
          if (elapsed >= particle.nextTurn) {
            const [directionX, directionY, directionZ] = randomDirection();
            const speed = 0.035 + Math.random() * 0.500;
            particle.targetVelocityX = directionX * speed;
            particle.targetVelocityY = directionY * speed;
            particle.targetVelocityZ = directionZ * speed;
            particle.nextTurn = elapsed + 1 + Math.random() * 3;
          }

          const steering = 1 - Math.exp(-delta * 0.7);
          particle.velocityX += (particle.targetVelocityX - particle.velocityX) * steering;
          particle.velocityY += (particle.targetVelocityY - particle.velocityY) * steering;
          particle.velocityZ += (particle.targetVelocityZ - particle.velocityZ) * steering;
          particle.driftX += particle.velocityX * delta;
          particle.driftY += particle.velocityY * delta;
          particle.driftZ += particle.velocityZ * delta;

          const distance = Math.hypot(particle.driftX, particle.driftY, particle.driftZ);
          if (distance > SPHERE_LIMIT) {
            const normalX = particle.driftX / distance;
            const normalY = particle.driftY / distance;
            const normalZ = particle.driftZ / distance;
            const outwardSpeed = particle.velocityX * normalX
              + particle.velocityY * normalY
              + particle.velocityZ * normalZ;
            particle.driftX = normalX * SPHERE_LIMIT;
            particle.driftY = normalY * SPHERE_LIMIT;
            particle.driftZ = normalZ * SPHERE_LIMIT;
            if (outwardSpeed > 0) {
              particle.velocityX -= normalX * outwardSpeed * 1.8;
              particle.velocityY -= normalY * outwardSpeed * 1.8;
              particle.velocityZ -= normalZ * outwardSpeed * 1.8;
            }
          }
        }

        const depth = particle.driftZ;
        const perspective = 3 / (3 - depth);
        const baseX = centerX + particle.driftX * radius * perspective;
        const baseY = centerY + particle.driftY * radius * perspective;
        let repelTargetX = 0;
        let repelTargetY = 0;
        if (repel) {
          const fromPointerX = baseX - pointer.x;
          const fromPointerY = baseY - pointer.y;
          const normalizedX = fromPointerX / repelRadiusX;
          const normalizedY = fromPointerY / repelRadiusY;
          const normalizedDistance = Math.hypot(normalizedX, normalizedY) / particle.repelScale;
          if (normalizedDistance < 1) {
            const distance = Math.hypot(fromPointerX, fromPointerY);
            const directionX = distance > 0.01 ? fromPointerX / distance : Math.cos(particle.phase);
            const directionY = distance > 0.01 ? fromPointerY / distance : Math.sin(particle.phase);
            const falloff = 1 - normalizedDistance;
            const strength = falloff * (0.75 + falloff * 0.25);
            repelTargetX = directionX * strength * repelDistance * particle.repelScale;
            repelTargetY = directionY * strength * repelDistance * particle.repelScale;
          }
        }
        // El desplazamiento se desvanece al retirar el cursor sin alterar la trayectoria flotante.
        particle.repelX += (repelTargetX - particle.repelX) * repelEase;
        particle.repelY += (repelTargetY - particle.repelY) * repelEase;
        const displacedX = baseX + particle.repelX - centerX;
        const displacedY = baseY + particle.repelY - centerY;
        const displacedRadius = Math.hypot(displacedX, displacedY);
        const sphereRadius = radius * 1.12;
        const containment = displacedRadius > sphereRadius ? sphereRadius / displacedRadius : 1;
        const sphereX = centerX + displacedX * containment;
        const sphereY = centerY + displacedY * containment;
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
          particle.vx += ((targetX - particle.x) * 100 - particle.vx * 19) * delta;
          particle.vy += ((targetY - particle.y) * 100 - particle.vy * 19) * delta;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
        }

        const peakStrength = Math.max(0, (Math.abs(sample) - 0.32) / 0.68);
        const size = (1.1 + (depth + 1) * 0.62) * (1 - morph * 0.38) * (1 + morph * peakStrength * 0.22);
        const sphereAlpha = 0.48 + (depth + 1) * 0.24;
        const waveAlpha = 0.61 + Math.abs(sample) * 0.27 + peakStrength * 0.1;
        context.globalAlpha = baseAlpha * (sphereAlpha * (1 - morph) + waveAlpha * morph);
        context.fillStyle = morph > 0.6
          ? (index % 4 === 0 ? neutral : accent)
          : (index % 5 === 0 ? accent : neutral);
        context.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      }

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
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-platform'],
    });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    host.addEventListener('pointermove', trackPointer);
    host.addEventListener('pointerleave', releasePointer);
    host.addEventListener('pointercancel', releasePointer);
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
      host.removeEventListener('pointermove', trackPointer);
      host.removeEventListener('pointerleave', releasePointer);
      host.removeEventListener('pointercancel', releasePointer);
    };
  }, [audioLevel, speechActive, waveform]);

  return (
    <div ref={hostRef} aria-hidden="true" className="relative h-24 w-full overflow-hidden lg:h-36">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
