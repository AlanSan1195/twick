import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSevenTvEmotes } from '../src/lib/sevenTv/selector.ts';

const emptyState = () => ({
  recentIds: [],
  consecutiveWithEmotes: 0,
  consecutiveWithoutEmotes: 0,
});

const emote = (id, name, setId = 'set-a') => ({
  id,
  name,
  setId,
  imageUrl: `https://cdn.7tv.app/${id}.webp`,
});

const catalog = (...emotes) => [{ setId: emotes[0]?.setId ?? 'set-a', emotes }];

const message = (overrides = {}) => ({
  content: 'Hola chat',
  category: 'comments',
  personality: 'normal',
  ...overrides,
});

function sequenceRandom(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, `random() llamada inesperada en índice ${index}`);
    return values[index++];
  };
}

test('usa el límite inferior de inclusión y actualiza el estado según emotes reales', () => {
  const available = catalog(emote('one', 'Kekw'));
  const included = selectSevenTvEmotes(message(), available, emptyState(), sequenceRandom([0.349, 0, 0, 0.3]));
  assert.equal(included.emotes.length, 1);
  assert.deepEqual(included.nextState, {
    recentIds: ['one'],
    consecutiveWithEmotes: 1,
    consecutiveWithoutEmotes: 0,
  });

  const excluded = selectSevenTvEmotes(message(), available, emptyState(), sequenceRandom([0.35]));
  assert.deepEqual(excluded.emotes, []);
  assert.equal(excluded.nextState.consecutiveWithoutEmotes, 1);
  assert.equal(excluded.nextState.consecutiveWithEmotes, 0);
});

test('cada categoría usa su probabilidad base con un límite exclusivo', () => {
  const available = catalog(emote('one', 'Kekw'));
  const thresholds = [
    ['questions', 0.2],
    ['gameplay', 0.3],
    ['comments', 0.35],
    ['reactions', 0.55],
  ];

  for (const [category, probability] of thresholds) {
    const justBelow = selectSevenTvEmotes(
      message({ category }),
      available,
      emptyState(),
      sequenceRandom([probability - 0.001, 0, 0, 0.3]),
    );
    assert.equal(justBelow.emotes.length, 1, `${category}: debe incluir justo debajo del umbral`);

    const atBoundary = selectSevenTvEmotes(
      message({ category }),
      available,
      emptyState(),
      sequenceRandom([probability]),
    );
    assert.equal(atBoundary.emotes.length, 0, `${category}: el umbral exacto debe excluir`);
  }
});

test('un catálogo vacío cuenta como mensaje sin emote y no consulta random', () => {
  const result = selectSevenTvEmotes(message(), [], emptyState(), () => {
    assert.fail('no debe sortear sin candidatos');
  });
  assert.deepEqual(result.emotes, []);
  assert.equal(result.nextState.consecutiveWithoutEmotes, 1);
});

test('la suscripción tiene prioridad y los ajustes de personalidad y rachas se limitan al rango definido', () => {
  const available = catalog(emote('one', 'Kekw'));
  const state = { recentIds: [], consecutiveWithEmotes: 2, consecutiveWithoutEmotes: 0 };
  // Sub 10% + chaotic 15% - racha con emotes 20% llega al mínimo de 10%.
  const included = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic', sub: { months: 1, tier: 'Prime' } }),
    available,
    state,
    sequenceRandom([0.099, 0, 0, 0, 0.3]),
  );
  assert.equal(included.emotes.length, 1);

  const excludedAtBoundary = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic', sub: { months: 1, tier: 'Prime' } }),
    available,
    state,
    sequenceRandom([0.1]),
  );
  assert.deepEqual(excludedAtBoundary.emotes, []);

  const maximumClamp = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic' }),
    available,
    { ...emptyState(), consecutiveWithoutEmotes: 4 },
    sequenceRandom([0.749, 0, 0, 0, 0.3]),
  );
  assert.equal(maximumClamp.emotes.length, 1);

  const maximumBoundary = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic' }),
    available,
    { ...emptyState(), consecutiveWithoutEmotes: 4 },
    sequenceRandom([0.75]),
  );
  assert.deepEqual(maximumBoundary.emotes, []);
});

