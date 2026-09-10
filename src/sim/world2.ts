import type { BusinessCategory, CompetitorPersonality, DistrictId } from './types';
import type { GameState } from './state';
import { businessType } from '../data/businessTypes';
import { pushAlert } from './alerts';
import { playerBusinesses, playerCompany } from './state';
import { clamp, sum } from './util';

export type CompanyStrategy = 'low_cost' | 'premium' | 'growth' | 'defensive' | 'quality' | 'niche' | 'innovation';
export type LifecycleStage = 'startup' | 'growth' | 'maturity' | 'decline' | 'turnaround' | 'closure';

export interface BusinessHealth { businessId: string; stage: LifecycleStage; margin: number; utilization: number; satisfaction: number; risk: number; }
export interface World2State {
  version: 1;
  playerStrategy: CompanyStrategy;
  strategySinceDay: number;
  businessHealth: Record<string, BusinessHealth>;
  districtMomentum: Partial<Record<DistrictId, number>>;
  lastWeeklyDay: number;
  lastInsight: string;
}

const STRATEGY_BY_PERSONALITY: Record<CompetitorPersonality, CompanyStrategy> = {
  lowcost: 'low_cost', premium: 'premium', aggressive: 'growth', conservative: 'defensive',
  marketer: 'growth', quality: 'quality', opportunist: 'niche',
};

export function world2State(state: GameState): World2State {
  const holder = state as GameState & { world2?: World2State };
  if (!holder.world2) holder.world2 = createState();
  return holder.world2;
}
function createState(): World2State {
  return { version: 1, playerStrategy: 'growth', strategySinceDay: 1, businessHealth: {}, districtMomentum: {}, lastWeeklyDay: 0, lastInsight: '' };
}

export function setCompanyStrategy(state: GameState, strategy: CompanyStrategy): void {
  const world = world2State(state);
  if (world.playerStrategy === strategy) return;
  world.playerStrategy = strategy;
  world.strategySinceDay = state.day;
  pushAlert(state, 'info', 'Strategy changed', `Your company is now pursuing a ${strategy.replace('_', ' ')} strategy. Expect trade-offs in price, quality, growth and risk.`, null);
}

function category(business: { typeId: string }): BusinessCategory | null { return businessType(business.typeId)?.category ?? null; }
function lifecycle(state: GameState, businessId: string): BusinessHealth {
  const business = state.businesses.find((b) => b.id === businessId);
  if (!business) return { businessId, stage: 'closure', margin: 0, utilization: 0, satisfaction: 0, risk: 1 };
  const recent = business.profitHistory.slice(-14);
  const avgProfit = recent.length ? sum(recent, (value) => value) / recent.length : 0;
  const margin = business.today.revenue > 0 ? (business.today.revenue - business.today.cogs - business.today.wages - business.today.rent - business.today.marketing - business.today.otherCosts) / business.today.revenue : 0;
  const satisfaction = clamp((business.reviewScore / 5) * .45 + business.serviceQuality / 100 * .35 + business.reputation / 100 * .2, 0, 1);
  const utilization = clamp(business.today.customers / Math.max(1, businessType(business.typeId)?.baseCustomers ?? 1), 0, 2);
  const age = state.day - business.openedOnDay;
  let stage: LifecycleStage = age < 30 ? 'startup' : age < 180 && avgProfit >= 0 ? 'growth' : age >= 180 && avgProfit >= 0 ? 'maturity' : avgProfit < 0 && satisfaction >= .55 ? 'turnaround' : 'decline';
  if (business.status === 'closed') stage = 'closure';
  const risk = clamp((avgProfit < 0 ? .35 : 0) + (satisfaction < .5 ? .3 : 0) + (utilization < .5 ? .2 : 0) + (business.serviceQuality < 45 ? .15 : 0), 0, 1);
  return { businessId, stage, margin, utilization, satisfaction, risk };
}

