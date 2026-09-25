import type { ChatMessage } from '../utils/types';

export type ChatDecoration = 'emoji' | 'sevenTv' | 'plain';

const EMOJI_PROBABILITY = 0.10;
const SEVEN_TV_PROBABILITY = 0.75;
const TEXT_VARIATION_PROBABILITY = 0.30;

const EMOJIS_BY_CATEGORY = {
  gameplay: ['🎮', '🔥', '👏', '💪'],
  reactions: ['😂', '😱', '🙌', '❤️'],
  questions: ['🤔', '🧐', '👀', '😅'],
  comments: ['😄', '👀', '❤️', '😂'],
} as const;

const FALLBACK_TEXT_BY_CATEGORY = {
  gameplay: 'vamos',
  reactions: 'qué locura',
  questions: 'qué opinan?',
  comments: 'qué buen momento',
} as const;

const EXPRESSIVE_ENDINGS = ['!', '!!!', '?!', '<3'] as const;

// Retira pictogramas, secuencias unidas, banderas y keycaps ya presentes en frases de IA o fallback.
const UNICODE_EMOJI = /(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F])?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F])?(?:\p{Emoji_Modifier})?)*)/gu;

function pickIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function cleanContent(message: ChatMessage): string {
  const content = message.content
    .replace(UNICODE_EMOJI, ' ')
    .replace(/<3/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([!?.,;:])/gu, '$1')
    .trim();
  if (/[\p{L}\p{N}]/u.test(content)) return content;
  return message.sub ? 'gracias por el sub' : FALLBACK_TEXT_BY_CATEGORY[message.category];
}

function addExpressiveEnding(content: string, random: () => number): string {
  const ending = EXPRESSIVE_ENDINGS[pickIndex(EXPRESSIVE_ENDINGS.length, random)];
  return `${content.replace(/[!?¡¿.,;:]+$/u, '').trimEnd()}${ending === '<3' ? ' ' : ''}${ending}`;
}

function addSmallTypo(content: string, random: () => number): string | null {
  const candidates = [...content.matchAll(/\p{L}{5,}/gu)];
  if (candidates.length === 0) return null;

  const match = candidates[pickIndex(candidates.length, random)];
  const word = match[0];
  const start = match.index ?? 0;
  const position = 1 + Math.floor(random() * (word.length - 2));
  const misspelled = word.slice(0, position) + word.slice(position + 1);
  return content.slice(0, start) + misspelled + content.slice(start + word.length);
}

function varyText(content: string, random: () => number): string {
  if (random() >= TEXT_VARIATION_PROBABILITY) return content;

  const kind = pickIndex(3, random);
  if (kind === 0) return addSmallTypo(content, random) ?? addExpressiveEnding(content, random);
  if (kind === 1) return addExpressiveEnding(content, random);

  const uppercase = content.toLocaleUpperCase('es');
  return uppercase === content ? addExpressiveEnding(content, random) : uppercase;
}

/** Prepara texto y decide un único adorno antes de enviar cada mensaje por SSE. */
export function prepareChatMessage(
  message: ChatMessage,
  random: () => number,
): { message: ChatMessage; decoration: ChatDecoration } {
  const modeRoll = random();
  const content = varyText(cleanContent(message), random);
  const plainMessage = { ...message, content, emotes: [] };

  if (modeRoll < EMOJI_PROBABILITY) {
    const emojis = EMOJIS_BY_CATEGORY[message.category];
    const emoji = emojis[pickIndex(emojis.length, random)];
    return { message: { ...plainMessage, content: `${content} ${emoji}` }, decoration: 'emoji' };
  }

  if (modeRoll < EMOJI_PROBABILITY + SEVEN_TV_PROBABILITY) {
    return { message: plainMessage, decoration: 'sevenTv' };
  }

  return { message: plainMessage, decoration: 'plain' };
}
