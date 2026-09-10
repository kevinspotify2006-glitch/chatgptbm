import type { GameState } from './state';
import { buildingById, competitorBusinesses, companyById } from './state';
import { emptyDayStats, type Business, type CompetitorPersonality, type Company, type DistrictId } from './types';
import { BUSINESS_TYPES, businessTypeOrThrow } from '../data/businessTypes';
import { product } from '../data/products';
import { district } from '../data/districts';
import { createBusinessRecord } from './business';
import { attractiveness, isTradingHour, priceIndex, type Allocation } from './demand';
import { pushAlert } from './alerts';
import { clamp, sum } from './util';
import { gameRng } from './rng';

/**
 * Competitor AI.
 *
 * Competitors are ordinary businesses in the same simulation: they occupy real
 * buildings, take real share out of the same district demand pools and pay real
 * rent. They do not see the player's books — they only observe their own
 * results and the average price in their district, which is roughly what a real
 * operator can see.
 */

export const PERSONALITY_LABELS: Record<CompetitorPersonality, string> = {
  lowcost: 'Low-cost operator',
  premium: 'Premium operator',
  aggressive: 'Aggressive expander',
  conservative: 'Conservative operator',
  marketer: 'Marketing-led',
  quality: 'Quality-focused',
  opportunist: 'Opportunist',
};

interface PersonalityProfile {
  /** Price relative to the market they aim for. */
  targetPriceIndex: number;
  /** How fast they react to losing share, 0..1. */
  reactivity: number;
  /** Marketing spend as a share of daily revenue. */
  marketingRatio: number;
  /** Service quality they invest in maintaining. */
  serviceTarget: number;
  /** Appetite for opening new locations, 0..1. */
  expansion: number;
  /** How long they tolerate losses, in days. */
  patience: number;
}

const PROFILES: Record<CompetitorPersonality, PersonalityProfile> = {
  lowcost: { targetPriceIndex: 0.84, reactivity: 0.55, marketingRatio: 0.01, serviceTarget: 46, expansion: 0.35, patience: 40 },
  premium: { targetPriceIndex: 1.28, reactivity: 0.18, marketingRatio: 0.035, serviceTarget: 84, expansion: 0.18, patience: 55 },
  aggressive: { targetPriceIndex: 0.93, reactivity: 0.75, marketingRatio: 0.05, serviceTarget: 62, expansion: 0.7, patience: 22 },
  conservative: { targetPriceIndex: 1.03, reactivity: 0.12, marketingRatio: 0.012, serviceTarget: 60, expansion: 0.08, patience: 70 },
  marketer: { targetPriceIndex: 1.09, reactivity: 0.3, marketingRatio: 0.085, serviceTarget: 64, expansion: 0.4, patience: 35 },
  quality: { targetPriceIndex: 1.16, reactivity: 0.22, marketingRatio: 0.025, serviceTarget: 88, expansion: 0.22, patience: 50 },
  opportunist: { targetPriceIndex: 0.98, reactivity: 0.62, marketingRatio: 0.03, serviceTarget: 58, expansion: 0.55, patience: 18 },
};

/** Rough daily wage bill for an AI outlet; they staff to their throughput. */
function aiWageBill(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  const headcount = Math.max(1, Math.round(type.roles.length * 1.6));
  return (headcount * 2400) / 30;
}

/**
 * Competitors trade against the same demand pools as the player, but their
 * inventory is abstracted: they always have stock, and pay cost of goods as a
 * share of revenue. That keeps hundreds of rival outlets cheap to simulate.
 */
export function tradeHourAI(state: GameState, business: Business, allocation: Allocation | undefined): void {
  if (business.status !== 'open' || !isTradingHour(state, business)) return;
  const customers = allocation?.customers ?? 0;
  if (customers <= 0) return;
  const type = businessTypeOrThrow(business.typeId);

  let revenuePerCustomer = type.serviceFee;
  let costRatio = 0.34;
  if (type.productIds.length > 0) {
    let revenue = 0;
    let cost = 0;
    let weight = 0;
    for (const productId of type.productIds) {
      const def = product(productId);
      if (!def) continue;
      const price = business.prices[productId] ?? def.marketPrice;
      revenue += price * def.unitsPerBasket * def.appeal;
      cost += def.wholesalePrice * def.unitsPerBasket * def.appeal;
      weight += def.appeal;
    }
    if (weight > 0) {
      revenuePerCustomer += revenue / weight;
      costRatio = revenue > 0 ? cost / revenue : 0.34;
    }
  }

  const revenue = customers * revenuePerCustomer;
  const company = companyById(state, business.companyId);
  if (company) company.cash += revenue - revenue * costRatio;
  business.today.revenue += revenue;
  business.today.cogs += revenue * costRatio;
  business.today.customers += customers;
  business.totals.revenue += revenue;
  business.totals.customers += customers;
}

