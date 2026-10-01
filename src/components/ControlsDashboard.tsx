import {
  IconCoffee,
  IconLoader2,
  IconMessageChatbot,
  IconMessageCircle,
  IconMicrophone,
  IconMicrophoneOff,
  IconMoodCrazyHappy,
  IconMoodWink,
  IconQuestionMark,
} from '@tabler/icons-react';
import type {
  AudiencePersonality,
  MessageInterval,
  StreamMode,
  VoiceStatus,
  WaveType,
} from '../utils/types';
import {
  AUDIENCE_PERSONALITY_OPTIONS,
  INTERVAL_PRESETS,
} from '../utils/types';
import VoiceWaveform from './VoiceWaveform';
import GameInput from './GameInput';
import JustChattingInput from './JustChattingInput';
import ObsImportControls from './ObsImportControls';

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <polygon points="22 11 22 13 21 13 21 14 20 14 20 15 18 15 18 16 16 16 16 17 15 17 15 18 13 18 13 19 11 19 11 20 10 20 10 21 8 21 8 22 6 22 6 23 3 23 3 22 2 22 2 2 3 2 3 1 6 1 6 2 8 2 8 3 10 3 10 4 11 4 11 5 13 5 13 6 15 6 15 7 16 7 16 8 18 8 18 9 20 9 20 10 21 10 21 11 22 11" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <polygon points="23 2 23 22 22 22 22 23 15 23 15 22 14 22 14 2 15 2 15 1 22 1 22 2 23 2" />
      <polygon points="9 2 10 2 10 22 9 22 9 23 2 23 2 22 1 22 1 2 2 2 2 1 9 1 9 2" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <rect x="3" y="3" width="18" height="18" />
    </svg>
  );
}

const PERSONALITY_ICONS: Record<AudiencePersonality, typeof IconMessageChatbot> = {
  sarcastic: IconMoodWink,
  normal: IconMessageChatbot,
  curious: IconQuestionMark,
  chaotic: IconMoodCrazyHappy,
  chill: IconCoffee,
};

const WAVE_BUTTONS: { type: WaveType; emoji: string; label: string }[] = [
  { type: 'laugh', emoji: '😂', label: 'Risas' },
  { type: 'hype', emoji: '🔥', label: 'Hype' },
  { type: 'fear', emoji: '😱', label: 'Miedo' },
  { type: 'omg', emoji: '💀', label: 'WTF' },
];

interface ControlsDashboardProps {
  headerLabel: string;
  isJustChatting: boolean;
  isActive: boolean;
  isPaused: boolean;
  controlsDisabled: boolean;
  selectedGame: string | null;
  selectedTopic: string | null;
  userGames: string[];
  remainingSlots: number;
  audiencePersonality: AudiencePersonality;
  preparingPersonality: AudiencePersonality | null;
  interval: MessageInterval;
  enableInitialGreetings: boolean;
  micEnabled: boolean;
  micStatus: VoiceStatus;
  micError: string | null;
  audioLevel: React.RefObject<number>;
  micSensitivity: number;
  micNoiseFilter: number;
  overlayToken: string | null;
  overlayLoading: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  onModeSwitch: (mode: StreamMode) => void;
  onGameSelect: (game: string) => void;
  onTopicSelect: (topic: string) => void;
  onPersonalityChange: (personality: AudiencePersonality) => void;
  onIntervalChange: (interval: MessageInterval) => void;
  onInitialGreetingsChange: () => void;
  onMicToggle: () => void;
  onMicSensitivityChange: (value: number) => void;
  onMicNoiseFilterChange: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onGenerateOverlayToken: () => void;
  buildOverlayUrl: () => string;
  onWave: (type: WaveType) => void;
}

