import type { GameState } from './state';
import { ALERT_LIMIT } from './state';
import type { Alert, AlertPriority } from './types';
import { emit } from './bus';
import { makeId } from './util';

export function pushAlert(
  state: GameState,
  priority: AlertPriority,
  title: string,
  detail: string,
  businessId: string | null = null,
): Alert {
  // Collapse a repeat of the same alert for the same business on the same day
  // so a persistent problem does not bury everything else.
  const existing = state.alerts.find(
    (alert) => alert.title === title && alert.businessId === businessId && alert.day === state.day,
  );
  if (existing) {
    existing.detail = detail;
    existing.hour = state.hour;
    existing.read = false;
    return existing;
  }

  const alert: Alert = {
    id: makeId('alert'),
    priority,
    title,
    detail,
    day: state.day,
    hour: state.hour,
    businessId,
    read: false,
  };
  state.alerts.unshift(alert);
  if (state.alerts.length > ALERT_LIMIT) state.alerts.length = ALERT_LIMIT;
  emit('alert', alert);
  return alert;
}

export function unreadAlerts(state: GameState): Alert[] {
  return state.alerts.filter((alert) => !alert.read);
}

export function markAlertsRead(state: GameState): void {
  for (const alert of state.alerts) alert.read = true;
}

export function dismissAlert(state: GameState, id: string): void {
  state.alerts = state.alerts.filter((alert) => alert.id !== id);
}

export const PRIORITY_ORDER: Record<AlertPriority, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Most recent alert per title, so a recurring problem is stated once. */
export function distinctAlerts(state: GameState): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const alert of sortedAlerts(state)) {
    const key = `${alert.title}|${alert.businessId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alert);
  }
  return out;
}

export function sortedAlerts(state: GameState): Alert[] {
  return [...state.alerts].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return b.day * 24 + b.hour - (a.day * 24 + a.hour);
  });
}
