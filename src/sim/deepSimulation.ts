import type { Business, BusinessCategory, CompetitorPersonality, DistrictId } from './types';
import type { GameState } from './state';
import { businessType } from '../data/businessTypes';
import { pushAlert } from './alerts';
import { businessById, businessesInDistrict, competitorBusinesses, employeesOf, playerBusinesses, playerCompany } from './state';
import { Rng } from './rng';
import { clamp } from './util';

export type ConsumerSegment = 'budget' | 'mainstream' | 'affluent' | 'premium' | 'students' | 'families' | 'seniors' | 'tourists' | 'professionals';
export type MarketEventKind = 'boom' | 'recession' | 'supply_shock' | 'labor_shortage' | 'tourism' | 'infrastructure' | 'festival';

export interface ConsumerSegmentState { population: number; confidence: number; priceSensitivity: number; qualitySensitivity: number; loyalty: number; }
export interface DistrictMarketState { demandIndex: number; footfallIndex: number; priceIndex: number; employmentIndex: number; marketSize: number; playerShare: number; }
export interface CompetitorProfile { companyId: string; strategy: CompetitorPersonality; risk: number; expansionBudget: number; priceAggression: number; qualityFocus: number; marketingFocus: number; lastActionDay: number; }
export interface MarketEvent { id: string; kind: MarketEventKind; title: string; description: string; daysLeft: number; demandMultiplier: number; supplyMultiplier: number; laborMultiplier: number; districts: DistrictId[]; }
export interface DeepSimulationState { version: 1; segments: Record<ConsumerSegment, ConsumerSegmentState>; districts: Partial<Record<DistrictId, DistrictMarketState>>; competitors: CompetitorProfile[]; events: MarketEvent[]; marketShare: Record<string, number>; customerRetention: Record<string, number>; customerAcquisitionCost: Record<string, number>; customerLifetimeValue: Record<string, number>; lastEventDay: number; lastWeeklyReportDay: number; }

const SEGMENTS: ConsumerSegment[] = ['budget', 'mainstream', 'affluent', 'premium', 'students', 'families', 'seniors', 'tourists', 'professionals'];
const PERSONALITIES: CompetitorPersonality[] = ['lowcost', 'premium', 'aggressive', 'conservative', 'marketer', 'quality', 'opportunist'];

export function deepState(state: GameState): DeepSimulationState {
  const holder = state as GameState & { simulation?: DeepSimulationState };
  if (!holder.simulation) holder.simulation = createDeepState(state);
  return holder.simulation;
}

function createDeepState(state: GameState): DeepSimulationState {
  const totalPopulation = Math.max(1000, Object.keys(state.districts).length * 10000);
  const segments = {} as Record<ConsumerSegment, ConsumerSegmentState>;
  const weights: Record<ConsumerSegment, number> = { budget: .16, mainstream: .22, affluent: .1, premium: .06, students: .11, families: .13, seniors: .08, tourists: .07, professionals: .07 };
  for (const segment of SEGMENTS) segments[segment] = { population: totalPopulation * weights[segment], confidence: 1, priceSensitivity: segment === 'budget' || segment === 'students' ? .9 : segment === 'premium' ? .25 : .58, qualitySensitivity: segment === 'premium' || segment === 'affluent' ? .9 : .55, loyalty: segment === 'families' || segment === 'seniors' ? .72 : .48 };
  const districts: Partial<Record<DistrictId, DistrictMarketState>> = {};
  for (const id of Object.keys(state.districts) as DistrictId[]) districts[id] = { demandIndex: 1, footfallIndex: 1, priceIndex: 1, employmentIndex: 1, marketSize: totalPopulation / Math.max(1, Object.keys(state.districts).length), playerShare: 0 };
  const competitors = state.companies.filter((c) => !c.isPlayer).map((c, i) => ({ companyId: c.id, strategy: c.personality ?? PERSONALITIES[i % PERSONALITIES.length], risk: .35 + (i % 5) * .12, expansionBudget: Math.max(5000, c.cash * .2), priceAggression: c.personality === 'lowcost' ? .85 : c.personality === 'premium' ? .25 : .55, qualityFocus: c.personality === 'quality' || c.personality === 'premium' ? .9 : .55, marketingFocus: c.personality === 'marketer' ? .9 : .5, lastActionDay: 0 }));
  return { version: 1, segments, districts, competitors, events: [], marketShare: {}, customerRetention: {}, customerAcquisitionCost: {}, customerLifetimeValue: {}, lastEventDay: 0, lastWeeklyReportDay: 0 };
}

