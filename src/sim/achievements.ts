import type { GameState } from './state';
import { playerBusinesses, playerCompany } from './state';
import { netWorth } from './finance';
import { pushAlert } from './alerts';
import { sum } from './util';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Returns 0..1 progress. */
  progress: (state: GameState) => number;
}

function ratio(current: number, target: number): number {
  return target <= 0 ? 0 : Math.max(0, Math.min(1, current / target));
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-employee',
    name: 'First employee',
    description: 'Hire your first member of staff.',
    progress: (state) => ratio(state.employees.length, 1),
  },
  {
    id: 'doors-open',
    name: 'Open for business',
    description: 'Open your first business.',
    progress: (state) => ratio(playerBusinesses(state).filter((b) => b.status === 'open').length, 1),
  },
  {
    id: 'first-profit',
    name: 'First profitable day',
    description: 'Finish a day in profit.',
    progress: (state) => ratio(state.dayHistory.filter((d) => d.profit > 0).length, 1),
  },
  {
    id: 'profit-10k',
    name: '€10,000 profit',
    description: 'Make €10,000 of cumulative profit.',
    progress: (state) => ratio(sum(state.dayHistory, (d) => d.profit), 10000),
  },
  {
    id: 'revenue-1m',
    name: 'First million in revenue',
    description: 'Take €1,000,000 in total revenue.',
    progress: (state) => ratio(state.stats.revenueTotal, 1_000_000),
  },
  {
    id: 'three-locations',
    name: 'Three locations',
    description: 'Operate three businesses at once.',
    progress: (state) => ratio(playerBusinesses(state).length, 3),
  },
  {
    id: 'ten-locations',
    name: 'Ten locations',
    description: 'Operate ten businesses at once.',
    progress: (state) => ratio(playerBusinesses(state).length, 10),
  },
  {
    id: 'staff-25',
    name: 'Twenty-five on the payroll',
    description: 'Employ twenty-five people.',
    progress: (state) => ratio(state.employees.length, 25),
  },
  {
    id: 'staff-100',
    name: 'One hundred employees',
    description: 'Employ one hundred people.',
    progress: (state) => ratio(state.employees.length, 100),
  },
  {
    id: 'landlord',
    name: 'Property owner',
    description: 'Own three buildings outright.',
    progress: (state) => {
      const player = playerCompany(state);
      return ratio(
        state.buildings.filter((b) => b.status === 'owned' && b.occupantCompanyId === player.id).length,
        3,
      );
    },
  },
  {
    id: 'networth-500k',
    name: 'Half a million',
    description: 'Reach a net worth of €500,000.',
    progress: (state) => ratio(netWorth(state), 500_000),
  },
  {
    id: 'networth-5m',
    name: 'Five million',
    description: 'Reach a net worth of €5,000,000.',
    progress: (state) => ratio(netWorth(state), 5_000_000),
  },
  {
    id: 'market-leader',
    name: 'Market leader',
    description: 'Own more open businesses than any single competitor.',
    progress: (state) => {
      const mine = playerBusinesses(state).filter((b) => b.status === 'open').length;
      if (mine === 0) return 0;
      const rivals = new Map<string, number>();
      for (const business of state.businesses) {
        if (business.companyId === state.playerCompanyId || business.status !== 'open') continue;
        rivals.set(business.companyId, (rivals.get(business.companyId) ?? 0) + 1);
      }
      const best = Math.max(0, ...rivals.values());
      return mine > best ? 1 : ratio(mine, best + 1);
    },
  },
];

/** Progression tiers, shown on the dashboard. */
export const TIERS = [
  { name: 'Startup', minNetWorth: 0 },
  { name: 'Small Business', minNetWorth: 120_000 },
  { name: 'Established Business', minNetWorth: 500_000 },
  { name: 'Regional Company', minNetWorth: 2_000_000 },
  { name: 'National Company', minNetWorth: 10_000_000 },
  { name: 'Corporation', minNetWorth: 50_000_000 },
  { name: 'Business Empire', minNetWorth: 250_000_000 },
];

export function currentTier(state: GameState): { name: string; next: string | null; progress: number } {
  const worth = netWorth(state);
  let index = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (worth >= TIERS[i].minNetWorth) index = i;
  }
  const next = TIERS[index + 1] ?? null;
  const floor = TIERS[index].minNetWorth;
  const progress = next ? ratio(worth - floor, next.minNetWorth - floor) : 1;
  return { name: TIERS[index].name, next: next?.name ?? null, progress };
}

export function checkAchievements(state: GameState): void {
  for (const def of ACHIEVEMENTS) {
    if (state.achievements.some((a) => a.id === def.id)) continue;
    if (def.progress(state) < 1) continue;
    state.achievements.push({ id: def.id, unlockedOnDay: state.day });
    pushAlert(state, 'info', `Achievement: ${def.name}`, def.description, null);
  }
}
