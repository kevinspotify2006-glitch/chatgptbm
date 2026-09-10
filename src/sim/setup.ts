import type { DistrictState, GameState } from './state';
import {
  DEFAULT_ECONOMY,
  DEFAULT_SETTINGS,
  SAVE_VERSION,
  START_CASH,
  START_DAY,
  START_HOUR,
  defaultDistrictState,
} from './state';
import type { Company, CompetitorPersonality, DistrictId } from './types';
import { DISTRICTS } from '../data/districts';
import { generateCity } from './city';
import { openCompetitorOutlet } from './competitors';
import { refreshApplicants } from './employees';
import { reseedGameRng, gameRng } from './rng';
import { makeId } from './util';

const COMPETITOR_NAMES: { name: string; personality: CompetitorPersonality }[] = [
  { name: 'ValuMart', personality: 'lowcost' },
  { name: 'Aurelia', personality: 'premium' },
  { name: 'Vertex Group', personality: 'aggressive' },
  { name: 'Hollis & Sons', personality: 'conservative' },
  { name: 'Brightline', personality: 'marketer' },
  { name: 'Kestrel Craft', personality: 'quality' },
  { name: 'Tallow Holdings', personality: 'opportunist' },
  { name: 'Ridgeway Retail', personality: 'lowcost' },
  { name: 'Solene', personality: 'premium' },
  { name: 'Meridian Ventures', personality: 'aggressive' },
];

export function createNewGame(companyName: string, seed = Date.now() >>> 0): GameState {
  reseedGameRng(seed);

  const player: Company = {
    id: makeId('co'),
    name: companyName.trim().slice(0, 40) || 'Newco',
    isPlayer: true,
    cash: START_CASH,
    creditRating: 52,
    brandAwareness: 0,
    foundedOnDay: START_DAY,
    personality: null,
  };

  const districts = {} as Record<DistrictId, DistrictState>;
  for (const def of DISTRICTS) districts[def.id] = defaultDistrictState();

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    day: START_DAY,
    hour: START_HOUR,
    speed: 0,
    playerCompanyId: player.id,
    companies: [player],
    businesses: [],
    buildings: generateCity(),
    employees: [],
    applicants: [],
    orders: [],
    campaigns: [],
    loans: [],
    ledger: [],
    dayHistory: [],
    alerts: [],
    events: [],
    economy: { ...DEFAULT_ECONOMY },
    districts,
    supplierSpend: {},
    achievements: [],
    tutorialStep: 0,
    settings: { ...DEFAULT_SETTINGS },
    stats: {
      revenueTotal: 0,
      costsTotal: 0,
      customersTotal: 0,
      unitsTotal: 0,
      peakNetWorth: START_CASH,
      bankrupt: false,
    },
  };

  seedCompetitors(state);
  refreshApplicants(state);
  return state;
}

/**
 * The city is not empty when the player arrives: established chains already
 * hold the best pitches, which is what makes location choice a real decision.
 */
function seedCompetitors(state: GameState): void {
  for (const template of COMPETITOR_NAMES) {
    const company: Company = {
      id: makeId('co'),
      name: template.name,
      isPlayer: false,
      cash: gameRng.range(120000, 480000),
      creditRating: gameRng.range(45, 88),
      brandAwareness: gameRng.range(15, 70),
      foundedOnDay: 0,
      personality: template.personality,
    };
    state.companies.push(company);

    const outlets = gameRng.int(2, 4);
    for (let i = 0; i < outlets; i += 1) {
      const business = openCompetitorOutlet(state, company);
      if (!business) continue;
      // These are going concerns, not fresh openings.
      business.openedOnDay = 0;
      for (let day = 0; day < 7; day += 1) {
        business.profitHistory.push(gameRng.range(-40, 260));
      }
    }
  }

  // Seeding produces "a competitor opened" alerts; the player has not started
  // yet, so clear them.
  state.alerts = [];
}