function districtOf(state: GameState, business: Business): DistrictId | null { return state.buildings.find((b) => b.id === business.buildingId)?.district ?? null; }
function categoryPressure(state: GameState, district: DistrictId, category: BusinessCategory): number { const businesses = businessesInDistrict(state, district).filter((b) => b.status === 'open'); if (!businesses.length) return 1; const typeCounts = businesses.filter((b) => businessType(b.typeId)?.category === category).length; return clamp(1 + (typeCounts < 2 ? .12 : 0) - Math.max(0, typeCounts - 3) * .035, .72, 1.18); }
function eventMultiplier(events: MarketEvent[], district: DistrictId | null, field: 'demandMultiplier' | 'supplyMultiplier' | 'laborMultiplier'): number { return events.filter((e) => !district || e.districts.length === 0 || e.districts.includes(district)).reduce((value, event) => value * event[field], 1); }

function chooseEvent(state: GameState, deep: DeepSimulationState, rng: Rng): void {
  if (state.day - deep.lastEventDay < 8 || rng.next() > .16) return;
  const kinds: MarketEventKind[] = ['boom', 'recession', 'supply_shock', 'labor_shortage', 'tourism', 'infrastructure', 'festival'];
  const kind = rng.pick(kinds);
  const districts = Object.keys(state.districts) as DistrictId[];
  const affectedDistricts = rng.chance(.55) ? [rng.pick(districts)] : [];
  const definitions: Record<MarketEventKind, [string, string, number, number, number, number]> = {
    boom: ['Consumer confidence surge', 'Households are spending more freely.', 1.14, .98, .98, 8], recession: ['Consumer confidence falls', 'Households are delaying discretionary purchases.', .84, 1.02, 1.01, 10], supply_shock: ['Supplier disruption', 'Wholesale availability is temporarily tighter.', .97, 1.22, 1, 7], labor_shortage: ['Labor shortage', 'Qualified workers are harder to hire and retain.', .99, 1, 1.18, 9], tourism: ['Tourism wave', 'Visitors are boosting spending in selected districts.', 1.2, 1.02, 1, 6], infrastructure: ['Infrastructure works', 'Road and transit changes alter local footfall.', 1.08, 1, .99, 9], festival: ['City festival', 'A major local event is bringing additional footfall.', 1.28, 1.01, 1, 4],
  };
  const [title, description, demandMultiplier, supplyMultiplier, laborMultiplier, duration] = definitions[kind];
  deep.events.push({ id: `mkt-${state.day}-${kind}`, kind, title, description, daysLeft: duration, demandMultiplier, supplyMultiplier, laborMultiplier, districts: affectedDistricts });
  deep.lastEventDay = state.day;
  pushAlert(state, 'info', title, description, null);
}

function updateConsumers(state: GameState, deep: DeepSimulationState): void { const confidence = clamp(state.economy.confidence / 100, .35, 1.35); for (const segment of SEGMENTS) { const item = deep.segments[segment]; item.confidence = clamp(item.confidence * .92 + confidence * .08, .35, 1.4); item.population = Math.max(100, item.population * (1 + state.economy.growth / 365)); } }

