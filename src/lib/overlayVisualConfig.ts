import {
  DEFAULT_OVERLAY_VISUAL_CONFIG,
  normalizeOverlayVisualConfig,
  resolveOverlayVisualConfigFromParams,
} from '../utils/types';
import type { OverlayVisualConfig, OverlayVisualConfigInput } from '../utils/types';
import { getOverlayState, updateOverlayState } from './overlayPersistence';

type VisualConfigListener = (config: OverlayVisualConfig) => void;
const listeners = new Map<string, Set<VisualConfigListener>>();

export function getStoredOverlayVisualConfig(userId: string): OverlayVisualConfig | null {
  const stored = getOverlayState().visualConfigs[userId];
  return stored ? normalizeOverlayVisualConfig(stored) : null;
}

export function saveOverlayVisualConfig(
  userId: string,
  input: OverlayVisualConfigInput,
): OverlayVisualConfig {
  const config = normalizeOverlayVisualConfig(input);
  updateOverlayState((current) => {
    current.visualConfigs[userId] = config;
    return current;
  });

  const userListeners = listeners.get(userId);
  userListeners?.forEach((listener) => listener(config));
  return config;
}

export function subscribeOverlayVisualConfig(
  userId: string,
  listener: VisualConfigListener,
): () => void {
  const userListeners = listeners.get(userId) ?? new Set<VisualConfigListener>();
  userListeners.add(listener);
  listeners.set(userId, userListeners);
  return () => {
    userListeners.delete(listener);
    if (userListeners.size === 0) listeners.delete(userId);
  };
}

export function resolveInitialOverlayVisualConfig(params: URLSearchParams): OverlayVisualConfig {
  return normalizeOverlayVisualConfig(
    resolveOverlayVisualConfigFromParams(params),
    DEFAULT_OVERLAY_VISUAL_CONFIG,
  );
}

