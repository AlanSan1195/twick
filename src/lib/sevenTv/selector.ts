/**
 * Selector puro de emotes. No importa tipos del runtime de la aplicación para
 * poder probarse directamente con el runner integrado de Node.
 */

export type SevenTvMessageCategory = 'gameplay' | 'reactions' | 'questions' | 'comments';
export type SevenTvPersonality = 'sarcastic' | 'normal' | 'curious' | 'chaotic' | 'chill';

export interface SevenTvSelectionMessage {
  content: string;
  category: SevenTvMessageCategory;
  personality: SevenTvPersonality;
  sub?: { months: number; tier: string };
}

export interface SevenTvCatalogEmote {
  id: string;
  name: string;
  setId: string;
  imageUrl: string;
}

export interface SevenTvSetCatalog {
  setId: string;
  emotes: SevenTvCatalogEmote[];
}

export interface SevenTvSelectionState {
  recentIds: string[];
  consecutiveWithEmotes: number;
  consecutiveWithoutEmotes: number;
}

export interface SelectedSevenTvEmote {
  id: string;
  name: string;
  url: string;
  position: 'start' | 'end';
}

export interface SevenTvSelectionResult {
  emotes: SelectedSevenTvEmote[];
  nextState: SevenTvSelectionState;
}

const BASE_PROBABILITY: Record<SevenTvMessageCategory, number> = {
  questions: 0.2,
  gameplay: 0.3,
  comments: 0.35,
  reactions: 0.55,
};

const MAX_RECENT_IDS = 20;

const INTENT_GROUPS: readonly (readonly string[])[] = [
  ['jaja', 'jajaja', 'jajajaja', 'jeje', 'jejeje', 'haha', 'hahaha', 'lol', 'lmao', 'laugh', 'laughing', 'risas', 'risa', 'kekw', 'xd'],
  ['hype', 'celebracion', 'celebration', 'celebrar', 'celebrate', 'fiesta', 'party', 'victoria', 'victory', 'letsgo', 'vamos', 'pog', 'poggers', 'aplausos', 'clap', 'clapping'],
  ['sorpresa', 'sorprendido', 'sorprendida', 'surprise', 'surprised', 'shock', 'shocked', 'miedo', 'fear', 'scared', 'asustado', 'asustada', 'horror', 'omg', 'wow'],
  ['triste', 'tristeza', 'sad', 'sadness', 'llorar', 'llorando', 'cry', 'crying', 'decepcion', 'disappointment', 'disappointed', 'rip', 'f'],
  ['duda', 'confusion', 'confused', 'confuso', 'confundido', 'pregunta', 'question', 'hmm', 'thinking', 'pensando', 'noentiendo', 'what'],
];

function normalizeWords(value: string): Set<string> {
  const camelExpanded = value.replace(/([a-záéíóúñ])([A-Z])/g, '$1 $2');
  const normalized = camelExpanded
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US');
  return new Set(normalized.match(/[a-z0-9]+/g) ?? []);
}

function getAffinityScore(messageWords: Set<string>, emote: SevenTvCatalogEmote): number {
  const emoteWords = normalizeWords(emote.name);
  let sharedWords = 0;
  for (const word of emoteWords) {
    if (messageWords.has(word)) sharedWords += 1;
  }

  let sharedIntentGroups = 0;
  for (const group of INTENT_GROUPS) {
    const messageMatches = group.some((word) => messageWords.has(word));
    const emoteMatches = group.some((word) => emoteWords.has(word));
    if (messageMatches && emoteMatches) sharedIntentGroups += 1;
  }

  return sharedWords * 2 + sharedIntentGroups;
}

function getInclusionProbability(
  message: SevenTvSelectionMessage,
  state: SevenTvSelectionState,
): number {
  let probability = message.sub
    ? 0.1
    : BASE_PROBABILITY[message.category];

  if (message.personality === 'chaotic') probability += 0.15;
  if (message.personality === 'chill') probability -= 0.1;
  if (state.consecutiveWithEmotes >= 2) probability -= 0.2;
  if (state.consecutiveWithoutEmotes >= 4) probability += 0.1;

  return Math.min(0.75, Math.max(0.1, probability));
}

function pickIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function getUniqueCandidates(catalogs: SevenTvSetCatalog[]): SevenTvCatalogEmote[] {
  const seenIds = new Set<string>();
  const candidates: SevenTvCatalogEmote[] = [];

  for (const catalog of catalogs) {
    for (const emote of catalog.emotes) {
      if (
        !emote.id || !emote.name || !emote.imageUrl ||
        seenIds.has(emote.id)
      ) {
        continue;
      }
      seenIds.add(emote.id);
      candidates.push(emote);
    }
  }

  return candidates;
}

function chooseCandidate(
  candidates: SevenTvCatalogEmote[],
  messageWords: Set<string>,
  random: () => number,
): SevenTvCatalogEmote | undefined {
  if (candidates.length === 0) return undefined;

  const scored = candidates.map((emote) => ({
    emote,
    score: getAffinityScore(messageWords, emote),
  }));
  const maximumScore = Math.max(...scored.map(({ score }) => score));
  const eligible = maximumScore > 0
    ? scored.filter(({ score }) => score === maximumScore)
    : scored;

  const bySet = new Map<string, SevenTvCatalogEmote[]>();
  for (const { emote } of eligible) {
    const setEmotes = bySet.get(emote.setId) ?? [];
    setEmotes.push(emote);
    bySet.set(emote.setId, setEmotes);
  }

  const sets = [...bySet.values()];
  const selectedSet = sets[pickIndex(sets.length, random)];
  return selectedSet[pickIndex(selectedSet.length, random)];
}

function getNextState(
  state: SevenTvSelectionState,
  selected: SelectedSevenTvEmote[],
): SevenTvSelectionState {
  if (selected.length === 0) {
    return {
      recentIds: state.recentIds.slice(-MAX_RECENT_IDS),
      consecutiveWithEmotes: 0,
      consecutiveWithoutEmotes: state.consecutiveWithoutEmotes + 1,
    };
  }

  return {
    recentIds: [...state.recentIds, ...selected.map(({ id }) => id)].slice(-MAX_RECENT_IDS),
    consecutiveWithEmotes: state.consecutiveWithEmotes + 1,
    consecutiveWithoutEmotes: 0,
  };
}

/** Elige emotes de forma reproducible al inyectar una función `random`. */
export function selectSevenTvEmotes(
  message: SevenTvSelectionMessage,
  catalogs: SevenTvSetCatalog[],
  state: SevenTvSelectionState,
  random: () => number,
): SevenTvSelectionResult {
  const candidates = getUniqueCandidates(catalogs);
  const noEmotes = (): SevenTvSelectionResult => ({ emotes: [], nextState: getNextState(state, []) });

  // Sin catálogo usable, el mensaje cuenta como mensaje sin emote real.
  if (candidates.length === 0) return noEmotes();
  if (random() >= getInclusionProbability(message, state)) return noEmotes();

  let requestedCount = 1;
  if (message.personality === 'chaotic') {
    const countRoll = random();
    requestedCount = countRoll < 0.7 ? 1 : countRoll < 0.95 ? 2 : 3;
  }

  const selected: SelectedSevenTvEmote[] = [];
  const selectedIds = new Set<string>();
  const messageWords = normalizeWords(message.content);

  while (selected.length < requestedCount && selected.length < candidates.length) {
    const remaining = candidates.filter(({ id }) => !selectedIds.has(id));
    const nonRecent = remaining.filter(({ id }) => !state.recentIds.includes(id));
    const eligible = nonRecent.length > 0 ? nonRecent : remaining;
    const chosen = chooseCandidate(eligible, messageWords, random);
    if (!chosen) break;

    selectedIds.add(chosen.id);
    selected.push({
      id: chosen.id,
      name: chosen.name,
      url: chosen.imageUrl,
      position: random() < 0.3 ? 'start' : 'end',
    });
  }

  return { emotes: selected, nextState: getNextState(state, selected) };
}
