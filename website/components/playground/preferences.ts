'use client';
/**
 * Per-viewer conveniences read without a hydration mismatch: the server and the
 * first client render use the fallback, then the stored or measured value.
 */
import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribeStorage(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A string kept in localStorage; storage that throws or is empty gives the fallback. */
export function usePreference(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribeStorage,
    () => read(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage is a convenience; the value still applies until reload.
        memory.set(key, next);
      }
      notify();
    },
    [key],
  );
  return [memory.get(key) ?? value, set];
}
const memory = new Map<string, string>();

/** Whether a media query matches; false on the server. */
export function useMedia(query: string, serverValue = false) {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** The shortcut prefix for this platform: ⌘ on Apple devices, Ctrl+ elsewhere. */
export function useModifierKey() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+'),
    () => '⌘',
  );
}
