import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OverlayVisualConfig } from '../utils/types';

export interface PersistedOverlayToken {
  userId: string;
  createdAt: number;
}

export interface PersistedOverlayState {
  version: 1;
  tokens: Record<string, PersistedOverlayToken>;
  userTokens: Record<string, string>;
  visualConfigs: Record<string, OverlayVisualConfig>;
}

const EMPTY_STATE: PersistedOverlayState = {
  version: 1,
  tokens: {},
  userTokens: {},
  visualConfigs: {},
};

const STATE_PATH = process.env.OVERLAY_STATE_PATH ?? join(process.cwd(), 'data', 'overlay-state.json');
let state = loadState();

function cloneState(source: PersistedOverlayState): PersistedOverlayState {
  return {
    version: 1,
    tokens: { ...source.tokens },
    userTokens: { ...source.userTokens },
    visualConfigs: { ...source.visualConfigs },
  };
}

function isPersistedToken(value: unknown): value is PersistedOverlayToken {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { userId?: unknown }).userId === 'string'
    && Number.isFinite((value as { createdAt?: unknown }).createdAt);
}

function loadState(): PersistedOverlayState {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    // JSON.parse devuelve unknown intencionalmente; la validación siguiente limita el estado recuperado.
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return cloneState(EMPTY_STATE);

    const candidate = parsed as {
      version?: unknown;
      tokens?: unknown;
      userTokens?: unknown;
      visualConfigs?: unknown;
    };
    if (candidate.version !== 1 || typeof candidate.tokens !== 'object' || candidate.tokens === null
      || typeof candidate.userTokens !== 'object' || candidate.userTokens === null
      || typeof candidate.visualConfigs !== 'object' || candidate.visualConfigs === null) {
      return cloneState(EMPTY_STATE);
    }

    const tokens: Record<string, PersistedOverlayToken> = {};
    for (const [token, entry] of Object.entries(candidate.tokens)) {
      if (isPersistedToken(entry)) tokens[token] = { userId: entry.userId, createdAt: entry.createdAt };
    }

    const userTokens: Record<string, string> = {};
    for (const [userId, token] of Object.entries(candidate.userTokens)) {
      if (typeof token === 'string' && tokens[token]?.userId === userId) userTokens[userId] = token;
    }

    const visualConfigs: Record<string, OverlayVisualConfig> = {};
    for (const [userId, config] of Object.entries(candidate.visualConfigs)) {
      if (typeof config === 'object' && config !== null) {
        visualConfigs[userId] = config as OverlayVisualConfig;
      }
    }

    return { version: 1, tokens, userTokens, visualConfigs };
  } catch {
    return cloneState(EMPTY_STATE);
  }
}

function persistState(nextState: PersistedOverlayState): void {
  const directory = dirname(STATE_PATH);
  const temporaryPath = `${STATE_PATH}.${process.pid}.tmp`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(nextState)}\n`, 'utf8');
  renameSync(temporaryPath, STATE_PATH);
}

export function getOverlayState(): PersistedOverlayState {
  return cloneState(state);
}

export function updateOverlayState(
  updater: (current: PersistedOverlayState) => PersistedOverlayState,
): PersistedOverlayState {
  const nextState = updater(cloneState(state));
  state = {
    version: 1,
    tokens: { ...nextState.tokens },
    userTokens: { ...nextState.userTokens },
    visualConfigs: { ...nextState.visualConfigs },
  };
  persistState(state);
  return cloneState(state);
}

