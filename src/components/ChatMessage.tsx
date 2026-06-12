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

// Hash determinista (djb2) — el mismo username produce siempre el mismo valor,
// y la semilla permite derivar valores independientes (color, emblemas, etc.)
function hashUsername(username: string, seed = 5381): number {
  let hash = seed;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) + hash + username.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getUsernameColor(username: string): string {
  return USERNAME_COLORS[hashUsername(username) % USERNAME_COLORS.length];
}

// ============================================
// EMBLEMAS DE USUARIO — estilo Twitch (Prime, mod, VIP, sub...)
// Deterministas por username: el mismo usuario muestra
// siempre los mismos emblemas durante todo el stream.
// ============================================

type BadgeType = 'prime' | 'mod' | 'vip' | 'sub' | 'verified' | 'turbo' | 'founder' | 'bits';

// Emblemas de rol (primera posición) — sub es el más común, como en un chat real
const PRIMARY_BADGES: BadgeType[] = ['sub', 'sub', 'sub', 'mod', 'vip', 'founder', 'verified'];
// Emblemas de cuenta (segunda posición)
const SECONDARY_BADGES: BadgeType[] = ['prime', 'prime', 'turbo', 'bits'];

/** ~30% sin emblemas, ~40% con uno, ~30% con dos */
function getBadgesForUser(username: string): BadgeType[] {
  const roll = hashUsername(username) % 100;
  if (roll < 30) {
    return [];
  }

  const badges: BadgeType[] = [
    PRIMARY_BADGES[hashUsername(username, 33) % PRIMARY_BADGES.length],
  ];

  if (roll >= 70) {
    badges.push(SECONDARY_BADGES[hashUsername(username, 77) % SECONDARY_BADGES.length]);
  }

  return badges;
}

interface BadgeVisual {
  bg: string;
  fg: string;
  path: string;
}

function getBadgeVisual(type: BadgeType, platform: 'twitch' | 'kick'): BadgeVisual {
  switch (type) {
    case 'prime': // corona blanca sobre azul
      return { bg: '#0E9BD8', fg: '#FFFFFF', path: 'M3 12.5V6l3.2 2.4L9 4.4l2.8 4L15 6v6.5H3z' };
    case 'mod': // espada blanca sobre verde
      return {
        bg: '#00AD03',
        fg: '#FFFFFF',
        path: 'M13.7 3.2 15 4.5 9.4 10.1l1.4 1.4-1.5 1.5-1.4-1.4-2.4 2.4-1.3-1.3 2.4-2.4-1.4-1.4 1.5-1.5 1.4 1.4 5.6-5.6z',
      };
    case 'vip': // gema blanca sobre rosa
      return { bg: '#E005B9', fg: '#FFFFFF', path: 'M4.5 5h9l2.3 3.2L9 14.6 2.2 8.2 4.5 5z' };
    case 'sub': // estrella — color según plataforma
      return {
        bg: platform === 'kick' ? '#53FC18' : '#9146FF',
        fg: platform === 'kick' ? '#0B0E0F' : '#FFFFFF',
        path: 'M9 3.2 10.7 7l4.1.3-3.1 2.6 1 4.1L9 11.7 5.3 14l1-4.1L3.2 7.3 7.3 7 9 3.2z',
      };
    case 'turbo': // rayo sobre morado oscuro
      return { bg: '#59399A', fg: '#FFFFFF', path: 'M10.4 2.6 4.8 10h3.4L7 15.4 13.2 7.8H9.6l.8-5.2z' };
    case 'founder': // escudo sobre naranja
      return {
        bg: '#E0683C',
        fg: '#FFFFFF',
        path: 'M9 2.6l5.4 2v4.1c0 3.3-2.2 5.8-5.4 6.7-3.2-.9-5.4-3.4-5.4-6.7V4.6L9 2.6z',
      };
    case 'bits': // diamante sobre azul
      return { bg: '#4B9CD3', fg: '#FFFFFF', path: 'M9 3.2l4.8 4.6L9 14.8 4.2 7.8 9 3.2z' };
    case 'verified': // check sobre gris (path con stroke, ver UserBadge)
      return { bg: '#777C85', fg: '#FFFFFF', path: 'M4.8 9.6l2.8 2.8 5.6-6.6' };
  }
}

// ============================================
// SUSCRIPCIONES DESTACADAS
// ============================================

// Fondos rotativos del bloque de sub — incluye el tono oscuro de referencia
const SUB_BG_COLORS = [
  '#1F1A26', // morado grisáceo oscuro (referencia)
  '#3A2A5E', // morado profundo
  '#12353B', // verde azulado oscuro
];

/** Color de la barra lateral del bloque de sub */
const SUB_ACCENT_COLOR = '#FFB31A';

function SubCrownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block align-middle flex-shrink-0"
      aria-label="Suscripción"
    >
      <path d="M3 12.5V6l3.2 2.4L9 4.4l2.8 4L15 6v6.5H3z" fill="#E8E3F3" />
    </svg>
  );
}

