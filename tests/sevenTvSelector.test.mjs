import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareChatMessage } from '../src/lib/chatRealism.ts';
import { selectSevenTvEmotes } from '../src/lib/sevenTv/selector.ts';

const emptyState = () => ({ recentIds: [] });
const emote = (id, name) => ({ id, name, imageUrl: `https://cdn.7tv.app/${id}.webp` });
const message = (overrides = {}) => ({
  id: 'message-1', username: 'viewer', content: 'Hola chat', timestamp: 1,
  category: 'comments', personality: 'normal', ...overrides,
});

function sequenceRandom(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, `random() llamada inesperada en índice ${index}`);
    return values[index++];
  };
}

test('el adorno es excluyente: 10 % emoji, 75 % 7TV y 15 % solo texto', () => {
  const emoji = prepareChatMessage(message(), sequenceRandom([0.099, 0.3, 0]));
  assert.equal(emoji.decoration, 'emoji');
  assert.equal(emoji.message.content, 'Hola chat 😄');
  assert.deepEqual(emoji.message.emotes, []);

  for (const roll of [0.1, 0.849]) {
    const result = prepareChatMessage(message(), sequenceRandom([roll, 0.3]));
    assert.equal(result.decoration, 'sevenTv');
    assert.equal(result.message.content, 'Hola chat');
    assert.deepEqual(result.message.emotes, []);
  }

  const plain = prepareChatMessage(message(), sequenceRandom([0.85, 0.3]));
  assert.equal(plain.decoration, 'plain');
  assert.equal(plain.message.content, 'Hola chat');
  assert.deepEqual(plain.message.emotes, []);
});

test('retira emojis previos en todos los modos y conserva texto cuando la frase solo tenía emojis', () => {
  const source = message({ content: 'Qué pasó 👩🏽‍💻❤️ 🇲🇽 1️⃣ <3', emotes: [{ id: 'old' }] });
  const plain = prepareChatMessage(source, sequenceRandom([0.9, 0.3]));
  assert.equal(plain.message.content, 'Qué pasó');
  assert.deepEqual(plain.message.emotes, []);

  const noCatalog = prepareChatMessage(message({ content: '❤️❤️❤️', category: 'reactions' }), sequenceRandom([0.5, 0.3]));
  assert.equal(noCatalog.decoration, 'sevenTv');
  assert.equal(noCatalog.message.content, 'qué locura');
  assert.deepEqual(noCatalog.message.emotes, []);

  const emoji = prepareChatMessage(message({ content: '❤️❤️❤️', category: 'reactions' }), sequenceRandom([0, 0.3, 0]));
  assert.equal(emoji.message.content, 'qué locura 😂');

  const punctuation = prepareChatMessage(message({ content: '😂!!!', category: 'reactions' }), sequenceRandom([0.9, 0.3]));
  assert.equal(punctuation.message.content, 'qué locura');
  const spaced = prepareChatMessage(message({ content: 'Hola 😂!' }), sequenceRandom([0.9, 0.3]));
  assert.equal(spaced.message.content, 'Hola!');
});

test('30 % independiente aplica exactamente una falta leve, puntuación o mayúsculas', () => {
  const base = message({ content: 'Holaaaa chat' });
  assert.equal(prepareChatMessage(base, sequenceRandom([0.9, 0.299, 0, 0, 0])).message.content, 'Hlaaaa chat');
  assert.equal(prepareChatMessage(base, sequenceRandom([0.9, 0.299, 0.4, 0.5])).message.content, 'Holaaaa chat?!');
  assert.equal(prepareChatMessage(base, sequenceRandom([0.9, 0.299, 0.9])).message.content, 'HOLAAAA CHAT');
  assert.equal(prepareChatMessage(base, sequenceRandom([0.9, 0.3])).message.content, 'Holaaaa chat');
});

test('la variación elegida se ve también en mensajes cortos o ya en mayúsculas', () => {
  const short = message({ content: 'GG' });
  assert.equal(prepareChatMessage(short, sequenceRandom([0.9, 0, 0, 0])).message.content, 'GG!');
  assert.equal(prepareChatMessage(short, sequenceRandom([0.9, 0, 0.9, 0.99])).message.content, 'GG <3');
});

test('el selector mantiene afinidad, elimina duplicados y elige entre los Top', () => {
  const catalog = [emote('direct', 'Celebración'), emote('laugh', 'KekwLaugh'), emote('other', 'Confused')];
  assert.equal(selectSevenTvEmotes(message({ content: '¡Qué celebracion!' }), catalog, emptyState(), sequenceRandom([0, 0.3])).emotes[0].id, 'direct');
  assert.equal(selectSevenTvEmotes(message({ content: 'jajajaja' }), catalog, emptyState(), sequenceRandom([0, 0.3])).emotes[0].id, 'laugh');

  const duplicates = [emote('one', 'Kekw'), emote('one', 'Kekw'), emote('two', 'Pog')];
  const result = selectSevenTvEmotes(message({ content: 'sin coincidencias' }), duplicates, emptyState(), sequenceRandom([0.99, 0.3]));
  assert.equal(result.emotes[0].id, 'two');
});

test('evita los últimos 20 IDs, pero reutiliza uno si no hay alternativa', () => {
  const state = { recentIds: ['recent'] };
  assert.equal(selectSevenTvEmotes(message(), [emote('recent', 'Kekw'), emote('fresh', 'Kekw')], state, sequenceRandom([0, 0.3])).emotes[0].id, 'fresh');
  assert.equal(selectSevenTvEmotes(message(), [emote('recent', 'Kekw')], state, sequenceRandom([0, 0.3])).emotes[0].id, 'recent');
});

test('la personalidad caótica da 1, 2 o 3 IDs distintos y posiciones independientes', () => {
  const available = [emote('one', 'Kekw'), emote('two', 'Pog'), emote('three', 'Wow')];
  const chaotic = message({ category: 'reactions', personality: 'chaotic' });
  const one = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0.699, 0, 0.3]));
  assert.equal(one.emotes.length, 1);
  const two = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0.7, 0, 0.3, 0, 0.2]));
  assert.equal(two.emotes.length, 2);
  assert.equal(new Set(two.emotes.map(({ id }) => id)).size, 2);
  assert.deepEqual(two.emotes.map(({ position }) => position), ['end', 'start']);
  const three = selectSevenTvEmotes(chaotic, available, emptyState(), sequenceRandom([0.95, 0, 0.3, 0, 0.3, 0, 0.3, 0, 0.3]));
  assert.equal(three.emotes.length, 3);
  assert.equal(new Set(three.emotes.map(({ id }) => id)).size, 3);
});

test('conserva solo los últimos 20 IDs y permite mensajes sin emote', () => {
  const recentIds = Array.from({ length: 20 }, (_, index) => `old-${index}`);
  const state = { recentIds };
  const selected = selectSevenTvEmotes(message(), [emote('new', 'Kekw')], state, sequenceRandom([0, 0.3]));
  assert.equal(selected.nextState.recentIds.length, 20);
  assert.equal(selected.nextState.recentIds[0], 'old-1');
  assert.equal(selected.nextState.recentIds.at(-1), 'new');
  const plain = prepareChatMessage(message(), sequenceRandom([0.9, 0.3]));
  assert.equal(plain.decoration, 'plain');
});

test('si el catálogo no está disponible, el selector deja el mensaje sin emote', () => {
  const state = emptyState();
  const selected = selectSevenTvEmotes(message(), [], state, () => assert.fail('No debe sortear'));
  assert.deepEqual(selected.emotes, []);
  assert.deepEqual(selected.nextState, state);
});
