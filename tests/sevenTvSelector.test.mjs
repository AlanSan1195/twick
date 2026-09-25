import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSevenTvEmotes } from '../src/lib/sevenTv/selector.ts';

const emptyState = () => ({ recentIds: [], consecutiveWithEmotes: 0, consecutiveWithoutEmotes: 0 });
const emote = (id, name) => ({ id, name, imageUrl: `https://cdn.7tv.app/${id}.webp` });
const message = (overrides = {}) => ({ content: 'Hola chat', category: 'comments', personality: 'normal', ...overrides });

function sequenceRandom(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, `random() llamada inesperada en índice ${index}`);
    return values[index++];
  };
}

test('respeta las probabilidades base y el límite exclusivo', () => {
  for (const [category, probability] of [
    ['questions', 0.2], ['gameplay', 0.3], ['comments', 0.35], ['reactions', 0.55],
  ]) {
    const available = [emote('one', 'Kekw')];
    const included = selectSevenTvEmotes(message({ category }), available, emptyState(), sequenceRandom([probability - 0.001, 0, 0.3]));
    assert.equal(included.emotes.length, 1, category);
    assert.deepEqual(included.nextState, { recentIds: ['one'], consecutiveWithEmotes: 1, consecutiveWithoutEmotes: 0 });
    const excluded = selectSevenTvEmotes(message({ category }), available, emptyState(), sequenceRandom([probability]));
    assert.deepEqual(excluded.emotes, []);
    assert.equal(excluded.nextState.consecutiveWithoutEmotes, 1);
  }
});

test('sin catálogo cuenta como mensaje sin emote y no sortea', () => {
  const result = selectSevenTvEmotes(message(), [], emptyState(), () => assert.fail('No debe sortear'));
  assert.deepEqual(result.emotes, []);
  assert.equal(result.nextState.consecutiveWithoutEmotes, 1);
});

test('la suscripción y las rachas respetan los límites de 10 % y 75 %', () => {
  const available = [emote('one', 'Kekw')];
  const minMessage = message({ category: 'reactions', personality: 'chaotic', sub: { months: 1, tier: 'Prime' } });
  const withEmotes = { ...emptyState(), consecutiveWithEmotes: 2 };
  assert.equal(selectSevenTvEmotes(minMessage, available, withEmotes, sequenceRandom([0.099, 0, 0, 0.3])).emotes.length, 1);
  assert.equal(selectSevenTvEmotes(minMessage, available, withEmotes, sequenceRandom([0.1])).emotes.length, 0);
  const maxMessage = message({ category: 'reactions', personality: 'chaotic' });
  const withoutEmotes = { ...emptyState(), consecutiveWithoutEmotes: 4 };
  assert.equal(selectSevenTvEmotes(maxMessage, available, withoutEmotes, sequenceRandom([0.749, 0, 0, 0.3])).emotes.length, 1);
  assert.equal(selectSevenTvEmotes(maxMessage, available, withoutEmotes, sequenceRandom([0.75])).emotes.length, 0);
});

test('reconoce acentos, camelCase, coincidencias y grupos de intención', () => {
  const available = [emote('direct', 'Celebración'), emote('laugh', 'KekwLaugh'), emote('other', 'Confused')];
  assert.equal(selectSevenTvEmotes(message({ content: '¡Qué celebracion!' }), available, emptyState(), sequenceRandom([0, 0, 0.3])).emotes[0].id, 'direct');
  assert.equal(selectSevenTvEmotes(message({ content: 'jajajaja' }), available, emptyState(), sequenceRandom([0, 0, 0.3])).emotes[0].id, 'laugh');
});

test('sin afinidad elige entre todos los emotes Top y elimina IDs duplicados', () => {
  const available = [emote('one', 'Kekw'), emote('one', 'Kekw'), emote('two', 'Pog')];
  const result = selectSevenTvEmotes(message({ content: 'sin coincidencias' }), available, emptyState(), sequenceRandom([0, 0.99, 0.3]));
  assert.equal(result.emotes[0].id, 'two');
});

test('evita los últimos 20 IDs y reutiliza uno cuando no quedan otros', () => {
  const state = { ...emptyState(), recentIds: ['recent'] };
  assert.equal(selectSevenTvEmotes(message(), [emote('recent', 'Kekw'), emote('fresh', 'Kekw')], state, sequenceRandom([0, 0, 0.3])).emotes[0].id, 'fresh');
  assert.equal(selectSevenTvEmotes(message(), [emote('recent', 'Kekw')], state, sequenceRandom([0, 0, 0.3])).emotes[0].id, 'recent');
});

test('la personalidad caótica da 1, 2 o 3 IDs distintos y posiciones independientes', () => {
  const available = [emote('one', 'Kekw'), emote('two', 'Pog'), emote('three', 'Wow')];
  const chaotic = message({ category: 'reactions', personality: 'chaotic' });
  const one = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0, 0.699, 0, 0.3]));
  assert.equal(one.emotes.length, 1);
  const two = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0, 0.7, 0, 0.3, 0, 0.2]));
  assert.equal(two.emotes.length, 2);
  assert.equal(new Set(two.emotes.map(({ id }) => id)).size, 2);
  assert.deepEqual(two.emotes.map(({ position }) => position), ['end', 'start']);
  const three = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0, 0.95, 0, 0.3, 0, 0.3, 0, 0.3]));
  assert.equal(three.emotes.length, 3);
  assert.equal(new Set(three.emotes.map(({ id }) => id)).size, 3);
});

test('el estado conserva solo los últimos 20 IDs y reinicia la racha opuesta', () => {
  const recentIds = Array.from({ length: 20 }, (_, index) => `old-${index}`);
  const result = selectSevenTvEmotes(message(), [emote('new', 'Kekw')],
    { recentIds, consecutiveWithEmotes: 3, consecutiveWithoutEmotes: 0 }, sequenceRandom([0, 0, 0.3]));
  assert.equal(result.nextState.recentIds.length, 20);
  assert.equal(result.nextState.recentIds[0], 'old-1');
  assert.equal(result.nextState.recentIds.at(-1), 'new');
  assert.equal(result.nextState.consecutiveWithEmotes, 4);
  assert.equal(result.nextState.consecutiveWithoutEmotes, 0);
});