export default function ControlsDashboard({
  headerLabel,
  isJustChatting,
  isActive,
  isPaused,
  controlsDisabled,
  selectedGame,
  selectedTopic,
  userGames,
  remainingSlots,
  audiencePersonality,
  preparingPersonality,
  interval,
  enableInitialGreetings,
  micEnabled,
  micStatus,
  micError,
  audioLevel,
  micSensitivity,
  micNoiseFilter,
  overlayToken,
  overlayLoading,
  canStart,
  canPause,
  canResume,
  canStop,
  onModeSwitch,
  onGameSelect,
  onTopicSelect,
  onPersonalityChange,
  onIntervalChange,
  onInitialGreetingsChange,
  onMicToggle,
  onMicSensitivityChange,
  onMicNoiseFilterChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onGenerateOverlayToken,
  buildOverlayUrl,
  onWave,
}: ControlsDashboardProps) {
  return (
    <div className="relative flex min-h-0 shrink-0 flex-col gap-y-6 p-5 sm:p-6 xl:pr-58  ">
      <div className="pt-1">
        <div className="mb-3 inline-flex items-center gap-2 border border-black/30 bg-black/[0.04] px-2.5 py-0.5 dark:border-white/20 dark:bg-black">
          <span className={`h-1.5 w-1.5 rounded-full ${isActive && !isPaused ? 'animate-pulse bg-primary' : isPaused ? 'bg-yellow-500' : 'bg-black/25 dark:bg-white/25'}`} aria-hidden="true" />
          <span className="font-jet text-[0.6rem] uppercase tracking-[0.18em]">{isActive && !isPaused ? 'En vivo' : isPaused ? 'En pausa' : 'Inactivo'}</span>
        </div>
        <p className="font-rocket text-3xl uppercase leading-none text-black dark:text-white">{isActive && !isPaused ? 'Streaming:' : 'Stream:'}</p>
        <h1 className="mt-0.5 font-departure text-xl uppercase text-primary">{headerLabel}</h1>
      </div>

      <SectionRule label="Categoría" code="CAT · MODE" />
      <button
        onClick={() => onModeSwitch(isJustChatting ? 'game' : 'justchatting')}
        disabled={(isActive && !isPaused) || controlsDisabled}
        className={`flex w-fit items-center gap-2 border px-4 py-1.5 text-xs font-jet transition-colors ${isJustChatting ? 'border-primary bg-primary text-bg-primary' : (isActive && !isPaused) || controlsDisabled ? 'cursor-not-allowed border-black/30 bg-transparent text-black/40 dark:border-white/15 dark:bg-black dark:text-white/30' : 'cursor-pointer border-black/40 bg-transparent text-black/50 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:border-white/30 dark:bg-black dark:text-white/50 dark:hover:text-white'}`}
        style={isJustChatting ? { color: 'var(--color-primary-text)' } : undefined}
      >
        <IconMessageCircle size={13} />
        <span className="uppercase tracking-[0.1em]">Just Chatting</span>
        <span className={`ml-1 h-1.5 w-1.5 rounded-full ${isJustChatting ? 'bg-current' : 'bg-black/20 dark:bg-white/20'}`} />
      </button>

      {isJustChatting ? (
        <JustChattingInput selectedTopic={selectedTopic} onTopicSelect={onTopicSelect} disabled={isActive || isPaused || controlsDisabled} personality={audiencePersonality} />
      ) : (
        <GameInput selectedGame={selectedGame} onGameSelect={onGameSelect} disabled={isActive || isPaused || controlsDisabled} userGames={userGames} remainingSlots={remainingSlots} personality={audiencePersonality} />
      )}

      <SectionRule label="Audiencia" code="CHAT · TONE" />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {AUDIENCE_PERSONALITY_OPTIONS.map((option) => {
          const PersonalityIcon = PERSONALITY_ICONS[option.id];
          const isSelected = option.id === audiencePersonality;
          const isPreparingThisPersonality = preparingPersonality === option.id;
          const isDisabled = (isActive && !isPaused) || controlsDisabled;
          return (
            <button
              key={option.id}
              onClick={() => onPersonalityChange(option.id)}
              disabled={isDisabled}
              title={isPreparingThisPersonality ? 'Preparando frases para esta personalidad' : option.description}
              className={`min-h-12 rounded-xs border px-2.5 py-2 text-left transition-all ${isSelected ? 'border-primary bg-primary text-bg-primary' : isDisabled ? 'cursor-not-allowed border-black/20 bg-transparent text-black/35 dark:border-white/15 dark:bg-black dark:text-white/25' : 'cursor-pointer border-black/35 bg-transparent text-black/55 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:border-white/25 dark:bg-black dark:text-white/45 dark:hover:text-white'}`}
              style={isSelected ? { color: 'var(--color-primary-text)' } : undefined}
            >
              <span className="flex items-center gap-1.5">{isPreparingThisPersonality ? <IconLoader2 size={14} className="animate-spin" /> : <PersonalityIcon size={14} />}<span className="font-departure text-xs uppercase tracking-[0.08em]">{option.label}</span></span>
              <span className="mt-0.5 block font-jet text-[0.58rem] uppercase tracking-[0.08em] opacity-70">{isPreparingThisPersonality ? 'Generando' : option.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <SectionRule label="Velocidad" code="MSG · RATE" />
      <div className="flex gap-1.5">
        {INTERVAL_PRESETS.map((preset) => {
          const isSelected = preset.min === interval.min && preset.max === interval.max;
          const isDisabled = isActive && !isPaused;
          return <button key={preset.label} onClick={() => onIntervalChange(preset)} disabled={isDisabled} title={isDisabled ? 'Detén el stream para cambiar la velocidad' : `Un mensaje cada ${preset.label}`} className={`flex-1 border py-1.5 text-xs font-jet uppercase tracking-[0.08em] transition-all ${isSelected ? 'border-primary bg-primary text-bg-primary' : isDisabled ? 'cursor-not-allowed border-black/20 bg-transparent text-black/35 dark:border-white/15 dark:bg-black dark:text-white/25' : 'cursor-pointer border-black/35 bg-transparent text-black/50 hover:border-primary/60 hover:bg-primary/10 hover:text-black dark:border-white/25 dark:bg-black dark:text-white/45 dark:hover:text-white'}`}>{preset.label}</button>;
        })}
      </div>

      <SectionRule label="Control" code="STREAM · CTRL" />
      <div className="flex items-center gap-x-3 px-1">
        <span className="font-jet text-xs text-black/50 dark:text-white/40">Iniciar con saludos</span>
        <Toggle pressed={enableInitialGreetings} disabled={controlsDisabled || (isActive && !isPaused)} onClick={onInitialGreetingsChange} label={enableInitialGreetings ? 'Desactivar saludos iniciales' : 'Activar saludos iniciales'} />
      </div>

      <div className="space-y-3 px-1">
        <div className="flex items-center gap-x-3">
          <span className="font-jet text-xs text-black/50 dark:text-white/40">Escuchar micrófono</span>
          <Toggle pressed={micEnabled} disabled={!isActive || isPaused || controlsDisabled} onClick={onMicToggle} label={!isActive || isPaused ? 'Micrófono no disponible' : micEnabled ? 'Desactivar micrófono' : 'Activar micrófono'} />
          {micEnabled && <MicStatus status={micStatus} error={micError} audioLevel={audioLevel} />}
        </div>
        {micEnabled && <div className="space-y-2 border-l border-black/15 pl-1 dark:border-white/15"><MicRange id="mic-sensitivity" label={`Sensib. ${micSensitivity}%`} value={micSensitivity} onChange={onMicSensitivityChange} title="Más alto: capta la voz más fácil. Más bajo: hay que hablar más cerca/fuerte." /><MicRange id="mic-noise-filter" label={`Filtro ${micNoiseFilter}%`} value={micNoiseFilter} onChange={onMicNoiseFilterChange} title="Más alto: ignora más los ruidos cortos (golpes, clics). Más bajo: reacciona más rápido." /></div>}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={isPaused ? onResume : onStart} disabled={isPaused ? !canResume : !canStart} className={`flex h-11 w-11 items-center justify-center transition-all ${(isPaused ? !canResume : !canStart) ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'} aria-label={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'}><PlayIcon className={(isPaused ? !canResume : !canStart) ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
        <button onClick={onPause} disabled={!canPause} className={`flex h-11 w-11 items-center justify-center transition-all ${!canPause ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title="Pausar Chat" aria-label="Pausar Chat"><PauseIcon className={!canPause ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
        <button onClick={onStop} disabled={!canStop} className={`flex h-11 w-11 items-center justify-center transition-all ${!canStop ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title="Detener Chat" aria-label="Detener Chat"><StopIcon className={!canStop ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
        <span className="ml-1 hidden font-jet text-[0.6rem] uppercase tracking-[0.12em] text-black/35 dark:text-white/30 sm:block">{isActive && !isPaused ? '● Live' : isPaused ? '⏸ Pausa' : '○ Off'}</span>
      </div>

      <ObsImportControls overlayToken={overlayToken} overlayLoading={overlayLoading} onGenerateOverlayToken={onGenerateOverlayToken} buildOverlayUrl={buildOverlayUrl} />
      <SectionRule label="Reacciones" code="WAVE · EVT" />
      <div className="flex gap-1.5">
        {WAVE_BUTTONS.map(({ type, emoji, label }) => <button key={type} onClick={() => onWave(type)} disabled={!isActive || isPaused} title={!isActive || isPaused ? 'Inicia el stream para lanzar una oleada' : `Lanzar oleada de ${label.toLowerCase()}`} className={`flex flex-1 flex-col items-center gap-0.5 border py-2 text-xs font-jet transition-all ${isActive && !isPaused ? 'cursor-pointer border-black/35 text-black/60 hover:border-primary hover:bg-primary/10 hover:text-black active:scale-95 dark:border-white/25 dark:bg-black dark:text-white/50 dark:hover:text-white' : 'cursor-not-allowed border-black/15 text-black/25 dark:border-white/10 dark:bg-black dark:text-white/15'}`}><span className="text-sm leading-none">{emoji}</span><span className="text-[0.55rem] uppercase tracking-[0.08em]">{label}</span></button>)}
      </div>

    </div>
  );
}

function SectionRule({ label, code }: { label: string; code: string }) {
  return <div className="flex items-center gap-4"><div className="relative shrink-0"><div className="absolute h-4 w-px bg-black/50 dark:bg-white/40" /><div className="h-4 w-px rotate-90 bg-black/50 dark:bg-white/40" /></div><span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">{label}</span><span className="hidden font-jet text-[0.45rem] uppercase tracking-[.2em] opacity-50 sm:block">{code}</span></div>;
}

function Toggle({ pressed, disabled, onClick, label }: { pressed: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} disabled={disabled} className={`relative h-6 w-11 rounded-full transition-all ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${pressed ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`} style={pressed ? { backgroundColor: 'var(--color-primary)' } : undefined} title={label} aria-label={label} aria-pressed={pressed}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${pressed ? 'translate-x-5' : 'translate-x-0'}`} /></button>;
}

function MicStatus({ status, error, audioLevel }: { status: VoiceStatus; error: string | null; audioLevel: React.RefObject<number> }) {
  if (status === 'listening' || status === 'processing') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><VoiceWaveform active levelRef={audioLevel} /><span className="text-black/50 dark:text-white/40">{status === 'processing' ? 'Procesando' : 'Escuchando'}</span></span>;
  if (status === 'requesting') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophone size={12} className="text-black/40 dark:text-white/30" aria-hidden="true" /><span className="text-black/50 dark:text-white/40">Pidiendo permiso…</span></span>;
  if (status === 'permission-denied') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" /><span className="text-yellow-500">Permiso denegado</span></span>;
  if (status === 'error') return <span className="inline-flex items-center gap-2 font-jet text-[0.6rem] uppercase tracking-[0.12em]"><IconMicrophoneOff size={12} className="text-yellow-500" aria-hidden="true" /><span className="text-yellow-500">{error ?? 'Error de micrófono'}</span></span>;
  return null;
}

function MicRange({ id, label, value, onChange, title }: { id: string; label: string; value: number; onChange: (value: number) => void; title: string }) {
  return <div className="flex items-center gap-2 pl-2"><label htmlFor={id} className="w-24 shrink-0 font-jet text-xs uppercase tracking-[0.08em] text-black/50 dark:text-white/50">{label}</label><input id={id} type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 accent-primary" title={title} /></div>;
}
