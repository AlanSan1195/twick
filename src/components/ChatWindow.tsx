import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatAppearance, ChatMessage as ChatMessageType } from '../utils/types';
import { DEFAULT_CHAT_APPEARANCE } from '../utils/types';
import ChatMessage from './ChatMessage';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isActive: boolean;
  platform: 'twitch' | 'kick';
  appearance?: ChatAppearance;
  settingsPanel?: ReactNode;
}

function ChatWindowFooter() {
  return <div aria-hidden="true" className="h-6" />;
}

const VIRTUOSO_COMPONENTS = { Footer: ChatWindowFooter };

export default function ChatWindow({ messages, isActive, platform, appearance = DEFAULT_CHAT_APPEARANCE, settingsPanel }: ChatWindowProps) {
  const [startTime] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLElement>(null);
  const settingsId = useId();
  const lastMessageId = messages.at(-1)?.id;

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isActive) setSettingsOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (!settingsOpen || !isActive) return;
    closeButtonRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettings();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = settingsPanelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!settingsPanelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [settingsOpen, isActive, closeSettings]);

  useLayoutEffect(() => {
    if (!lastMessageId) return;

    const timer = window.setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        align: 'end',
        behavior: 'auto',
      });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [lastMessageId, messages.length]);

  const itemContent = useCallback(
    (index: number, message: ChatMessageType) => (
      <ChatMessage
        message={message}
        startTime={startTime}
        isAlternate={index % 2 === 1}
        platform={platform}
        appearance={appearance}
      />
    ),
    [startTime, platform, appearance],
  );

  const isEmpty = messages.length === 0;

  return (
    <div className="relative flex flex-col h-[600px] lg:h-full border-[1px] md:col-span-2 border-white/10 bg-terminal overflow-hidden ">
      {/* Header */}
      <div className="relative flex items-center justify-between gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0 min-h-[76px]">
    
        <h2 className="relative mr-auto text-white font-jet text-sm sm:text-2xl font-medium pointer-events-none">
          Chat
        </h2>
        {isActive && settingsPanel && (
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Personalizar chat"
            aria-expanded={settingsOpen}
            aria-controls={settingsOpen ? settingsId : undefined}
            title="Personalizar chat"
            className="relative z-10 flex h-9 shrink-0 items-center justify-center gap-2  px-2.5 font-jet text-[0.58rem] uppercase tracking-[0.06em] text-primary transition-colors cursor-pointer sm:px-3 sm:text-[0.65rem]"
          >
            <div className=' flex flex-col items-center justify-center gap-y-1'>

            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5  shrink-0 fill-current text-primary">
              <use href="/settingIcon.svg#cog" />
            </svg>
            <span className='text-white text-[9px]'>Custom</span>
            </div>
          </button>
        )}
      </div>

      {/* Messages Container */}
      <div className="flex-1 min-h-0 relative mx-2 sm:mx-4 my-4">

        {/* Empty state — visible only when no messages, sits on top */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 pointer-events-none">
            <svg
              className="w-14 h-14 text-primary opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm text-white/30 font-jet">Selecciona un juego e inicia el chat</p>
          </div>
        )}

        {/* Virtuoso stays mounted at all times so its scroll state is never lost */}
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', visibility: isEmpty ? 'hidden' : 'visible' }}
          data={messages}
          itemContent={itemContent}
          components={VIRTUOSO_COMPONENTS}
          followOutput={() => 'auto'}
          initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
          increaseViewportBy={200}
        />
      </div>

      {isActive && settingsPanel && settingsOpen && (
        <div className="absolute inset-0 z-20 flex min-w-0 justify-end overflow-hidden bg-black/65">
          <button type="button" tabIndex={-1} aria-label="Cerrar ajustes" onClick={closeSettings} className="absolute inset-0 cursor-default" />
          <section
            ref={settingsPanelRef}
            id={settingsId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${settingsId}-title`}
            className="relative flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden border-l border-black/20 bg-bg-secundary text-black shadow-2xl dark:border-white/15 dark:bg-terminal dark:text-white sm:h-fit sm:max-w-[38rem]"
          >
            <div className="flex w-full min-w-0 flex-shrink-0 items-center justify-between gap-3 border-b border-black/15 px-4 py-3 dark:border-white/15 sm:px-5">
              <div className="min-w-0">
                <p className="font-jet text-[0.55rem] uppercase tracking-[0.2em] text-primary">Chat · Diseño</p>
                <h3 id={`${settingsId}-title`} className="font-departure text-sm uppercase tracking-[0.08em]">Ajustes del chat</h3>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeSettings}
                aria-label="Cerrar ajustes del chat"
                className="flex h-9 w-9 items-center justify-center text-black/60 transition-colors hover:border-primary hover:text-primary  dark:text-white/65 cursor-pointer"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="M5 5 19 19M19 5 5 19" /></svg>
              </button>
            </div>
            <div className="w-full min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {settingsPanel}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
