import { memo, useEffect, useState } from 'react';
import type { ChatMessage as ChatMessageType } from '../utils/types';

type FontSize = 'small' | 'medium' | 'large';

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-xl',
};

interface ChatMessageProps {
  message: ChatMessageType;
  startTime: number;
  isAlternate: boolean;
  fontSize?: FontSize;
  platform: 'twitch' | 'kick';
}

// Paleta de colores vibrantes para usernames (consistente por usuario)
const USERNAME_COLORS = [
  '#53FC18', // verde kick,

  '#9146FF', // morado twitch
  '#FF0000', // rojo 
  '#DAA520', // amarillo
  '#FFFC00', // amarillo neon
  '#FF8CC8', // rosa
  '#74B9FF', // azul claro
  '#8A2BE2', // morado

  '#00CEC9', // cian
  '#E17055', // naranja,
  '#00D8FF', // azul neón
];

type SevenTvEmote = {
  id: string;
  name: string;
  data: {
    host: {
      url: string;
      files: Array<{
        name: string;
        format: string;
        width: number;
        height: number;
        size: number;
      }>;
    };
  };
};

const SEVEN_TV_PUBLIC_ENDPOINT = 'https://7tv.io/v3/emote-sets/global';

// tiempo de vida de la cache de emotes de SevenTV (5 minutos)
const SEVEN_TV_CACHE_TTL = 5 * 60 * 1000;

let cachedEmotes: SevenTvEmote[] | null = null;
let cacheTimestamp = 0;
let solicitudEnCurso: Promise<SevenTvEmote[]> | null = null;

function getUsernameColor(username: string): string {
  const hash = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return USERNAME_COLORS[hash % USERNAME_COLORS.length];
}

function seleccionarEmoteAleatorio(emotes: SevenTvEmote[]): SevenTvEmote | null {
  if (emotes.length === 0) {
    return null;
  }

  const indice = Math.floor(Math.random() * emotes.length);
  return emotes[indice];
}

function seleccionarMejorImagen(emote: SevenTvEmote): string | null {
  const file = emote.data.host.files
    .filter((entry) => entry.format === 'WEBP')
    .sort((a, b) => b.width - a.width)[0];

  if (!file) {
    return null;
  }

  return `https:${emote.data.host.url}/${file.name}`;
}


//aleteoridad de emote en mensaje
function obtenerUbicacionEmote(): 'start' | 'end' | null {
  const aleatorio = Math.random();

  if (aleatorio < 0.25) {
    return 'start';
  }

  if (aleatorio < 0.5) {
    return 'end';
  }

  return null;
}

