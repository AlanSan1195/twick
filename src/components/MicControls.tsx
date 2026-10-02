import { IconMicrophone, IconMicrophoneOff } from '@tabler/icons-react';
import type { RefObject } from 'react';
import type { VoiceStatus } from '../utils/types';
import VoiceParticleOrb from './VoiceParticleOrb';

interface Props {
  isActive: boolean;
  isPaused: boolean;
  controlsDisabled: boolean;
  micEnabled: boolean;
  micStatus: VoiceStatus;
  micError: string | null;
  audioLevel: RefObject<number>;
  speechActive: RefObject<boolean>;
  waveform: RefObject<Float32Array<ArrayBuffer>>;
  micSensitivity: number;
  micNoiseFilter: number;
  onMicToggle: () => void;
  onMicSensitivityChange: (value: number) => void;
  onMicNoiseFilterChange: (value: number) => void;
}

/** Comparte un único control y una sola animación entre los diseños móvil y grande. */
export default function MicControls({
  isActive,
  isPaused,
  controlsDisabled,
  micEnabled,
  micStatus,
  micError,
  audioLevel,
  speechActive,
  waveform,
  micSensitivity,
  micNoiseFilter,
  onMicToggle,
  onMicSensitivityChange,
  onMicNoiseFilterChange,
}: Props) {
  return (
    <section aria-label="Micrófono" className="order-2 min-w-0 px-5 pb-6 pt-5 sm:px-6 lg:contents">
      <div className=" px-1 lg:contents">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:grid lg:w-full lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-2 lg:gap-y-1">
          <span className="font-jet text-xs text-black/50 dark:text-white/40">Micrófono</span>
          <button
            onClick={onMicToggle}
            disabled={!isActive || isPaused || controlsDisabled}
            className={`relative h-6 w-11 rounded-full transition-all ${!isActive || isPaused || controlsDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${micEnabled ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`}
            style={micEnabled ? { backgroundColor: 'var(--color-primary)' } : undefined}
            title={!isActive || isPaused ? 'Micrófono no disponible' : micEnabled ? 'Desactivar micrófono' : 'Activar micrófono'}
            aria-label={!isActive || isPaused ? 'Micrófono no disponible' : micEnabled ? 'Desactivar micrófono' : 'Activar micrófono'}
            aria-pressed={micEnabled}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${micEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          {micEnabled && <div className="lg:col-span-2 flex items-center"><MicStatus status={micStatus} error={micError} /></div>}
        </div>
        {micEnabled && <div className="lg:absolute lg:right-7 lg:top-1 lg:w-[46%]"><VoiceParticleOrb status={micStatus} audioLevel={audioLevel} speechActive={speechActive} waveform={waveform} /></div>}
        {micEnabled && (
          <div className="space-y-2 border-l border-black/15 lg:w-full ">
            <MicRange id="mic-sensitivity" label={`Sensib. ${micSensitivity}%`} value={micSensitivity} onChange={onMicSensitivityChange} title="Más alto: capta la voz más fácil. Más bajo: hay que hablar más cerca/fuerte." />
            <MicRange id="mic-noise-filter" label={`Filtro ${micNoiseFilter}%`} value={micNoiseFilter} onChange={onMicNoiseFilterChange} title="Más alto: ignora más los ruidos cortos (golpes, clics). Más bajo: reacciona más rápido." />
          </div>
        )}
      </div>
    </section>
  );
}

function MicStatus({ status, error }: { status: VoiceStatus; error: string | null }) {
  if (status === 'listening' || status === 'processing') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /><span className="text-black/50 dark:text-white/40">{status === 'processing' ? 'Procesando' : 'Escuchando'}</span></span>;
  if (status === 'requesting') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophone size={12} className="text-black/40 dark:text-white/30" aria-hidden="true" /><span className="text-black/50 dark:text-white/40">Pidiendo permiso…</span></span>;
  if (status === 'permission-denied') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" /><span className="text-yellow-500">Permiso denegado</span></span>;
  if (status === 'error') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" /><span className="text-yellow-500">{error ?? 'Error de micrófono'}</span></span>;
  return null;
}

function MicRange({ id, label, value, onChange, title }: { id: string; label: string; value: number; onChange: (value: number) => void; title: string }) {
  return <div className="flex items-center gap-2 pl-2"><label htmlFor={id} className="w-24 shrink-0 font-jet text-xs uppercase tracking-[0.08em] text-black/50 dark:text-white/50">{label}</label><input id={id} type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 accent-primary" title={title} /></div>;
}
