import test from 'node:test';
import assert from 'node:assert/strict';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const image = (id, width, mime = 'image/webp', host = 'cdn.7tv.app') => ({
  url: `https://${host}/emote/${id}/${width}x.webp`, mime, width, height: width, scale: 1,
});
const item = (id, name, images = [image(id, 64)]) => ({ id, defaultName: name, images });
const payload = (items) => ({ data: { emotes: { search: { items } } } });
const response = (data) => ({ ok: true, json: async () => data });
const freshModule = (id) => import(`../src/lib/sevenTv/catalog.ts?test=${id}`);

test('consulta Top 100 por GraphQL una vez y normaliza WebP, CDN e IDs', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return response(payload([
        item('one', 'GIGACHAD', [
          image('one', 32),
          { ...image('one', 64), url: 'https://cdn.7tv.app/emote/one/64x_static.webp' },
          image('one', 64),
          image('one', 48, 'image/png'),
        ]),
        item('one', 'Duplicado'),
        item('bad', 'Externos', [image('bad', 48, 'image/webp', 'evil.example')]),
        item('two', 'NOOOO'),
      ]));
    };
    const { getSevenTvCatalogSnapshot } = await freshModule('normalizacion');
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://7tv.io/v4/gql');
    assert.equal(calls[0].options.method, 'POST');
    const { query } = JSON.parse(calls[0].options.body);
    assert.match(query, /TOP_ALL_TIME/);
    assert.match(query, /perPage: 100/);
    await settle();
    assert.deepEqual(getSevenTvCatalogSnapshot().map(({ id }) => id), ['one', 'two']);
    assert.match(getSevenTvCatalogSnapshot()[0].imageUrl, /one\/64x\.webp$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mantiene datos anteriores durante un fallo y aplica cooldown sin bloquear snapshots', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1;
  let calls = 0;
  try {
    Date.now = () => now;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls > 1) throw new Error('sin conexión');
      return response(payload([item('one', 'GIGACHAD')]));
    };
    const { getSevenTvCatalogSnapshot } = await freshModule('stale');
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    await settle();
    assert.equal(getSevenTvCatalogSnapshot().length, 1);
    now += 15 * 60 * 1000;
    assert.equal(getSevenTvCatalogSnapshot().length, 1);
    await settle();
    assert.equal(calls, 2);
    assert.equal(getSevenTvCatalogSnapshot().length, 1);
    assert.equal(calls, 2);
    now += 60 * 60 * 1000;
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    await settle();
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('rechaza errores GraphQL y no incorpora una respuesta vacía', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return response({ errors: [{ message: 'falló' }], ...payload([item('one', 'GIGACHAD')]) });
    };
    const { getSevenTvCatalogSnapshot } = await freshModule('graphql-error');
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    await settle();
    assert.deepEqual(getSevenTvCatalogSnapshot(), []);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
