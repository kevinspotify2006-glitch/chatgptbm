import type { Alert } from './types';

/**
 * Simple typed event bus. The simulation publishes; the UI subscribes. No
 * simulation module is allowed to import a UI module, which keeps the engine
 * testable and the render layer replaceable.
 */
export type EventMap = {
  /** State changed enough that the UI should re-render. */
  tick: { day: number; hour: number };
  /** Something the player should notice. */
  alert: Alert;
  /** A whole day was settled. */
  day: { day: number };
  /** The active save was replaced (new game or load). */
  reset: void;
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

const listeners = new Map<keyof EventMap, Set<(payload: never) => void>>();

export function on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(listener as (payload: never) => void);
  return () => void set?.delete(listener as (payload: never) => void);
}

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      (listener as Listener<K>)(payload);
    } catch (error) {
      // A broken listener must never stop the simulation.
      console.error(`[bm] listener for "${String(event)}" failed`, error);
    }
  }
}