function scoreBusiness(state: GameState, business: Business, segment: ConsumerSegment): number {
  const type = businessType(business.typeId); if (!type || business.status !== 'open') return 0;
  const district = districtOf(state, business); if (!district) return 0;
  const building = state.buildings.find((b) => b.id === business.buildingId);
  const segmentPrice = segment === 'premium' || segment === 'affluent' ? .82 : segment === 'budget' || segment === 'students' ? 1.08 : 1;
  const prices = Object.values(business.prices);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 1;
  const priceScore = clamp(segmentPrice / Math.max(.35, avgPrice / 20), .35, 1.8);
  const qualityScore = clamp((business.serviceQuality / 100) * .65 + (business.reviewScore / 5) * .35, .35, 1.3);
  const reputationScore = .65 + business.reputation / 250;
  const locationScore = building ? clamp(building.footTraffic / 1000, .65, 1.35) : 1;
  return Math.max(.01, priceScore * qualityScore * reputationScore * locationScore * categoryPressure(state, district, type.category));
}

function updateMarketShare(state: GameState, deep: DeepSimulationState): void {
  const byCategory = new Map<BusinessCategory, { player: number; total: number }>();
  for (const business of state.businesses.filter((b) => b.status === 'open')) { const type = businessType(business.typeId); if (!type) continue; const entry = byCategory.get(type.category) ?? { player: 0, total: 0 }; const district = districtOf(state, business); const demand = district ? (deep.districts[district]?.marketSize ?? 1) * scoreBusiness(state, business, 'mainstream') : 0; entry.total += demand; if (business.companyId === state.playerCompanyId) entry.player += demand; byCategory.set(type.category, entry); }
  for (const [category, value] of byCategory) deep.marketShare[category] = value.total > 0 ? value.player / value.total : 0;
  const playerByDistrict = new Map<DistrictId, { player: number; total: number }>();
  for (const business of state.businesses.filter((b) => b.status === 'open')) { const district = districtOf(state, business); if (!district) continue; const entry = playerByDistrict.get(district) ?? { player: 0, total: 0 }; const demand = scoreBusiness(state, business, 'mainstream'); entry.total += demand; if (business.companyId === state.playerCompanyId) entry.player += demand; playerByDistrict.set(district, entry); }
  for (const [district, value] of playerByDistrict) { const market = deep.districts[district]; if (market) market.playerShare = value.total > 0 ? value.player / value.total : 0; }
}

function runCompetitorAI(state: GameState, deep: DeepSimulationState, rng: Rng): void {
  for (const profile of deep.competitors) {
    const company = state.companies.find((c) => c.id === profile.companyId); if (!company || company.cash < 0) continue;
    const businesses = competitorBusinesses(state).filter((b) => b.companyId === company.id && b.status === 'open'); if (!businesses.length) continue;
    for (const business of businesses) { const factor = profile.strategy === 'lowcost' ? .985 : profile.strategy === 'premium' ? 1.02 : profile.strategy === 'aggressive' ? .975 : 1; for (const productId of Object.keys(business.prices)) business.prices[productId] = Math.max(.5, business.prices[productId] * factor); business.marketingBudget = clamp(business.marketingBudget * (profile.marketingFocus > .75 ? 1.02 : .998), 0, company.cash * .02); business.reputation = clamp(business.reputation + (profile.qualityFocus > .75 ? .08 : -.01), 0, 100); }
    if (state.day - profile.lastActionDay >= 14 && rng.chance(.18 * profile.risk)) { profile.lastActionDay = state.day; const weakest = [...businesses].sort((a, b) => (a.reputation + a.reviewScore * 10) - (b.reputation + b.reviewScore * 10))[0]; if (weakest && weakest.reputation < 35 && rng.chance(.45)) { weakest.status = 'closed'; pushAlert(state, 'info', `${company.name} closed a location`, `${company.name} has exited ${weakest.name} after sustained weak performance.`, weakest.id); } }
  }
}

function updateEmployees(state: GameState, deep: DeepSimulationState): void {
  const laborMultiplier = eventMultiplier(deep.events, null, 'laborMultiplier');
  for (const employee of state.employees) {
    if (!employee.businessId) continue;
    employee.stress = clamp(employee.stress + (employee.morale < 45 ? 1.1 : -.65) * laborMultiplier, 0, 100);
    if (employee.stress > 82) employee.productivity = clamp(employee.productivity - .35, .35, 1.5); else employee.productivity = clamp(employee.productivity + .08, .35, 1.5);
    if (employee.stress > 92 && employee.loyalty < 55 && Math.random() < .008) { const business = businessById(state, employee.businessId); employee.businessId = null; employee.companyId = null; if (business) business.employeeIds = business.employeeIds.filter((id) => id !== employee.id); pushAlert(state, 'warning', `${employee.name} resigned`, 'High stress and low loyalty caused an unexpected resignation.', business?.id ?? null); }
  }
}

