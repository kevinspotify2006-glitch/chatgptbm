import type { GameState } from './state';
import { buildingById } from './state';
import type { Business, BusinessCategory, DistrictId } from './types';
import { DISTRICTS, district } from '../data/districts';
import { BUSINESS_TYPES, businessTypeOrThrow } from '../data/businessTypes';
import { product } from '../data/products';
import { cityEvent } from '../data/events';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR } from './format';
import { clamp, sum } from './util';

/**
 * The demand model.
 *
 * Demand is never rolled at random. Each hour every district produces a pool of
 * customers per business category, and the businesses competing for that pool
 * split it according to how attractive each one is. That is what makes a
 * competitor's price cut show up as a drop in the player's sales.
 */

/** Share of a district's population that shops in a category on an average day. */
const CATEGORY_RATE: Record<BusinessCategory, number> = {
  retail: 0.085,
  food: 0.155,
  services: 0.011,
  specialized: 0.019,
};

/**
 * Outlets per 10,000 residents that a district supports in each category.
 *
 * The game simulates a few dozen businesses; a real district of 100,000 people
 * has hundreds of shops. Those unsimulated outlets are represented as a single
 * background competitor, which is what stops one corner shop from being handed
 * an entire district's trade.
 */
const OUTLETS_PER_10K: Record<BusinessCategory, number> = {
  retail: 6.5,
  food: 9,
  services: 3,
  specialized: 2.5,
};

/** Score of an average unsimulated outlet. Every factor centres on 1. */
const BACKGROUND_SCORE = 1;

/**
 * A district's category demand is split between the business types inside it,
 * in proportion to how much trade each type normally does. Somebody shopping
 * for groceries is not in the market for a sofa, so a convenience store and a
 * furniture shop should not be competing for the same person.
 */
const typeShareCache = new Map<string, number>();

export function typeShare(typeId: string): number {
  const cached = typeShareCache.get(typeId);
  if (cached !== undefined) return cached;
  const type = businessTypeOrThrow(typeId);
  const peers = BUSINESS_TYPES.filter((other) => other.category === type.category);
  const total = peers.reduce((acc, other) => acc + other.baseCustomers, 0);
  const share = total > 0 ? type.baseCustomers / total : 1;
  typeShareCache.set(typeId, share);
  return share;
}

/** How much of a category's demand comes from passing traffic rather than residents. */
const VISITOR_WEIGHT: Record<BusinessCategory, number> = {
  retail: 0.55,
  food: 0.7,
  services: 0.2,
  specialized: 0.35,
};

const HOUR_CURVES: Record<BusinessCategory, number[]> = {
  // 24 entries, normalised so the day sums to roughly 24.
  retail: [0, 0, 0, 0, 0, 0.05, 0.2, 0.5, 0.9, 1.3, 1.6, 1.8, 1.9, 1.7, 1.6, 1.7, 1.9, 2.0, 1.7, 1.1, 0.6, 0.3, 0.1, 0],
  food: [0.05, 0.02, 0.01, 0.01, 0.02, 0.15, 0.6, 1.3, 1.5, 1.0, 0.9, 1.6, 2.6, 2.2, 1.1, 0.9, 1.1, 1.8, 2.5, 2.3, 1.6, 1.0, 0.5, 0.2],
  services: [0, 0, 0, 0, 0, 0.1, 0.4, 1.0, 1.7, 2.0, 2.0, 1.9, 1.4, 1.6, 1.9, 1.9, 1.7, 1.3, 0.7, 0.3, 0.1, 0, 0, 0],
  specialized: [0, 0, 0, 0, 0, 0.05, 0.2, 0.6, 1.2, 1.6, 1.7, 1.6, 1.4, 1.5, 1.7, 1.8, 1.8, 1.7, 1.4, 0.9, 0.5, 0.2, 0.05, 0],
};