export function competitorDaily(state: GameState): void {
  for (const business of competitorBusinesses(state)) {
    const building = buildingById(state, business.buildingId);
    const company = companyById(state, business.companyId);
    if (!building || !company) continue;

    const rent = building.status === 'rented' ? building.rent / 30 : building.rent / 45;
    const wages = aiWageBill(business);
    company.cash -= rent + wages + business.marketingBudget;
    business.today.rent += rent;
    business.today.wages += wages;
    business.today.marketing += business.marketingBudget;

    const profit =
      business.today.revenue -
      (business.today.cogs + business.today.wages + business.today.rent + business.today.marketing);
    business.profitHistory.push(profit);
    if (business.profitHistory.length > 30) business.profitHistory.shift();

    // Service and reputation drift toward what the operator invests in.
    const profile = PROFILES[company.personality ?? 'conservative'];
    business.serviceQuality = clamp(
      business.serviceQuality + (profile.serviceTarget - business.serviceQuality) * 0.08,
      0,
      100,
    );
    const reviewTarget = clamp(
      1.6 + (2.2 / Math.max(0.5, priceIndex(business))) * 0.55 + (business.serviceQuality / 100) * 1.4,
      1,
      5,
    );
    business.reviewScore = clamp(business.reviewScore + (reviewTarget - business.reviewScore) * 0.1, 1, 5);
    business.reputation = clamp(
      business.reputation + (((business.reviewScore - 1) / 4) * 100 - business.reputation) * 0.12,
      0,
      100,
    );
    const districtDef = district(building.district);
    const awarenessGain = Math.sqrt(business.marketingBudget) * (26000 / Math.max(4000, districtDef.population)) * 0.9;
    business.awareness = clamp(business.awareness * 0.975 + awarenessGain + business.today.customers / 220, 0, 100);

    business.yesterday = business.today;
    business.today = emptyDayStats();
  }
}

/** Competitors reconsider their strategy once a week. */
export function competitorWeekly(state: GameState): void {
  for (const business of competitorBusinesses(state)) {
    const company = companyById(state, business.companyId);
    const building = buildingById(state, business.buildingId);
    if (!company || !building) continue;
    const profile = PROFILES[company.personality ?? 'conservative'];
    const type = businessTypeOrThrow(business.typeId);

    // What they can observe: their own share and the going rate nearby.
    const rivals = state.businesses.filter((other) => {
      if (other.id === business.id || other.status !== 'open') return false;
      const otherBuilding = buildingById(state, other.buildingId);
      return (
        otherBuilding?.district === building.district &&
        businessTypeOrThrow(other.typeId).category === type.category
      );
    });
    const own = attractiveness(state, business).score;
    const rivalTotal = sum(rivals, (rival) => attractiveness(state, rival).score);
    const share = own / Math.max(0.0001, own + rivalTotal);
    const fairShare = 1 / (rivals.length + 1);

    // Losing more share than expected pushes prices down; winning lets them rise.
    let target = profile.targetPriceIndex;
    if (share < fairShare * 0.8) target *= 1 - profile.reactivity * 0.14;
    else if (share > fairShare * 1.3) target *= 1 + profile.reactivity * 0.07;
    // Competitors misjudge the market — they do not have perfect information.
    target *= gameRng.range(0.96, 1.04);

    const current = priceIndex(business);
    const step = clamp((target - current) * (0.35 + profile.reactivity * 0.4), -0.12, 0.12);
    for (const productId of type.productIds) {
      const def = product(productId);
      if (!def) continue;
      const price = business.prices[productId] ?? def.marketPrice;
      business.prices[productId] = Number(
        clamp(price * (1 + step), def.wholesalePrice * 1.05, def.marketPrice * 3).toFixed(2),
      );
    }
    if (type.serviceFee > 0) {
      const fee = business.prices.service ?? type.serviceFee;
      business.prices.service = Number(clamp(fee * (1 + step), type.serviceFee * 0.5, type.serviceFee * 2.5).toFixed(2));
    }

    // Marketing budget follows revenue, not ambition.
    const weeklyRevenue = business.yesterday.revenue * 7;
    business.marketingBudget = Math.round(clamp((weeklyRevenue / 7) * profile.marketingRatio, 0, company.cash / 60));

    // Persistent losses eventually close a location.
    const recent = business.profitHistory.slice(-14);
    const losing = recent.length >= 7 && sum(recent, (p) => p) < 0;
    if (losing && company.cash < 0) {
      closeCompetitor(state, business.id, `${company.name} closed ${business.name}.`);
      continue;
    }
    if (losing && gameRng.chance(clamp(14 / profile.patience, 0.05, 0.5) * 0.25)) {
      closeCompetitor(state, business.id, `${company.name} pulled out of ${district(building.district).name}.`);
    }
  }

  // Expansion: healthy competitors open new outlets where money is being made.
  for (const company of state.companies.filter((c) => !c.isPlayer)) {
    const profile = PROFILES[company.personality ?? 'conservative'];
    if (company.cash < 90000) continue;
    if (!gameRng.chance(profile.expansion * 0.25)) continue;
    openCompetitorOutlet(state, company);
  }
}

