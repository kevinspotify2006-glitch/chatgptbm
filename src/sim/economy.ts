import type { GameState } from './state';
import type { ActiveEvent, DistrictId } from './types';
import { CITY_EVENTS, TOTAL_EVENT_WEIGHT, cityEvent } from '../data/events';
import { DISTRICTS } from '../data/districts';
import { pushAlert } from './alerts';
import { clamp, makeId } from './util';
import { gameRng } from './rng';

/**
 * The city economy. It moves slowly on its own and jumps when an event fires,
 * and everything it changes is a number the demand model already reads, so the
 * player can see the effect in the breakdown rather than guessing.
 */

export function economyDaily(state: GameState): void {
  const economy = state.economy;

  // Confidence performs a slow random walk around a trend set by growth.
  const trend = 100 + economy.growth * 320;
  economy.confidence = clamp(
    economy.confidence + (trend - economy.confidence) * 0.02 + gameRng.range(-1.4, 1.4),
    45,
    165,
  );

  // Inflation: about 2.5% a year on a 360-day calendar.
  economy.inflation = clamp(economy.inflation * 1.00007, 1, 6);

  // The central bank leans against confidence.
  const rateTarget = clamp(0.02 + (economy.confidence - 100) / 1400 + (economy.inflation - 1) * 0.06, 0.005, 0.14);
  economy.interestRate = clamp(economy.interestRate + (rateTarget - economy.interestRate) * 0.03, 0.005, 0.15);

  // Unemployment moves against confidence with a lag.
  const unemploymentTarget = clamp(0.11 - (economy.confidence - 100) / 900, 0.025, 0.14);
  economy.unemployment = clamp(
    economy.unemployment + (unemploymentTarget - economy.unemployment) * 0.02,
    0.02,
    0.16,
  );

  economy.growth = clamp(economy.growth + gameRng.range(-0.0008, 0.0008), -0.02, 0.06);

  // Districts drift: growing areas get busier, and rents follow.
  for (const def of DISTRICTS) {
    const districtState = state.districts[def.id];
    if (!districtState) continue;
    const dailyGrowth = def.growth / 360;
    districtState.demandIndex = clamp(
      districtState.demandIndex * (1 + dailyGrowth) + gameRng.range(-0.002, 0.002),
      0.55,
      1.85,
    );
    districtState.rentIndex = clamp(
      districtState.rentIndex + (districtState.demandIndex - districtState.rentIndex) * 0.01,
      0.6,
      2.2,
    );
    districtState.propertyIndex = clamp(
      districtState.propertyIndex * (1 + dailyGrowth * 1.4) + gameRng.range(-0.0015, 0.0025),
      0.55,
      3,
    );
  }

  advanceEvents(state);
}

function advanceEvents(state: GameState): void {
  for (const active of [...state.events]) {
    active.daysLeft -= 1;
    if (active.daysLeft > 0) continue;
    const def = cityEvent(active.defId);
    state.events = state.events.filter((event) => event.id !== active.id);
    if (def) {
      pushAlert(state, 'info', `${def.name} has ended`, 'Conditions are returning to normal.', null);
    }
  }

  // Roughly one new event every six days, never more than three at once.
  if (state.events.length >= 3) return;
  if (!gameRng.chance(0.17)) return;

  let roll = gameRng.next() * TOTAL_EVENT_WEIGHT;
  let chosen = CITY_EVENTS[0];
  for (const candidate of CITY_EVENTS) {
    roll -= candidate.weight;
    if (roll <= 0) {
      chosen = candidate;
      break;
    }
  }
  if (state.events.some((event) => event.defId === chosen.id)) return;

  const [min, max] = chosen.durationDays;
  const active: ActiveEvent = {
    id: makeId('evt'),
    defId: chosen.id,
    daysLeft: gameRng.int(min, max),
  };
  state.events.push(active);

  const scope = chosen.districts.length > 0 ? districtNames(chosen.districts) : 'the whole city';
  pushAlert(
    state,
    chosen.demand < 0.95 || chosen.supplyCost > 1.1 || chosen.rent > 1.05 ? 'warning' : 'info',
    chosen.name,
    `${chosen.description} Affects ${scope} for about ${active.daysLeft} days.`,
    null,
  );
}

function districtNames(ids: DistrictId[]): string {
  const names = ids
    .map((id) => DISTRICTS.find((d) => d.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Property values follow the district index; rents follow more slowly. */
export function revalueProperty(state: GameState): void {
  for (const building of state.buildings) {
    const districtState = state.districts[building.district];
    const def = DISTRICTS.find((d) => d.id === building.district);
    if (!districtState || !def) continue;
    const conditionFactor = 0.7 + (building.condition / 100) * 0.45;
    const base = building.size * def.pricePerSqm * conditionFactor;
    building.value = Math.round((base * districtState.propertyIndex * state.economy.inflation) / 500) * 500;
    building.rent = Math.round((building.size * def.rentPerSqm * conditionFactor * districtState.rentIndex) / 5) * 5;
    // Buildings decay unless renovated.
    building.condition = clamp(building.condition - 0.02, 5, 100);
  }
}

export function economyLabel(state: GameState): { label: string; tone: 'good' | 'neutral' | 'bad' } {
  const confidence = state.economy.confidence;
  if (confidence >= 125) return { label: 'Booming', tone: 'good' };
  if (confidence >= 108) return { label: 'Growing', tone: 'good' };
  if (confidence >= 92) return { label: 'Stable', tone: 'neutral' };
  if (confidence >= 75) return { label: 'Slowing', tone: 'bad' };
  return { label: 'Recession', tone: 'bad' };
}
