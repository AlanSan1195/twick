import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceReactionRequest,
  isVoiceNoise,
  mentionsActiveGameplay,
  parseVoiceAnalysis,
} from '../src/lib/ai/voiceReactionLogic.ts';

const messages = [
  'Por aquí todo bien',
  'Yo ando con sueño',
  'Hoy va tranquilo',
  'Bien, gracias por preguntar',
  'Acabo de llegar',
  'Contento de estar aquí',
];

const emptyStory = () => ({
  summary: '',
  activeTopic: null,
  previousTopics: [],
  recentTurns: [],
});

const context = (story, overrides = {}) => ({
  activeGame: 'GTA 5',
  spokenTopic: story.activeTopic,
  recentTurns: [],
  story,
  ...overrides,
});

const analysis = (overrides = {}) => ({
  topic: null,
  intent: 'casual',
  relation: 'new_topic',
  emotion: 'neutral',
  referencedMessageId: null,
  confidence: 0.9,
  usesPreviousTopic: false,
  storyBeat: 'El streamer saluda al chat.',
  storySummary: 'El chat conversa con el streamer.',
  messages,
  ...overrides,
});

const previousTurn = (chatMessages = []) => ({
  sequence: 0,
  transcript: '¿Qué opinan de GTA 5?',
  topic: 'GTA 5',
  intent: 'opinion',
  relation: 'new_topic',
  emotion: 'curious',
  referencedMessageId: null,
  chatMessages: chatMessages.map((content, index) => ({ id: `chat-${index}`, username: 'viewer', content })),
  beat: 'El chat comenta GTA 5.',
  timestamp: 1,
});

test('el primer saludo no recibe contexto del juego y descarta un tema alucinado', () => {
  const story = emptyStory();
  const request = buildVoiceReactionRequest(
    '¿Cómo están?',
    context(story),
    story,
    [],
    'game',
    'normal',
    { gameplay: ['frase secreta del juego'], questions: [], comments: [] },
  );
  assert.doesNotMatch(request.systemPrompt, /frase secreta del juego|uff juegazo/);
  assert.doesNotMatch(request.userPrompt, /GTA 5|Juego activo relevante|Modo de transmisión/);
  assert.match(request.userPrompt, /saludo social/);

  const result = parseVoiceAnalysis(analysis({ topic: 'GTA 5', intent: 'opinion' }), '¿Cómo están?', story, null);
  assert.equal(result.topic, null);
  assert.equal(result.intent, 'casual');
  assert.deepEqual(result.messages, messages);
});

test('un saludo con historia previa tampoco recibe ese tema ni acepta respuestas sobre juegos', () => {
  const story = {
    ...emptyStory(),
    summary: 'El chat conversaba sobre GTA 5.',
    activeTopic: 'GTA 5',
    recentTurns: [previousTurn(['el chat se va a encender'])],
  };
  const request = buildVoiceReactionRequest('¿Cómo están?', context(story), story, [], 'game', 'normal');
  assert.deepEqual(request.storyForPrompt.recentTurns, []);
  assert.equal(request.storyForPrompt.activeTopic, null);
  assert.doesNotMatch(request.userPrompt, /GTA 5|el chat se va a encender/);

  const result = parseVoiceAnalysis(analysis({
    topic: 'GTA 5',
    intent: 'opinion',
    messages: [
      'uff juegazo', 'ese sí tiene historia', 'yo sí le entro',
      'qué buena conversación', 'hay opiniones divididas', 'el chat se va a encender',
    ],
  }), '¿Cómo están?', story, 'GTA 5');
  assert.equal(result.topic, null);
  assert.equal(result.intent, 'casual');
  assert.equal(result.messages.length, 6);
  assert.doesNotMatch(result.messages.join(' '), /gta|juego|stream|juegazo|encender/i);
  assert.ok(result.messages.every((message) => message !== 'el chat se va a encender'));
});

test('un juego nuevo desplaza el juego activo sin introducir sus frases', () => {
  const story = { ...emptyStory(), activeTopic: 'GTA 5', recentTurns: [previousTurn(['Los coches vuelan'])] };
  const transcript = '¿Ya jugaron el nuevo juego de Control Resonant?';
  const request = buildVoiceReactionRequest(
    transcript,
    context(story),
    story,
    [],
    'game',
    'normal',
    { gameplay: ['frase secreta del juego activo'], questions: [], comments: [] },
  );
  assert.equal(mentionsActiveGameplay(transcript, 'GTA 5'), false);
  assert.doesNotMatch(request.userPrompt, /Juego activo relevante/);
  assert.doesNotMatch(request.systemPrompt, /frase secreta del juego activo/);
  assert.match(request.userPrompt, /Control Resonant/);
  assert.match(request.userPrompt, /juego nuevo/);

  const result = parseVoiceAnalysis(analysis({
    topic: 'Control Resonant',
    intent: 'question',
    relation: 'topic_shift',
    messages: [
      'Todavía no lo pruebo', 'Me da curiosidad', '¿Ya salió?',
      'No conozco ese título', 'Cuéntanos cómo se juega', 'Me interesa verlo',
    ],
  }), transcript, story, 'GTA 5');
  assert.equal(result.topic, 'Control Resonant');
  assert.equal(result.relation, 'topic_shift');
  assert.equal(result.messages.length, 6);
});

