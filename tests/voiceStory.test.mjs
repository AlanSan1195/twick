import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendVoiceStoryTurn,
  clearVoiceStory,
  createEmptyVoiceStory,
  isKnownReferencedMessage,
  sanitizeVoiceStory,
  VOICE_STORY_LIMITS,
} from '../src/lib/voiceStory.ts';

const message = (id, content, username = 'viewer') => ({ id, content, username });

const turn = (overrides = {}) => ({
  sequence: 0,
  transcript: '¿Cuál prefieren?',
  topic: 'GTA San Andreas vs GTA V',
  intent: 'opinion',
  relation: 'new_topic',
  emotion: 'curious',
  referencedMessageId: null,
  chatMessages: [message('chat-1', 'yo voto por San Andreas')],
  beat: 'El chat compara los dos juegos.',
  timestamp: 1,
  ...overrides,
});

test('crea y limpia una historia vacía', () => {
  const empty = createEmptyVoiceStory();
  assert.deepEqual(empty, {
    summary: '',
    activeTopic: null,
    previousTopics: [],
    recentTurns: [],
  });
  assert.deepEqual(clearVoiceStory(), empty);
});

test('sanitiza campos, elimina turnos inválidos y aplica límites', () => {
  const longText = 'x'.repeat(1_000);
  const raw = {
    summary: longText,
    activeTopic: longText,
    previousTopics: ['Minecraft', 'minecraft', longText, 'GTA V', 'Fútbol', 'Tesla'],
    recentTurns: [
      { transcript: '', intent: 'opinion', chatMessages: [] },
      turn({
        sequence: 3,
        transcript: longText,
        chatMessages: Array.from({ length: 20 }, (_, index) => message(`m-${index}`, longText)),
      }),
    ],
  };

  const sanitized = sanitizeVoiceStory(raw);
  assert.equal(sanitized.summary.length, VOICE_STORY_LIMITS.maxSummaryLength);
  assert.equal(sanitized.activeTopic.length, VOICE_STORY_LIMITS.maxTopicLength);
  assert.equal(sanitized.previousTopics.length, 4);
  assert.equal(sanitized.recentTurns.length, 1);
  assert.equal(sanitized.recentTurns[0].transcript.length, VOICE_STORY_LIMITS.maxTranscriptLength);
  assert.equal(sanitized.recentTurns[0].chatMessages.length, VOICE_STORY_LIMITS.maxMessagesPerTurn);
  assert.equal(sanitized.recentTurns[0].chatMessages[0].content.length, VOICE_STORY_LIMITS.maxMessageLength);
});

test('agrega turnos sin mutar el estado y conserva solo los más recientes', () => {
  let state = createEmptyVoiceStory();
  const original = state;

  for (let index = 0; index < VOICE_STORY_LIMITS.maxTurns + 2; index += 1) {
    state = appendVoiceStoryTurn(state, turn({
      sequence: index,
      topic: `Tema ${index}`,
      chatMessages: [message(`chat-${index}`, `respuesta ${index}`)],
    }));
  }

  assert.deepEqual(original, createEmptyVoiceStory());
  assert.equal(state.recentTurns.length, VOICE_STORY_LIMITS.maxTurns);
  assert.equal(state.recentTurns[0].sequence, 2);
  assert.equal(state.recentTurns.at(-1).sequence, 7);
  assert.equal(state.activeTopic, 'Tema 7');
});

test('guarda el tema anterior al cambiar de tema y no duplica temas', () => {
  const first = appendVoiceStoryTurn(createEmptyVoiceStory(), turn({ topic: 'GTA V' }));
  const second = appendVoiceStoryTurn(first, turn({
    sequence: 1,
    topic: 'Minecraft',
    relation: 'topic_shift',
  }));
  const third = appendVoiceStoryTurn(second, turn({
    sequence: 2,
    topic: 'GTA V',
    relation: 'topic_shift',
  }));

  assert.equal(second.activeTopic, 'Minecraft');
  assert.deepEqual(second.previousTopics, ['GTA V']);
  assert.equal(third.activeTopic, 'GTA V');
  assert.deepEqual(third.previousTopics, ['Minecraft']);
});

test('usa el resumen de IA cuando existe y genera un resumen provisional si no existe', () => {
  const first = appendVoiceStoryTurn(createEmptyVoiceStory(), turn(), 'Resumen generado por IA.');
  assert.equal(first.summary, 'Resumen generado por IA.');

  const second = appendVoiceStoryTurn(first, turn({ sequence: 1, beat: 'El streamer pide una explicación.' }));
  assert.equal(second.summary, 'Resumen generado por IA. El streamer pide una explicación.');
});

test('no agrega ruido, turnos sin mensajes ni intenciones none', () => {
  const state = appendVoiceStoryTurn(createEmptyVoiceStory(), turn({
    transcript: 'ruido',
    intent: 'none',
  }));
  assert.deepEqual(state, createEmptyVoiceStory());

  const noMessages = appendVoiceStoryTurn(createEmptyVoiceStory(), turn({
    chatMessages: [],
  }));
  assert.deepEqual(noMessages, createEmptyVoiceStory());
});

test('detecta referencias solamente dentro de los mensajes guardados', () => {
  const state = appendVoiceStoryTurn(createEmptyVoiceStory(), turn());
  assert.equal(isKnownReferencedMessage(state, 'chat-1'), true);
  assert.equal(isKnownReferencedMessage(state, 'missing'), false);
  assert.equal(isKnownReferencedMessage(state, '  '), false);
});

test('una referencia a un mensaje conserva su identificador al sanitizar', () => {
  const state = sanitizeVoiceStory({
    ...createEmptyVoiceStory(),
    recentTurns: [turn({ referencedMessageId: 'chat-1' })],
  });

  assert.equal(state.recentTurns[0].referencedMessageId, 'chat-1');
  assert.equal(isKnownReferencedMessage(state, state.recentTurns[0].referencedMessageId), true);
});