test('aplica camelCase, acentos, coincidencia directa y grupos de intención', () => {
  const available = catalog(
    emote('direct', 'Celebración'),
    emote('group', 'KekwLaugh'),
    emote('other', 'Confused'),
  );
  const direct = selectSevenTvEmotes(
    message({ content: '¡Qué celebracion tan buena!' }),
    available,
    emptyState(),
    sequenceRandom([0, 0, 0, 0.3]),
  );
  assert.equal(direct.emotes[0].id, 'direct');

  const intentGroup = selectSevenTvEmotes(
    message({ content: 'jajajaja' }),
    available,
    emptyState(),
    sequenceRandom([0, 0, 0, 0.3]),
  );
  assert.equal(intentGroup.emotes[0].id, 'group');
});

test('usa fallback aleatorio sin afinidad y reparte primero entre sets elegibles', () => {
  const sets = [
    { setId: 'set-a', emotes: [emote('a', 'Kekw', 'set-a')] },
    { setId: 'set-b', emotes: [emote('b', 'Kekw', 'set-b')] },
  ];
  const fair = selectSevenTvEmotes(
    message({ content: 'jajaja' }),
    sets,
    emptyState(),
    sequenceRandom([0, 0.99, 0, 0.3]),
  );
  assert.equal(fair.emotes[0].id, 'b');

  const fallback = selectSevenTvEmotes(
    message({ content: 'sin coincidencias' }),
    sets,
    emptyState(),
    sequenceRandom([0, 0.99, 0, 0.3]),
  );
  assert.equal(fallback.emotes[0].id, 'b');
});

test('evita los últimos 20 IDs y permite reutilizarlos si son los únicos disponibles', () => {
  const sets = [{
    setId: 'set-a',
    emotes: [emote('recent', 'Kekw'), emote('fresh', 'Kekw')],
  }];
  const result = selectSevenTvEmotes(
    message(),
    sets,
    { ...emptyState(), recentIds: ['recent'] },
    sequenceRandom([0, 0, 0, 0.3]),
  );
  assert.equal(result.emotes[0].id, 'fresh');

  const onlyRecent = selectSevenTvEmotes(
    message(),
    catalog(emote('recent', 'Kekw')),
    { ...emptyState(), recentIds: ['recent'] },
    sequenceRandom([0, 0, 0, 0.3]),
  );
  assert.equal(onlyRecent.emotes[0].id, 'recent');
});

test('la selección caótica respeta límites de distribución, posiciones y unicidad', () => {
  const available = catalog(emote('one', 'Kekw'), emote('two', 'Pog'), emote('three', 'Wow'));
  const two = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic' }),
    available,
    emptyState(),
    sequenceRandom([0, 0.7, 0, 0, 0.3, 0, 0.3, 0, 0, 0.3]),
  );
  assert.equal(two.emotes.length, 2);
  assert.notEqual(two.emotes[0].id, two.emotes[1].id);
  assert.deepEqual(two.emotes.map(({ position }) => position), ['end', 'start']);

  const one = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic' }),
    available,
    emptyState(),
    sequenceRandom([0, 0.699, 0, 0, 0.3]),
  );
  assert.equal(one.emotes.length, 1);

  const three = selectSevenTvEmotes(
    message({ category: 'reactions', personality: 'chaotic' }),
    available,
    emptyState(),
    sequenceRandom([0, 0.95, 0, 0, 0.3, 0, 0, 0.3, 0, 0, 0.3]),
  );
  assert.equal(three.emotes.length, 3);
  assert.equal(new Set(three.emotes.map(({ id }) => id)).size, 3);
});

test('el estado conserva un máximo de 20 IDs y reinicia la racha opuesta', () => {
  const recentIds = Array.from({ length: 20 }, (_, index) => `old-${index}`);
  const result = selectSevenTvEmotes(
    message(),
    catalog(emote('new', 'Kekw')),
    { recentIds, consecutiveWithEmotes: 3, consecutiveWithoutEmotes: 0 },
    sequenceRandom([0, 0, 0, 0.3]),
  );
  assert.equal(result.nextState.recentIds.length, 20);
  assert.equal(result.nextState.recentIds[0], 'old-1');
  assert.equal(result.nextState.recentIds.at(-1), 'new');
  assert.equal(result.nextState.consecutiveWithEmotes, 4);
  assert.equal(result.nextState.consecutiveWithoutEmotes, 0);
});