/** Monday = 0. Weekend shifts demand between categories. */
const WEEKDAY_FACTOR: Record<BusinessCategory, number[]> = {
  retail: [0.85, 0.86, 0.9, 0.98, 1.18, 1.42, 0.95],
  food: [0.86, 0.88, 0.92, 1.02, 1.3, 1.45, 1.12],
  services: [1.15, 1.15, 1.12, 1.08, 1.0, 0.62, 0.28],
  specialized: [0.9, 0.92, 0.95, 1.02, 1.2, 1.35, 0.7],
};

/** Month 1..12 seasonal pull per category. December is retail's month. */
const SEASON_FACTOR: Record<BusinessCategory, number[]> = {
  retail: [0.86, 0.88, 0.96, 1.0, 1.04, 1.06, 1.02, 1.0, 1.05, 1.08, 1.18, 1.42],
  food: [0.9, 0.92, 0.98, 1.02, 1.08, 1.14, 1.18, 1.16, 1.04, 1.0, 1.0, 1.12],
  services: [1.02, 1.04, 1.06, 1.04, 1.0, 0.94, 0.84, 0.86, 1.06, 1.08, 1.04, 0.9],
  specialized: [0.92, 0.96, 1.02, 1.06, 1.1, 1.12, 1.08, 1.02, 1.02, 1.0, 1.04, 1.16],
};

export function weekdayIndex(day: number): number {
  return Math.max(0, Math.floor(day) - 1) % 7;
}