function updateRetention(state: GameState, deep: DeepSimulationState): void {
  for (const business of playerBusinesses(state)) { const satisfaction = clamp((business.reviewScore / 5) * .55 + (business.serviceQuality / 100) * .25 + (business.reputation / 100) * .2, .1, 1); const retention = clamp(satisfaction * .9 + .08, .05, .97); deep.customerRetention[business.id] = retention; const spend = business.today.customers > 0 ? business.today.revenue / business.today.customers : 0; deep.customerLifetimeValue[business.id] = spend * (1 + retention / Math.max(.1, 1 - retention)); const marketing = Math.max(0, business.today.marketing); deep.customerAcquisitionCost[business.id] = business.today.customers > 0 ? marketing / business.today.customers : 0; }
}

export function settleDeepSimulation(state: GameState): void {
  const deep = deepState(state); const rng = new Rng((state.seed ^ Math.imul(state.day + 1, 2654435761)) >>> 0);
  chooseEvent(state, deep, rng); updateConsumers(state, deep);
  for (const [district, market] of Object.entries(deep.districts) as [DistrictId, DistrictMarketState][]) { const demandEvent = eventMultiplier(deep.events, district, 'demandMultiplier'); const supplyEvent = eventMultiplier(deep.events, district, 'supplyMultiplier'); const growth = state.districts[district]?.demandIndex ?? 1; market.demandIndex = clamp(market.demandIndex * .9 + growth * demandEvent * .1, .4, 2.5); market.footfallIndex = clamp(market.footfallIndex * .94 + demandEvent * .06, .45, 2.2); market.priceIndex = clamp(market.priceIndex * .92 + state.economy.inflation * supplyEvent * .08, .5, 3); market.employmentIndex = clamp(1 - state.economy.unemployment + .062, .55, 1.2); market.marketSize *= 1 + state.economy.growth / 365; }
  for (const business of state.businesses.filter((b) => b.status === 'open')) { const district = districtOf(state, business); if (!district) continue; const market = deep.districts[district]; if (!market) continue; const category = businessType(business.typeId)?.category; const demandFactor = eventMultiplier(deep.events, district, 'demandMultiplier'); business.awareness = clamp(business.awareness + business.marketingBudget / 5000 - .08, 0, 100); const staff = employeesOf(state, business.id); business.serviceQuality = clamp(business.serviceQuality + (staff.reduce((s, e) => s + e.productivity, 0) - staff.length) * .015, 20, 100); if (category) business.reputation = clamp(business.reputation + (business.reviewScore - 3) * .025, 0, 100); market.demandIndex = clamp(market.demandIndex * demandFactor, .3, 3); }
  runCompetitorAI(state, deep, rng); updateEmployees(state, deep); updateMarketShare(state, deep); updateRetention(state, deep); deep.events = deep.events.map((event) => ({ ...event, daysLeft: event.daysLeft - 1 })).filter((event) => event.daysLeft > 0);
  if (state.day - deep.lastWeeklyReportDay >= 7) { deep.lastWeeklyReportDay = state.day; const company = playerCompany(state); const totalShare = Object.values(deep.marketShare).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(deep.marketShare).length); if (totalShare > .5) pushAlert(state, 'info', 'Market leadership', `${company.name} now controls ${Math.round(totalShare * 100)}% average category share across the city.`, null); }
}

export function marketSharePercent(state: GameState, category?: BusinessCategory): number { const value = deepState(state).marketShare[category ?? 'retail'] ?? 0; return Math.round(value * 1000) / 10; }
export function currentMarketEvents(state: GameState): MarketEvent[] { return deepState(state).events; }