async function getGlobalEmotes(): Promise<SevenTvEmote[]> {
  const now = Date.now();
  if (cachedEmotes && now - cacheTimestamp < SEVEN_TV_CACHE_TTL) {
    return cachedEmotes;
  }

  if (solicitudEnCurso) {
    return solicitudEnCurso;
  }

  solicitudEnCurso = fetch(SEVEN_TV_PUBLIC_ENDPOINT)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Falló la solicitud a SevenTV: ${response.status}`);
      }
      return response.json() as Promise<{ emotes?: SevenTvEmote[] }>;
    })
    .then((data) => {
      cachedEmotes = data.emotes ?? [];
      cacheTimestamp = Date.now();
      return cachedEmotes;
    })
    .finally(() => {
      solicitudEnCurso = null;
    });

  return solicitudEnCurso;
}

function formatTimestamp(startTime: number, messageTime: number): string {
  const elapsed = Math.max(0, Math.floor((messageTime - startTime) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function PlatformAvatar({ platform, color }: { platform: 'twitch' | 'kick'; color: string }) {
  if (platform === 'kick') {
    return (
      <svg width="18" height="18" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color }}>
        <path fillRule="evenodd" clipRule="evenodd" d="M16.3113 0C11.9853 0 7.83644 1.71851 4.77747 4.77747C1.71851 7.83644 0 11.9853 0 16.3113V73.4009C0 77.7269 1.71851 81.8758 4.77747 84.9347C7.83644 87.9937 11.9853 89.7122 16.3113 89.7122H73.4009C77.7269 89.7122 81.8758 87.9937 84.9347 84.9347C87.9937 81.8758 89.7122 77.7269 89.7122 73.4009V16.3113C89.7122 11.9853 87.9937 7.83644 84.9347 4.77747C81.8758 1.71851 77.7269 0 73.4009 0H16.3113ZM38.2092 14.2724H18.2605V75.4398H38.2092V62.1461H44.8561V68.7929H51.503V75.4398H71.4517V55.4951H64.8048V48.8483H58.1498V40.868H64.7967V34.2211H71.4435V14.2724H51.503V20.9193H44.8561V27.5661H38.2092V14.2724Z" fill="currentColor"/>
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" style={{ color }}>
      <path d="M24 4V8H20V12H16V16H12V20H8V76H28V92H32V88H36V84H40V80H44V76H60V72H64V68H68V64H72V60H76V56H80V52H84V48H88V4H24ZM80 48H76V52H72V56H52V60H48V64H44V68H40V56H28V12H80V48Z" fill="currentColor"/>
      <path d="M64 20H72V40H64V20ZM44 20H52V40H44V20Z" fill="currentColor"/>
    </svg>
  );
}

function ChatMessageComponent({ message, startTime, isAlternate, fontSize = 'medium', platform }: ChatMessageProps) {
  const fontSizeClass = FONT_SIZE_CLASSES[fontSize];
  const usernameColor = getUsernameColor(message.username);
  const timestamp = formatTimestamp(startTime, message.timestamp);
  const [emoteUrl, setEmoteUrl] = useState<string | null>(null);
  const [emoteName, setEmoteName] = useState<string>('');
  const [emoteError, setEmoteError] = useState<string | null>(null);
  const [ubicacionEmote, setUbicacionEmote] = useState<'start' | 'end' | null>(null);


  useEffect(() => {
    let isActive = true;
    const ubicacion = obtenerUbicacionEmote();

    if (!ubicacion) {
      setUbicacionEmote(null);
      setEmoteUrl(null);
      return () => {
        isActive = false;
      };
    }

    async function loadEmote() {
      try {
        const emotes = await getGlobalEmotes();
        if (emotes.length === 0) {
          throw new Error('SevenTV no devolvió emotes.');
        }

        const emote = seleccionarEmoteAleatorio(emotes);
        if (!emote) {
          throw new Error('SevenTV no devolvió emotes.');
        }

        const url = seleccionarMejorImagen(emote);
        if (!url) {
          throw new Error('No hay assets WEBP disponibles para el emote.');
        }

        if (isActive) {
          setUbicacionEmote(ubicacion);
          setEmoteUrl(url);
          setEmoteName(emote.name);
          setEmoteError(null);
        }
      } catch (caught) {
        if (isActive) {
          setEmoteError(caught instanceof Error ? caught.message : 'Error desconocido');
        }
      }
    }

    loadEmote();

    return () => {
      isActive = false;
    };
  }, [message.id]);

  return (
    <div className="flex items-center gap-x-1 hover:bg-white/5 transition-colors group">


      {/* Avatar */}
     <div className="flex-shrink-0 ml-2 mt-0.5">
        <PlatformAvatar platform={platform} color={usernameColor} />
      </div> 

      {/* Username + message */}
      <div
        className={`flex-1 min-w-0 ${fontSizeClass} leading-relaxed px-2 py-2 transition-colors group-hover:bg-white/10 ${
          isAlternate ? '' : 'bg-black/20'
        }`}
      >
        <span style={{ color: usernameColor }} className="font-semibold  ">
          {message.username}
        </span>
        <span className="text-white/40">: </span>
        {emoteUrl && !emoteError && ubicacionEmote === 'start' ? (
          <img
            src={emoteUrl}
            alt={emoteName}
            className="ml-2 mr-1 h-6 w-6 inline-block align-middle"
            loading="lazy"
          />
        ) : null}
        <span className="text-white/90 text-pretty ">
          {message.content}
        </span>
        {emoteUrl && !emoteError && ubicacionEmote === 'end' ? (
          <img
            src={emoteUrl}
            alt={emoteName}
            className="ml-2 h-6 w-6 inline-block align-middle"
            loading="lazy"
          />
        ) : null}
      </div>
    </div>
  );
}

const ChatMessage = memo(ChatMessageComponent, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.isAlternate === next.isAlternate &&
    prev.startTime === next.startTime &&
    prev.platform === next.platform
  );
});

export default ChatMessage;
