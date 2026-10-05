import {
  IconCoffee,
  IconLoader2,
  IconMessageChatbot,
  IconMessageCircle,
  IconMoodCrazyHappy,
  IconMoodWink,
  IconQuestionMark,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type {
  AudiencePersonality,
  MessageInterval,
  StreamMode,
  WaveType,
} from '../utils/types';
import {
  AUDIENCE_PERSONALITY_OPTIONS,
  INTERVAL_PRESETS,
} from '../utils/types';
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
  children: ReactNode;
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
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onGenerateOverlayToken: () => void;
  buildOverlayUrl: () => string;
  onWave: (type: WaveType) => void;
}

export default function ControlsDashboard({
  children,
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
  onStart,
  onPause,
  onResume,
  onStop,
  onGenerateOverlayToken,
  buildOverlayUrl,
  onWave,
}: ControlsDashboardProps) {
  return (
    <>
      <div className="relative flex min-h-0 shrink-0 flex-col gap-y-6 px-5 pt-5 sm:px-6 sm:pt-6 xl:pr-58">
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
      </div>

      <div className="contents lg:relative lg:mx-6 lg:mt-0 lg:flex lg:min-h-44 lg:shrink-0 lg:flex-col lg:gap-3  lg:pb-5 lg:pl-5 lg:pr-[52%] lg:pt-4 xl:mr-58 dark:lg:border-white/15  ">
        <div className="order-0 flex items-center gap-x-3 px-6 pt-2 sm:px-7 lg:grid lg:w-full lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-2 lg:p-0">
          <span className="font-jet text-xs text-black/50 dark:text-white/40">Iniciar con saludos</span>
          <Toggle pressed={enableInitialGreetings} disabled={controlsDisabled || (isActive && !isPaused)} onClick={onInitialGreetingsChange} label={enableInitialGreetings ? 'Desactivar saludos iniciales' : 'Activar saludos iniciales'} />
        </div>

        <div className="order-2 flex justify-center lg:hidden">
          <TransportControls
            className="flex items-center gap-0 sm:gap-3"
            isPaused={isPaused}
            canStart={canStart}
            canPause={canPause}
            canResume={canResume}
            canStop={canStop}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
          />
        </div>

        {children}
      </div>

      <div className="relative flex min-h-0 shrink-0 flex-col gap-y-6 px-5 pb-5 pt-6 sm:px- sm:pb-6 xl:pr-58">
        <TransportControls
          className="hidden  items-center gap-2 lg:flex"
          isPaused={isPaused}
          canStart={canStart}
          canPause={canPause}
          canResume={canResume}
          canStop={canStop}
          isActive={isActive}
          showStatus
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
        />

        <ObsImportControls overlayToken={overlayToken} overlayLoading={overlayLoading} onGenerateOverlayToken={onGenerateOverlayToken} buildOverlayUrl={buildOverlayUrl} />
        <SectionRule label="Reacciones" code="WAVE · EVT" />
        <div className="flex gap-1.5">
          {WAVE_BUTTONS.map(({ type, emoji, label }) => <button key={type} onClick={() => onWave(type)} disabled={!isActive || isPaused} title={!isActive || isPaused ? 'Inicia el stream para lanzar una oleada' : `Lanzar oleada de ${label.toLowerCase()}`} className={`flex flex-1 flex-col items-center gap-0.5 border py-2 text-xs font-jet transition-all ${isActive && !isPaused ? 'cursor-pointer border-black/35 text-black/60 hover:border-primary hover:bg-primary/10 hover:text-black active:scale-95 dark:border-white/25 dark:bg-black dark:text-white/50 dark:hover:text-white' : 'cursor-not-allowed border-black/15 text-black/25 dark:border-white/10 dark:bg-black dark:text-white/15'}`}><span className="text-sm leading-none">{emoji}</span><span className="text-[0.55rem] uppercase tracking-[0.08em]">{label}</span></button>)}
        </div>

      </div>
    </>
  );
}

function SectionRule({ label, code }: { label: string; code: string }) {
  return <div className="flex items-center gap-4"><div className="relative shrink-0"><div className="absolute h-4 w-px bg-black/50 dark:bg-white/40" /><div className="h-4 w-px rotate-90 bg-black/50 dark:bg-white/40" /></div><span className="font-jet text-xs uppercase tracking-[0.2em] text-black/50 dark:text-white/40">{label}</span><span className="hidden font-jet text-[0.45rem] uppercase tracking-[.2em] opacity-50 sm:block">{code}</span></div>;
}

function Toggle({ pressed, disabled, onClick, label }: { pressed: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} disabled={disabled} className={`relative h-6  w-11 rounded-full transition-all ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${pressed ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`} style={pressed ? { backgroundColor: 'var(--color-primary)' } : undefined} title={label} aria-label={label} aria-pressed={pressed}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${pressed ? 'translate-x-5' : 'translate-x-0'}`} /></button>;
}

function TransportControls({
  className,
  isPaused,
  canStart,
  canPause,
  canResume,
  canStop,
  isActive = false,
  showStatus = false,
  onStart,
  onPause,
  onResume,
  onStop,
}: {
  className: string;
  isPaused: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  isActive?: boolean;
  showStatus?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  return (
    <div className={className}>
      <button onClick={isPaused ? onResume : onStart} disabled={isPaused ? !canResume : !canStart} className={`flex scale-75 sm:scale-100 h-11 w-11  items-center justify-center transition-all ${(isPaused ? !canResume : !canStart) ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'} aria-label={isPaused ? 'Reanudar Chat' : 'Iniciar Chat'}><PlayIcon className={(isPaused ? !canResume : !canStart) ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
      <button onClick={onPause} disabled={!canPause} className={`flex  scale-75 sm:scale-110 h-11 w-11  items-center justify-center transition-all ${!canPause ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title="Pausar Chat" aria-label="Pausar Chat"><PauseIcon className={!canPause ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
      <button onClick={onStop} disabled={!canStop} className={`flex  scale-75 sm:scale-110 h-11 w-11  items-center justify-center transition-all ${!canStop ? 'cursor-not-allowed bg-primary/60' : 'bg-primary hover:-translate-y-px hover:opacity-85 active:translate-y-0'}`} title="Detener Chat" aria-label="Detener Chat"><StopIcon className={!canStop ? 'text-bg-primary/40' : 'text-bg-primary'} /></button>
      {showStatus && <span className="ml-1 hidden font-jet text-[0.6rem] uppercase tracking-[0.12em] text-black/35 dark:text-white/30 sm:block">{isActive && !isPaused ? '● Live' : isPaused ? '⏸ Pausa' : '○ Off'}</span>}
    </div>
  );
}