function closeCompetitor(state: GameState, businessId: string, message: string): void {
  const business = state.businesses.find((b) => b.id === businessId);
  if (!business) return;
  const building = buildingById(state, business.buildingId);
  if (building) {
    building.businessId = null;
    building.status = 'available';
    building.occupantCompanyId = null;
  }
  state.businesses = state.businesses.filter((b) => b.id !== businessId);
  pushAlert(state, 'info', 'A competitor closed', message, null);
}

/** Picks a promising vacant unit and opens a rival business in it. */
export function openCompetitorOutlet(state: GameState, company: Company): Business | null {
  const profile = PROFILES[company.personality ?? 'conservative'];
  const candidates = state.buildings.filter((b) => b.status === 'available' && b.businessId === null);
  if (candidates.length === 0) return null;

  // Score districts by how well existing businesses there are doing.
  const scoreByDistrict = new Map<DistrictId, number>();
  for (const business of state.businesses) {
    const building = buildingById(state, business.buildingId);
    if (!building) continue;
    const recent = business.profitHistory.slice(-7);
    const profit = recent.length > 0 ? sum(recent, (p) => p) / recent.length : 0;
    scoreByDistrict.set(building.district, (scoreByDistrict.get(building.district) ?? 0) + profit);
  }

  const shortlist = gameRng.sample(candidates, 14);
  let best: { building: (typeof candidates)[number]; typeId: string; score: number } | null = null;

  for (const building of shortlist) {
    const districtDef = district(building.district);
    const options = BUSINESS_TYPES.filter(
      (type) => building.size >= type.minSize && building.suitableFor.includes(type.category),
    );
    if (options.length === 0) continue;
    const type = gameRng.pick(options);
    const setup = type.setupCost + type.equipmentCost + building.rent * 3;
    if (setup > company.cash * 0.6) continue;

    const heat = scoreByDistrict.get(building.district) ?? 0;
    const score =
      (districtDef.preferences[type.category] ?? 1) *
      clamp(building.footTraffic / 12000, 0.2, 2.4) *
      (1 + clamp(heat / 900, -0.5, 1.4) * profile.expansion) *
      gameRng.range(0.7, 1.3);
    if (!best || score > best.score) best = { building, typeId: type.id, score };
  }

  if (!best) return null;
  const type = businessTypeOrThrow(best.typeId);
  const business = createBusinessRecord(state, company, type, best.building, `${company.name} ${type.name}`);
  business.status = 'open';
  business.reputation = clamp(gameRng.around(46, 14), 15, 85);
  business.serviceQuality = profile.serviceTarget;
  business.awareness = clamp(gameRng.around(18 + company.brandAwareness * 0.3, 8), 3, 70);
  business.reviewScore = clamp(gameRng.around(3.5, 0.5), 1.5, 4.8);
  business.reviewCount = gameRng.int(15, 400);
  for (const productId of type.productIds) {
    const def = product(productId);
    if (!def) continue;
    business.prices[productId] = Number((def.marketPrice * profile.targetPriceIndex * gameRng.range(0.95, 1.05)).toFixed(2));
  }
  if (type.serviceFee > 0) {
    business.prices.service = Number((type.serviceFee * profile.targetPriceIndex).toFixed(2));
  }

  company.cash -= type.setupCost + type.equipmentCost + best.building.rent * 3;
  best.building.status = 'competitor';
  best.building.occupantCompanyId = company.id;
  best.building.businessId = business.id;
  state.businesses.push(business);

  pushAlert(
    state,
    'warning',
    'A competitor opened nearby',
    `${company.name} opened ${type.name.toLowerCase()} "${business.name}" in ${district(best.building.district).name}.`,
    null,
  );
  return business;
}