test('una queja al chat conserva la referencia colectiva sin inventar un ID ni un tema', () => {
  const story = {
    ...emptyStory(),
    activeTopic: 'GTA 5',
    recentTurns: [previousTurn(['el chat se va a encender'])],
  };
  const transcript = 'Vuelven a responder siempre lo mismo todos ustedes';
  const request = buildVoiceReactionRequest(transcript, context(story), story, [], 'game', 'normal');
  assert.match(request.userPrompt, /el chat se va a encender/);
  assert.doesNotMatch(request.userPrompt, /Juego activo relevante/);
  assert.match(request.userPrompt, /cuestiona las respuestas previas/);

  const result = parseVoiceAnalysis(analysis({
    topic: null,
    intent: 'reaction',
    relation: 'none',
    referencedMessageId: 'id-inventado',
    emotion: 'frustrated',
    messages: [
      'Tienes razón, sonamos repetidos', 'Perdón, cambiemos el tono',
      'Me quedé pegado en esa idea', 'Quiero responderte en serio',
      'Se nos acabó la creatividad', 'Hablemos de lo que preguntaste',
    ],
  }), transcript, story, 'GTA 5');
  assert.equal(result.topic, null);
  assert.equal(result.relation, 'reply_to_chat');
  assert.equal(result.referencedMessageId, null);
  assert.equal(result.messages.length, 6);
});

test('la queja colectiva recibe seis respuestas aunque la IA devuelva mensajes vacíos', () => {
  const story = {
    ...emptyStory(),
    activeTopic: 'GTA 5',
    recentTurns: [previousTurn(['Tienes razón, nos repetimos', 'el chat se va a encender'])],
  };
  const transcript = 'Vuelven a responder siempre lo mismo todos ustedes';
  const result = parseVoiceAnalysis(analysis({
    topic: null,
    intent: 'none',
    relation: 'none',
    messages: [],
  }), transcript, story, 'GTA 5');
  assert.equal(result.topic, null);
  assert.equal(result.intent, 'reaction');
  assert.equal(result.relation, 'reply_to_chat');
  assert.equal(result.referencedMessageId, null);
  assert.equal(result.messages.length, 6);
  assert.doesNotMatch(result.messages.join(' '), /gta|juego|stream/i);
  assert.ok(result.messages.every((message) => !story.recentTurns[0].chatMessages.some((previous) => previous.content === message)));

  const withoutHistory = parseVoiceAnalysis(analysis({ intent: 'none', messages: [] }), transcript, emptyStory(), null);
  assert.deepEqual(withoutHistory.messages, []);
});

test('el respaldo de saludo evita copiar las seis respuestas de turnos recientes', () => {
  let story = emptyStory();
  for (let sequence = 0; sequence < 8; sequence += 1) {
    const prior = new Set(story.recentTurns.flatMap((turn) => turn.chatMessages.map((message) => message.content)));
    const result = parseVoiceAnalysis(analysis({ intent: 'none', messages: [] }), '¿Cómo están?', story, null);
    assert.equal(result.messages.length, 6);
    assert.ok(result.messages.every((message) => !prior.has(message)));
    story = {
      ...story,
      recentTurns: [...story.recentTurns, { ...previousTurn(result.messages), sequence }].slice(-6),
    };
  }
});

test('hablar del mismo juego con ustedes no se interpreta como queja al chat', () => {
  const story = { ...emptyStory(), activeTopic: 'GTA 5' };
  const transcript = '¿Ustedes prefieren el mismo juego, GTA 5?';
  const request = buildVoiceReactionRequest(transcript, context(story), story, [], 'game', 'normal');
  assert.doesNotMatch(request.userPrompt, /cuestiona las respuestas previas/);

  const result = parseVoiceAnalysis(analysis({
    topic: 'GTA 5',
    intent: 'opinion',
    relation: 'follow_up',
  }), transcript, story, 'GTA 5');
  assert.equal(result.topic, 'GTA 5');
  assert.equal(result.relation, 'follow_up');
});

test('no reutiliza mensajes de turnos anteriores ni duplicados internos', () => {
  const story = {
    ...emptyStory(),
    activeTopic: 'GTA 5',
    recentTurns: [previousTurn(['uff juegazo', 'yo sí le entro'])],
  };
  const result = parseVoiceAnalysis(analysis({
    topic: 'GTA 5',
    intent: 'question',
    messages: [
      'Uff, juegazo!', 'Yo si le entro',
      'Prefiero las misiones abiertas', 'A mí me gusta conducir',
      'La ciudad se siente enorme', 'Me quedo con el modo historia',
      'Yo exploraría primero', 'Quiero saber tu opinión',
      'Quiero saber tu opinión!',
    ],
  }), '¿Qué prefieren de GTA 5?', story, 'GTA 5');
  assert.equal(result.messages.length, 6);
  assert.doesNotMatch(result.messages.join(' '), /uff juegazo|yo si le entro/i);
  assert.equal(result.messages.filter((message) => message.startsWith('Quiero saber')).length, 1);
});

test('una frase sobre la partida puede recibir contexto; ruido y silencio no generan mensajes', () => {
  assert.equal(mentionsActiveGameplay('¿Qué construyo aquí?', 'Minecraft'), true);
  assert.equal(mentionsActiveGameplay('¿Cómo están?', 'Minecraft'), false);
  assert.equal(isVoiceNoise('...'), true);
  assert.equal(isVoiceNoise('   '), true);
  assert.deepEqual(parseVoiceAnalysis(analysis(), '...', emptyStory(), null).messages, []);
  assert.deepEqual(parseVoiceAnalysis(analysis(), '', emptyStory(), null).messages, []);
});
