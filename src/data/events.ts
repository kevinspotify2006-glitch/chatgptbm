import type { CityEventDef } from '../sim/types';

/**
 * City events change the numbers the simulation already uses, so their effect
 * is visible in the demand breakdown rather than being an invisible fudge.
 */
export const CITY_EVENTS: CityEventDef[] = [
  {
    id: 'festival',
    name: 'Street festival',
    description: 'A weekend festival floods the area with visitors.',
    districts: ['downtown', 'entertainment', 'tourist', 'waterfront'],
    demand: 1.45,
    supplyCost: 1,
    rent: 1,
    durationDays: [2, 4],
    weight: 12,
  },
  {
    id: 'roadworks',
    name: 'Road closure',
    description: 'Major roadworks make the district hard to reach.',
    districts: [],
    demand: 0.72,
    supplyCost: 1.04,
    rent: 1,
    durationDays: [5, 14],
    weight: 12,
  },
  {
    id: 'tourist-boom',
    name: 'Tourist season',
    description: 'Visitor numbers are well above normal across the city.',
    districts: ['tourist', 'waterfront', 'airport', 'downtown'],
    demand: 1.28,
    supplyCost: 1,
    rent: 1,
    durationDays: [10, 21],
    weight: 9,
  },
  {
    id: 'recession',
    name: 'Economic downturn',
    description: 'Consumer confidence drops and people spend less.',
    districts: [],
    demand: 0.78,
    supplyCost: 0.96,
    rent: 0.98,
    durationDays: [20, 45],
    weight: 5,
  },
  {
    id: 'boom',
    name: 'Economic boom',
    description: 'Wages are up and the city is spending freely.',
    districts: [],
    demand: 1.22,
    supplyCost: 1.05,
    rent: 1.04,
    durationDays: [20, 45],
    weight: 5,
  },
  {
    id: 'supply-shortage',
    name: 'Supplier shortage',
    description: 'Wholesale prices spike after a supply disruption.',
    districts: [],
    demand: 1,
    supplyCost: 1.32,
    rent: 1,
    durationDays: [6, 16],
    weight: 10,
  },
  {
    id: 'mall-opening',
    name: 'New shopping centre',
    description: 'A new centre opens and pulls shoppers away from nearby streets.',
    districts: ['shopping', 'downtown', 'midtown'],
    demand: 0.82,
    supplyCost: 1,
    rent: 1.06,
    durationDays: [25, 50],
    weight: 6,
  },
  {
    id: 'rent-hike',
    name: 'Rent increase',
    description: 'Landlords push commercial rents up across the district.',
    districts: [],
    demand: 1,
    supplyCost: 1,
    rent: 1.14,
    durationDays: [30, 60],
    weight: 7,
  },
  {
    id: 'labour-shortage',
    name: 'Labour shortage',
    description: 'Applicants are scarce and everyone is asking for more money.',
    districts: [],
    demand: 1,
    supplyCost: 1,
    rent: 1,
    durationDays: [14, 30],
    weight: 7,
  },
  {
    id: 'construction',
    name: 'Construction works',
    description: 'Scaffolding and noise put customers off visiting.',
    districts: [],
    demand: 0.84,
    supplyCost: 1,
    rent: 0.96,
    durationDays: [8, 20],
    weight: 9,
  },
  {
    id: 'heatwave',
    name: 'Heatwave',
    description: 'Cold drinks fly out; anything requiring effort does not.',
    districts: [],
    demand: 1.06,
    supplyCost: 1.02,
    rent: 1,
    durationDays: [3, 8],
    weight: 8,
  },
];

const byId = new Map(CITY_EVENTS.map((event) => [event.id, event]));

export function cityEvent(id: string): CityEventDef | undefined {
  return byId.get(id);
}

export const TOTAL_EVENT_WEIGHT = CITY_EVENTS.reduce((total, event) => total + event.weight, 0);
