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

// Ícono de persona con sombrero (estilo Twitch spy)
function HatAvatar({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sombrero */}
      <path d="M5 10 Q5 7 12 7 Q19 7 19 10" stroke={color} strokeWidth="1.6" fill={color} fillOpacity="0.15" />
      <rect x="4" y="9.5" width="16" height="2" rx="1" fill={color} />
      {/* Cabeza */}
      <circle cx="12" cy="15" r="4" stroke={color} strokeWidth="1.6" fill={color} fillOpacity="0.15" />
      {/* Ojos */}
      <circle cx="10.5" cy="14.5" r="0.8" fill={color} />
      <circle cx="13.5" cy="14.5" r="0.8" fill={color} />
      {/* Bigote/boca */}
      <path d="M10.5 16.5 Q12 17.5 13.5 16.5" stroke={color} strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ChatMessageComponent({ message, startTime, isAlternate, fontSize = 'medium' }: ChatMessageProps) {
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
     <div className="flex-shrink-0 mx-2 mt-0.5">
        <HatAvatar color={usernameColor} />
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
    prev.startTime === next.startTime
  );
});

export default ChatMessage;