export function monthIndex(day: number): number {
  return Math.floor(Math.max(0, day - 1) / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
}

export function hourFactor(category: BusinessCategory, hour: number): number {
  const curve = HOUR_CURVES[category];
  return curve[((Math.floor(hour) % 24) + 24) % 24];
}

export function seasonFactor(category: BusinessCategory, day: number): number {
  return SEASON_FACTOR[category][monthIndex(day)];
}

export function weekdayFactor(category: BusinessCategory, day: number): number {
  return WEEKDAY_FACTOR[category][weekdayIndex(day)];
}

/** Combined multiplier from every active city event for a district. */
export function eventFactors(state: GameState, districtId: DistrictId): { demand: number; supplyCost: number; rent: number } {
  let demand = 1;
  let supplyCost = 1;
  let rent = 1;
  for (const active of state.events) {
    const def = cityEvent(active.defId);
    if (!def) continue;
    if (def.districts.length > 0 && !def.districts.includes(districtId)) continue;
    demand *= def.demand;
    supplyCost *= def.supplyCost;
    rent *= def.rent;
  }
  return { demand, supplyCost, rent };
}

/** How many customers in this district want this category in the current hour. */
export function districtPool(state: GameState, districtId: DistrictId, category: BusinessCategory): number {
  const def = district(districtId);
  const districtState = state.districts[districtId] ?? { demandIndex: 1, rentIndex: 1, propertyIndex: 1 };
  const preference = def.preferences[category] ?? 1;

  const residents = def.population * CATEGORY_RATE[category];
  // Visitors are drawn from foot traffic and tourism rather than population.
  const visitors = (def.footTraffic * 0.055 + def.footTraffic * def.tourism * 0.02) * VISITOR_WEIGHT[category];
  const daily = (residents + visitors) * preference;

  const confidence = clamp(state.economy.confidence / 100, 0.55, 1.45);
  const events = eventFactors(state, districtId).demand;

  return (
    (daily / 24) *
    hourFactor(category, state.hour) *
    weekdayFactor(category, state.day) *
    seasonFactor(category, state.day) *
    confidence *
    events *
    districtState.demandIndex
  );
}

// ------------------------------------------------------- attractiveness

export interface Factor {
  label: string;
  value: number;
  hint: string;
}

export interface Attractiveness {
  score: number;
  factors: Factor[];
}

/** Average price relative to what the market considers normal. */
export function priceIndex(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  if (type.productIds.length === 0) {
    return type.serviceFee > 0 ? (business.prices.service ?? type.serviceFee) / type.serviceFee : 1;
  }
  let weighted = 0;
  let weight = 0;
  for (const productId of type.productIds) {
    const def = product(productId);
    if (!def) continue;
    const price = business.prices[productId] ?? def.marketPrice;
    weighted += (price / def.marketPrice) * def.appeal;
    weight += def.appeal;
  }
  return weight > 0 ? weighted / weight : 1;
}

/** Average quality of what the business sells. */
export function productQuality(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  if (type.productIds.length === 0) return 0.6;
  const defs = type.productIds.map(product).filter((d): d is NonNullable<typeof d> => Boolean(d));
  if (defs.length === 0) return 0.6;
  return sum(defs, (d) => d.quality) / defs.length;
}

/**
 * How appealing this business is compared with its rivals. Every factor is
 * returned so the UI can explain exactly why a business is winning or losing.
 */
export function attractiveness(state: GameState, business: Business): Attractiveness {
  const type = businessTypeOrThrow(business.typeId);
  const building = buildingById(state, business.buildingId);
  const factors: Factor[] = [];
  if (!building) return { score: 0, factors };
  const def = district(building.district);

  // Location: footfall for walk-in trade, population for appointment trade.
  const walkIn = type.category === 'retail' || type.category === 'food';
  const location = walkIn
    ? clamp(building.footTraffic / 14000, 0.22, 2.6)
    : clamp(0.45 + def.population / 90000, 0.35, 2.1);
  factors.push({ label: 'Location', value: location, hint: walkIn ? `${building.footTraffic.toLocaleString('en-GB')} passers-by/day` : `${def.name} catchment` });

  // Price: cheaper wins, and poorer districts care far more.
  const incomeIndex = clamp(def.averageIncome / 55000, 0.4, 2.4);
  const elasticity = clamp(type.priceSensitivity * (2.3 - incomeIndex * 0.55), 0.35, 2.6);
  const index = priceIndex(business);
  const price = clamp(Math.pow(1 / Math.max(0.15, index), elasticity), 0.12, 2.4);
  factors.push({ label: 'Price', value: price, hint: `${Math.round(index * 100)}% of market price` });

  // Quality of goods, weighted against what the district can afford.
  const quality = clamp(0.6 + productQuality(business) * 0.7 * clamp(incomeIndex, 0.6, 1.6), 0.4, 1.9);
  factors.push({ label: 'Product quality', value: quality, hint: `${Math.round(productQuality(business) * 100)}% quality tier` });

  const service = clamp(0.5 + (business.serviceQuality / 100) * 0.85, 0.4, 1.4);
  factors.push({ label: 'Service', value: service, hint: `${Math.round(business.serviceQuality)}/100 service quality` });

  // A larger shop simply holds and serves more people than a kiosk.
  const scale = clamp(0.55 + building.customerCapacity / 42, 0.55, 2.2);
  factors.push({ label: 'Size', value: scale, hint: `${building.size} m², room for ${building.customerCapacity} at once` });

  const reputation = clamp(0.5 + (business.reputation / 100) * 0.9, 0.4, 1.45);
  factors.push({ label: 'Reputation', value: reputation, hint: `${business.reviewScore.toFixed(1)}★ from ${business.reviewCount} reviews` });

  const awareness = clamp(0.42 + (business.awareness / 100) * 0.95, 0.42, 1.4);
  factors.push({ label: 'Awareness', value: awareness, hint: `${Math.round(business.awareness)}% of the district knows you` });

  // Condition of the premises is a small but real turn-off.
  const condition = clamp(0.8 + (building.condition / 100) * 0.28, 0.75, 1.1);
  factors.push({ label: 'Premises', value: condition, hint: `${Math.round(building.condition)}/100 condition` });

  const score = factors.reduce((acc, factor) => acc * factor.value, 1);
  return { score: Math.max(0.0001, score), factors };
}

/** Outlets in a district that the game does not simulate individually. */
export function backgroundOutlets(districtId: DistrictId, category: BusinessCategory, simulated: number): number {
  const def = district(districtId);
  const expected = (def.population / 10000) * OUTLETS_PER_10K[category];
  return Math.max(0, expected - simulated);
}

/** Businesses competing in the same district and category. */
export function rivalsOf(state: GameState, business: Business): Business[] {
  const building = buildingById(state, business.buildingId);
  if (!building) return [];
  return state.businesses.filter((other) => {
    if (other.id === business.id) return false;
    if (other.status !== 'open') return false;
    if (other.typeId !== business.typeId) return false;
    const otherBuilding = buildingById(state, other.buildingId);
    return otherBuilding?.district === building.district;
  });
}

export interface Allocation {
  businessId: string;
  /** Customers who chose this business this hour. */
  customers: number;
  share: number;
  poolSize: number;
}

/**
 * Splits every district/category pool between the businesses competing for it.
 * Runs once per simulated hour for the whole city.
 */
export function allocateDemand(state: GameState): Map<string, Allocation> {
  const result = new Map<string, Allocation>();
  const open = state.businesses.filter((b) => b.status === 'open' && isTradingHour(state, b));

  // Group by district and business type: a bakery competes with other
  // bakeries, not with the electronics shop across the road.
  const groups = new Map<string, Business[]>();
  for (const business of open) {
    const building = buildingById(state, business.buildingId);
    if (!building) continue;
    const key = `${building.district}|${business.typeId}`;
    const list = groups.get(key);
    if (list) list.push(business);
    else groups.set(key, [business]);
  }

  for (const [key, members] of groups) {
    const [districtId, typeId] = key.split('|') as [DistrictId, string];
    const category = businessTypeOrThrow(typeId).category;
    const share = typeShare(typeId);
    const pool = districtPool(state, districtId, category) * share;
    if (pool <= 0) continue;

    const scores = members.map((business) => attractiveness(state, business).score);
    const simulatedTotal = scores.reduce((acc, score) => acc + score, 0);
    const background = backgroundOutlets(districtId, category, 0) * share * BACKGROUND_SCORE;
    const total = simulatedTotal + background;
    if (total <= 0) continue;

    members.forEach((business, index) => {
      const memberShare = scores[index] / total;
      result.set(business.id, {
        businessId: business.id,
        customers: pool * memberShare,
        share: memberShare,
        poolSize: pool,
      });
    });
  }

  return result;
}

export function isTradingHour(state: GameState, business: Business): boolean {
  const hour = state.hour;
  if (business.openFrom === business.openTo) return false;
  if (business.openFrom < business.openTo) return hour >= business.openFrom && hour < business.openTo;
  // Crosses midnight.
  return hour >= business.openFrom || hour < business.openTo;
}

/** Estimated customers per day at a set price — powers the pricing analytics. */
export function estimateDailyCustomers(state: GameState, business: Business, overridePrices?: Record<string, number>): number {
  const probe: Business = overridePrices ? { ...business, prices: { ...business.prices, ...overridePrices } } : business;
  const building = buildingById(state, business.buildingId);
  if (!building) return 0;
  const category = businessTypeOrThrow(business.typeId).category;

  const rivals = rivalsOf(state, business);
  const own = attractiveness(state, probe).score;
  const rivalTotal = sum(rivals, (rival) => attractiveness(state, rival).score);
  const share = typeShare(business.typeId);
  const background = backgroundOutlets(building.district, category, 0) * share * BACKGROUND_SCORE;
  const total = own + rivalTotal + background;
  if (total <= 0) return 0;

  // Sum the pool across the hours the business is actually open.
  let daily = 0;
  const saved = state.hour;
  for (let hour = 0; hour < 24; hour += 1) {
    (state as { hour: number }).hour = hour;
    if (!isTradingHour(state, business)) continue;
    daily += districtPool(state, building.district, category) * share;
  }
  (state as { hour: number }).hour = saved;

  return daily * (own / total);
}

export const ALL_DISTRICT_IDS: DistrictId[] = DISTRICTS.map((d) => d.id);
