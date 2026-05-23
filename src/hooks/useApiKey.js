import { useSyncExternalStore } from 'react';
import {
  clearUserApiKey,
  hasApiKey,
  setUserApiKey,
  subscribeApiKey,
} from '../api/openrouter';

// Subscribes to the in-memory OpenRouter key held in `api/openrouter.js`.
// Returns the current presence flag plus setters; the actual key value is
// never exposed to React state to keep it out of devtools snapshots.
export function useApiKey() {
  const hasKey = useSyncExternalStore(subscribeApiKey, hasApiKey, () => false);
  return {
    hasKey,
    setKey: setUserApiKey,
    clearKey: clearUserApiKey,
  };
}