function UserBadge({ type, platform }: { type: BadgeType; platform: 'twitch' | 'kick' }) {
  const { bg, fg, path } = getBadgeVisual(type, platform);

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      className="mr-1 inline-block align-middle flex-shrink-0"
      aria-label={`Emblema ${type}`}
    >
      <rect width="18" height="18" rx="3" fill={bg} />
      {type === 'verified' ? (
        <path d={path} stroke={fg} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={path} fill={fg} />
      )}
    </svg>
  );
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


//aleteoridad de emote en mensaje para peronalidad chaotic
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

function ChatMessageComponent({ message, startTime, isAlternate, fontSize = 'medium', platform }: ChatMessageProps) {
  const fontSizeClass = FONT_SIZE_CLASSES[fontSize];
  const usernameColor = getUsernameColor(message.username);
  const userBadges = getBadgesForUser(message.username);
  const timestamp = formatTimestamp(startTime, message.timestamp);
  const isChaotic = message.personality === 'chaotic';
  const [emoteUrl, setEmoteUrl] = useState<string | null>(null);
  const [emoteName, setEmoteName] = useState<string>('');
  const [emoteError, setEmoteError] = useState<string | null>(null);
  const [ubicacionEmote, setUbicacionEmote] = useState<'start' | 'end' | null>(null);
  const [emoteCount, setEmoteCount] = useState(1);


  useEffect(() => {
    let isActive = true;
    const ubicacion = isChaotic ? 'end' : obtenerUbicacionEmote();

    if (!ubicacion) {
      setUbicacionEmote(null);
      setEmoteUrl(null);
      setEmoteCount(1);
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
          setEmoteCount(isChaotic ? Math.floor(Math.random() * 3) + 1 : 1);
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
  }, [message.id, isChaotic]);

  const emoteImages = emoteUrl && !emoteError
    ? Array.from({ length: emoteCount }, (_, index) => (
      <img
        key={`${message.id}-${index}`}
        src={emoteUrl}
        alt={emoteName}
        className={`${index === 0 ? 'ml-2' : 'ml-1'} h-6 w-6 inline-block align-middle`}
        loading="lazy"
      />
    ))
    : null;

  // Línea de mensaje (emblemas + username + contenido) — compartida entre
  // el render normal y el bloque destacado de suscripción
  const messageLine = (
    <>
      {userBadges.map((badge) => (
        <UserBadge key={badge} type={badge} platform={platform} />
      ))}
      <span style={{ color: usernameColor }} className="font-semibold">
        {message.username}
      </span>
      <span className="text-white/40">: </span>
      {emoteUrl && !emoteError && ubicacionEmote === 'start' ? (
        emoteImages
      ) : null}
      <span className={`text-white/90 ${isChaotic ? 'whitespace-nowrap' : 'text-pretty'}`}>
        {message.content}
      </span>
      {emoteUrl && !emoteError && ubicacionEmote === 'end' ? (
        emoteImages
      ) : null}
    </>
  );

  // Render destacado: suscripción simulada con su mensaje adjunto
  if (message.sub) {
    const subBgColor = SUB_BG_COLORS[hashUsername(message.id) % SUB_BG_COLORS.length];

    return (
      <div className="hover:bg-white/5 transition-colors group py-1" title={timestamp}>
        <div
          className={`${fontSizeClass} leading-relaxed px-3 py-2 border-l-4`}
          style={{ backgroundColor: subBgColor, borderLeftColor: SUB_ACCENT_COLOR }}
        >
          {/* Encabezado: corona + username */}
          <div className="flex items-center gap-2">
            <SubCrownIcon />
            <span style={{ color: usernameColor }} className="font-bold">
              {message.username}
            </span>
          </div>

          {/* Texto de la suscripción */}
          <p className="text-white/90 mt-0.5">
            <span className="font-bold">se suscribió</span>
            {' con '}
            <span className="text-[#A970FF] underline">{message.sub.tier}</span>
            {'. '}
            {message.sub.months > 1 ? (
              <>¡Se suscribió por <span className="font-bold">{message.sub.months} meses</span>!</>
            ) : (
              <>¡Es su <span className="font-bold">primer mes</span>!</>
            )}
          </p>

          {/* Mensaje que acompaña a la sub */}
          <div className="mt-1.5">{messageLine}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center hover:bg-white/5 transition-colors group" title={timestamp}>
      {/* Emblemas + username + message */}
      <div
        className={`flex-1 min-w-0 ${fontSizeClass} leading-relaxed px-2 py-2 transition-colors group-hover:bg-white/10 ${
          isAlternate ? '' : 'bg-black/20'
        }`}
      >
        {messageLine}
      </div>
    </div>
  );
}

const ChatMessage = memo(ChatMessageComponent, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.personality === next.message.personality &&
    prev.isAlternate === next.isAlternate &&
    prev.startTime === next.startTime &&
    prev.platform === next.platform
  );
});

export default ChatMessage;