function applyStrategy(state: GameState): void {
  const world = world2State(state);
  const player = playerCompany(state);
  for (const business of playerBusinesses(state)) {
    if (business.status !== 'open') continue;
    const targetQuality = world.playerStrategy === 'quality' || world.playerStrategy === 'premium' ? .12 : world.playerStrategy === 'low_cost' ? -.05 : .03;
    const staff = state.employees.filter((e) => e.businessId === business.id);
    const staffSkill = staff.length ? staff.reduce((total, e) => total + e.skill, 0) / staff.length : 40;
    business.serviceQuality = clamp(business.serviceQuality + targetQuality + (staffSkill - 50) * .002, 20, 100);
    if (world.playerStrategy === 'low_cost') business.marketingBudget *= .995;
    if (world.playerStrategy === 'growth') business.marketingBudget = clamp(business.marketingBudget * 1.004, 0, Math.max(0, player.cash * .015));
    if (world.playerStrategy === 'premium') business.awareness = clamp(business.awareness + .025, 0, 100);
    const type = category(business);
    if (world.playerStrategy === 'niche' && type === 'specialized') business.reputation = clamp(business.reputation + .05, 0, 100);
    if (world.playerStrategy === 'innovation') business.serviceQuality = clamp(business.serviceQuality + .035, 20, 100);
  }
}

function updateCity(state: GameState): void {
  const world = world2State(state);
  for (const id of Object.keys(state.districts) as DistrictId[]) {
    const district = state.districts[id];
    const businesses = state.buildings.filter((b) => b.district === id && b.businessId !== null);
    const occupied = businesses.length;
    const momentum = clamp((occupied / 20 - 0.15) + (district.demandIndex - 1) * .7 + state.economy.growth * 2, -.08, .08);
    world.districtMomentum[id] = clamp((world.districtMomentum[id] ?? 0) * .92 + momentum * .08, -.5, .5);
    district.demandIndex = clamp(district.demandIndex + momentum, .45, 2.5);
    district.rentIndex = clamp(district.rentIndex * (1 + momentum * .08), .6, 3);
    district.propertyIndex = clamp(district.propertyIndex * (1 + momentum * .06), .6, 3);
  }
}

function weeklyInsights(state: GameState): void {
  const world = world2State(state);
  if (state.day - world.lastWeeklyDay < 7) return;
  world.lastWeeklyDay = state.day;
  const businesses = playerBusinesses(state).filter((b) => b.status === 'open');
  if (!businesses.length) return;
  const weakest = [...businesses].map((b) => world.businessHealth[b.id] ?? lifecycle(state, b.id)).sort((a, b) => b.risk - a.risk)[0];
  if (!weakest) return;
  const business = state.businesses.find((b) => b.id === weakest.businessId);
  if (!business) return;
  let insight = '';
  if (weakest.risk > .7) insight = `${business.name} needs attention: weak profitability, demand or customer satisfaction is putting it at high risk.`;
  else if (weakest.margin < .05) insight = `${business.name} has thin margins. Review prices, staffing and supplier costs before expanding.`;
  else if (weakest.utilization < .55) insight = `${business.name} has spare capacity. Marketing, pricing or a better location could improve utilization.`;
  else insight = `${business.name} is healthy. Consider reinvesting in quality, capacity or expansion.`;
  if (insight !== world.lastInsight) {
    world.lastInsight = insight;
    pushAlert(state, weakest.risk > .7 ? 'warning' : 'info', 'Weekly management insight', insight, business.id);
  }
}

function competitorStrategy(state: GameState): void {
  for (const company of state.companies.filter((c) => !c.isPlayer)) {
    const strategy = company.personality ? STRATEGY_BY_PERSONALITY[company.personality] : 'defensive';
    const businesses = state.businesses.filter((b) => b.companyId === company.id && b.status === 'open');
    for (const business of businesses) {
      if (strategy === 'quality') business.serviceQuality = clamp(business.serviceQuality + .025, 20, 100);
      if (strategy === 'low_cost') for (const id of Object.keys(business.prices)) business.prices[id] = Math.max(.5, business.prices[id] * .997);
      if (strategy === 'premium') for (const id of Object.keys(business.prices)) business.prices[id] = Math.max(.5, business.prices[id] * 1.002);
      if (strategy === 'growth') business.marketingBudget = clamp(business.marketingBudget * 1.006, 0, Math.max(0, company.cash * .015));
    }
  }
}

export function settleWorld2(state: GameState): void {
  const world = world2State(state);
  applyStrategy(state);
  updateCity(state);
  competitorStrategy(state);
  for (const business of playerBusinesses(state)) world.businessHealth[business.id] = lifecycle(state, business.id);
  weeklyInsights(state);
}
