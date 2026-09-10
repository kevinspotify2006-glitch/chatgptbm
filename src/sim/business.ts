import type { GameState } from './state';
import { buildingById, businessById, employeesOf, playerCompany } from './state';
import type { Building, Business, BusinessTypeDef, Company } from './types';
import { emptyDayStats } from './types';
import { businessTypeOrThrow } from '../data/businessTypes';
import { product } from '../data/products';
import { district } from '../data/districts';
import { post, postNonCash } from './finance';
import { refreshApplicants, staffPower } from './employees';
import { pushAlert } from './alerts';
import { eventFactors, isTradingHour, priceIndex, type Allocation } from './demand';
import { approach, clamp, makeId, sum } from './util';
import { gameRng } from './rng';

/** Utilities and upkeep, as a share of monthly rent. */
const UTILITY_RATE = 0.14;

export function createBusinessRecord(
  state: GameState,
  company: Company,
  type: BusinessTypeDef,
  building: Building,
  name: string,
): Business {
  const prices: Record<string, number> = {};
  const stock: Record<string, number> = {};
  const incoming: Record<string, number> = {};
  const costBasis: Record<string, number> = {};
  const reorderPoints: Record<string, number> = {};

  // Seed the reorder points from the sales this type is expected to make, so a
  // busy shop does not start with a level meant for a quiet one.
  const appealTotal = sum(
    type.productIds.map((id) => product(id)?.appeal ?? 0),
    (value) => value,
  );

  for (const productId of type.productIds) {
    const def = product(productId);
    if (!def) continue;
    prices[productId] = Number((def.marketPrice * state.economy.inflation).toFixed(2));
    stock[productId] = 0;
    incoming[productId] = 0;
    costBasis[productId] = def.wholesalePrice;
    const share = appealTotal > 0 ? def.appeal / appealTotal : 1 / Math.max(1, type.productIds.length);
    const perDay = type.baseCustomers * share * def.unitsPerBasket;
    reorderPoints[productId] = Math.max(10, Math.round(perDay * 1.5));
  }
  if (type.serviceFee > 0) {
    prices.service = Number((type.serviceFee * state.economy.inflation).toFixed(2));
  }

  return {
    id: makeId('biz'),
    companyId: company.id,
    typeId: type.id,
    buildingId: building.id,
    name,
    status: 'setup',
    openFrom: type.defaultOpenFrom,
    openTo: type.defaultOpenTo,
    reputation: 35,
    serviceQuality: 55,
    reviewScore: 3.4,
    reviewCount: 0,
    prices,
    stock,
    incoming,
    costBasis,
    reorderPoints,
    employeeIds: [],
    marketingBudget: 0,
    awareness: 6,
    today: emptyDayStats(),
    yesterday: emptyDayStats(),
    totals: { revenue: 0, costs: 0, customers: 0, units: 0 },
    profitHistory: [],
    openedOnDay: state.day,
    autoRestock: false,
  };
}

// -------------------------------------------------------------- property

export function rentBuilding(state: GameState, buildingId: string): { ok: boolean; message: string } {
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.status !== 'available') return { ok: false, message: 'That unit is not available.' };
  const company = playerCompany(state);
  // Landlords want the first month plus a two-month deposit.
  const upfront = building.rent * 3;
  if (company.cash < upfront) {
    return { ok: false, message: `You need €${upfront.toLocaleString('en-GB')} up front (deposit plus first month).` };
  }
  building.status = 'rented';
  building.occupantCompanyId = company.id;
  post(state, company.id, 'rent', `Deposit & first month — ${building.address}`, -upfront);
  return { ok: true, message: `${building.address} leased.` };
}

export function buyBuilding(state: GameState, buildingId: string): { ok: boolean; message: string } {
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.status === 'owned') return { ok: false, message: 'You already own this building.' };
  if (building.status === 'competitor') return { ok: false, message: 'Another company occupies this building.' };
  const company = playerCompany(state);
  if (company.cash < building.value) {
    return { ok: false, message: `You need €${building.value.toLocaleString('en-GB')} to buy this outright.` };
  }
  building.status = 'owned';
  building.occupantCompanyId = company.id;
  post(state, company.id, 'property', `Purchase — ${building.address}`, -building.value);
  return { ok: true, message: `${building.address} purchased.` };
}

export function sellBuilding(state: GameState, buildingId: string): { ok: boolean; message: string } {
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.status !== 'owned') return { ok: false, message: 'You do not own this building.' };
  if (building.businessId) return { ok: false, message: 'Close the business here before selling.' };
  const company = playerCompany(state);
  // Agent fees and transfer tax take a bite out of every sale.
  const proceeds = Math.round(building.value * 0.94);
  building.status = 'available';
  building.occupantCompanyId = null;
  post(state, company.id, 'property', `Sale — ${building.address}`, proceeds);
  return { ok: true, message: `Sold for €${proceeds.toLocaleString('en-GB')} after fees.` };
}

export function endLease(state: GameState, buildingId: string): { ok: boolean; message: string } {
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.status !== 'rented') return { ok: false, message: 'That unit is not leased by you.' };
  if (building.businessId) return { ok: false, message: 'Close the business here before ending the lease.' };
  const company = playerCompany(state);
  const refund = Math.round(building.rent * 1.5);
  building.status = 'available';
  building.occupantCompanyId = null;
  post(state, company.id, 'rent', `Deposit returned — ${building.address}`, refund);
  return { ok: true, message: 'Lease ended, part of the deposit returned.' };
}

export const RENOVATION_DAYS = 6;

export function renovate(state: GameState, buildingId: string): { ok: boolean; message: string } {
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.occupantCompanyId !== state.playerCompanyId) {
    return { ok: false, message: 'You must rent or own the building first.' };
  }
  if (building.renovationEndsOnDay !== null) return { ok: false, message: 'Renovation already under way.' };
  if (building.condition >= 97) return { ok: false, message: 'This unit is already in excellent condition.' };
  const cost = Math.round(building.size * (100 - building.condition) * 1.9);
  const company = playerCompany(state);
  if (company.cash < cost) return { ok: false, message: `Renovation would cost €${cost.toLocaleString('en-GB')}.` };
  building.renovationEndsOnDay = state.day + RENOVATION_DAYS;
  post(state, company.id, 'renovation', `Renovation — ${building.address}`, -cost);
  return { ok: true, message: `Work starts today and takes ${RENOVATION_DAYS} days.` };
}

export function renovationCost(building: Building): number {
  return Math.round(building.size * (100 - building.condition) * 1.9);
}

// -------------------------------------------------------------- business

export function foundBusiness(
  state: GameState,
  typeId: string,
  buildingId: string,
  name: string,
): { ok: boolean; message: string; businessId?: string } {
  const type = businessTypeOrThrow(typeId);
  const building = buildingById(state, buildingId);
  if (!building) return { ok: false, message: 'Unknown building.' };
  if (building.occupantCompanyId !== state.playerCompanyId) {
    return { ok: false, message: 'Rent or buy the building first.' };
  }
  if (building.businessId) return { ok: false, message: 'There is already a business in this unit.' };
  if (building.size < type.minSize) {
    return { ok: false, message: `A ${type.name} needs at least ${type.minSize} m²; this unit is ${building.size} m².` };
  }
  const company = playerCompany(state);
  const cost = type.setupCost + type.equipmentCost;
  if (company.cash < cost) {
    return { ok: false, message: `Fit-out and equipment cost €${cost.toLocaleString('en-GB')}.` };
  }
  const trimmed = name.trim().slice(0, 40) || type.name;
  const business = createBusinessRecord(state, company, type, building, trimmed);
  state.businesses.push(business);
  building.businessId = business.id;
  post(state, company.id, 'setup', `Fit-out — ${trimmed}`, -type.setupCost, business.id);
  post(state, company.id, 'equipment', `Equipment — ${trimmed}`, -type.equipmentCost, business.id);
  // Refresh the applicant pool so it contains people this business can use.
  refreshApplicants(state);
  return { ok: true, message: `${trimmed} created. Stock it, staff it, then open the doors.`, businessId: business.id };
}

export function openBusiness(state: GameState, businessId: string): { ok: boolean; message: string } {
  const business = businessById(state, businessId);
  if (!business) return { ok: false, message: 'Unknown business.' };
  if (business.status === 'open') return { ok: false, message: 'Already open.' };
  const type = businessTypeOrThrow(business.typeId);
  if (type.productIds.length > 0) {
    const units = sum(Object.values(business.stock), (value) => value);
    if (units <= 0) return { ok: false, message: 'You cannot open with empty shelves. Order stock first.' };
  }
  if (employeesOf(state, businessId).length === 0) {
    return { ok: false, message: 'Hire at least one member of staff before opening.' };
  }
  business.status = 'open';
  business.openedOnDay = state.day;
  pushAlert(state, 'info', `${business.name} is open`, 'Trading has started. Watch the first day closely.', businessId);
  return { ok: true, message: `${business.name} is open for business.` };
}

export function closeBusiness(state: GameState, businessId: string): { ok: boolean; message: string } {
  const business = businessById(state, businessId);
  if (!business) return { ok: false, message: 'Unknown business.' };
  business.status = 'closed';
  return { ok: true, message: `${business.name} is closed. Rent and wages still apply.` };
}

export function shutDownBusiness(state: GameState, businessId: string): { ok: boolean; message: string } {
  const business = businessById(state, businessId);
  if (!business) return { ok: false, message: 'Unknown business.' };
  const company = playerCompany(state);
  // Remaining stock is dumped at half its cost price.
  let salvage = 0;
  for (const [productId, units] of Object.entries(business.stock)) {
    salvage += (business.costBasis[productId] ?? 0) * units * 0.5;
  }
  for (const employee of employeesOf(state, businessId)) {
    const severance = Math.round(employee.salary * 0.75);
    post(state, company.id, 'severance', `Severance — ${employee.name}`, -severance, businessId);
    state.employees = state.employees.filter((e) => e.id !== employee.id);
  }
  if (salvage > 0) post(state, company.id, 'other', `Stock clearance — ${business.name}`, salvage, businessId);

  const building = buildingById(state, business.buildingId);
  if (building) building.businessId = null;
  state.businesses = state.businesses.filter((b) => b.id !== businessId);
  return { ok: true, message: `${business.name} has been wound up.` };
}

export function setPrice(state: GameState, businessId: string, productId: string, price: number): boolean {
  const business = businessById(state, businessId);
  if (!business || !Number.isFinite(price)) return false;
  const def = product(productId);
  const ceiling = def ? def.marketPrice * 5 : 100000;
  business.prices[productId] = Number(clamp(price, 0.05, ceiling).toFixed(2));
  return true;
}

export function setHours(state: GameState, businessId: string, from: number, to: number): boolean {
  const business = businessById(state, businessId);
  if (!business) return false;
  business.openFrom = clamp(Math.round(from), 0, 23);
  business.openTo = clamp(Math.round(to), 1, 24);
  return true;
}

export function setMarketingBudget(state: GameState, businessId: string, budget: number): boolean {
  const business = businessById(state, businessId);
  if (!business || !Number.isFinite(budget)) return false;
  business.marketingBudget = Math.max(0, Math.round(budget));
  return true;
}

export function setReorderPoint(state: GameState, businessId: string, productId: string, value: number): boolean {
  const business = businessById(state, businessId);
  if (!business || !Number.isFinite(value)) return false;
  business.reorderPoints[productId] = Math.round(clamp(value, 0, 9999));
  return true;
}

// ------------------------------------------------------------ hourly sales

/** Units of storage the current stock occupies. */
export function storageUsed(business: Business): number {
  let total = 0;
  for (const [productId, units] of Object.entries(business.stock)) {
    const def = product(productId);
    if (def) total += def.volume * units;
  }
  return total;
}

export function storageFree(state: GameState, business: Business): number {
  const building = buildingById(state, business.buildingId);
  if (!building) return 0;
  return Math.max(0, building.storageCapacity - storageUsed(business));
}

/** How many customers the business can physically handle this hour. */
export function hourlyCapacity(state: GameState, business: Business): number {
  const building = buildingById(state, business.buildingId);
  const power = staffPower(state, business);
  // The owner works the floor too, but only at the pace this kind of business
  // allows: half a person's throughput. A cleaning round cannot be rushed the
  // way a till queue can.
  const owner = businessTypeOrThrow(business.typeId).customersPerStaffHour * 0.5;
  const floorLimit = building ? building.customerCapacity * 3 : Infinity;
  return Math.min(power.capacityPerHour + owner, floorLimit);
}

/**
 * Turns allocated customers into sales for one player business, for one hour.
 */
export function tradeHour(state: GameState, business: Business, allocation: Allocation | undefined): void {
  if (business.status !== 'open' || !isTradingHour(state, business)) return;
  const arrivals = allocation?.customers ?? 0;
  if (arrivals <= 0) return;

  const type = businessTypeOrThrow(business.typeId);
  const capacity = hourlyCapacity(state, business);
  const served = Math.min(arrivals, capacity);
  const turnedAway = Math.max(0, arrivals - capacity);

  let revenue = 0;
  let cogs = 0;
  let units = 0;
  let unmet = 0;

  if (type.productIds.length === 0) {
    // Pure service business: fee per customer served.
    const fee = business.prices.service ?? type.serviceFee;
    revenue = served * fee;
  } else {
    // Spread the basket over the range, weighted by how appealing each item is.
    const defs = type.productIds
      .map((id) => product(id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
    const appealTotal = sum(defs, (d) => d.appeal);
    if (appealTotal <= 0) return;

    for (const def of defs) {
      const share = def.appeal / appealTotal;
      const wanted = served * share * def.unitsPerBasket;
      if (wanted <= 0) continue;
      const available = business.stock[def.id] ?? 0;
      const sold = Math.min(wanted, available);
      if (sold > 0) {
        business.stock[def.id] = available - sold;
        const price = business.prices[def.id] ?? def.marketPrice;
        revenue += sold * price;
        cogs += sold * (business.costBasis[def.id] ?? def.wholesalePrice);
        units += sold;
      }
      unmet += wanted - sold;
    }

    // Service businesses that also sell goods still collect their fee.
    if (type.serviceFee > 0) revenue += served * (business.prices.service ?? type.serviceFee);
  }

  if (revenue > 0) {
    post(state, business.companyId, type.productIds.length > 0 ? 'sales' : 'service', `Takings — ${business.name}`, revenue, business.id);
    business.today.revenue += revenue;
    business.today.cogs += cogs;
    business.today.units += units;
    business.totals.revenue += revenue;
    business.totals.units += units;
    state.stats.unitsTotal += units;
  }

  business.today.customers += served;
  business.today.lostCustomers += turnedAway;
  business.totals.customers += served;
  state.stats.customersTotal += served;

  // Queues and empty shelves both hurt, and the player can see which.
  if (turnedAway > served * 0.15 && turnedAway > 2) {
    business.serviceQuality = clamp(business.serviceQuality - turnedAway * 0.05, 0, 100);
  }
  if (unmet > 0) {
    business.serviceQuality = clamp(business.serviceQuality - unmet * 0.02, 0, 100);
  }
}

// ------------------------------------------------------------ daily update

export function businessDaily(state: GameState, business: Business): number {
  const building = buildingById(state, business.buildingId);
  const type = businessTypeOrThrow(business.typeId);
  if (!building) return 0;

  // Cost of goods sold, booked once a day so the ledger stays readable.
  if (business.today.cogs > 0) {
    postNonCash(state, business.companyId, 'cogs', `Cost of goods — ${business.name}`, -business.today.cogs, business.id);
  }

  // Rent and utilities, charged daily from the monthly figure.
  const events = eventFactors(state, building.district);
  const dailyRent = building.status === 'rented' ? (building.rent * events.rent) / 30 : 0;
  const utilities = ((building.rent * UTILITY_RATE) / 30) * (building.status === 'owned' ? 1.1 : 1);
  if (dailyRent > 0) {
    post(state, business.companyId, 'rent', `Rent — ${business.name}`, -dailyRent, business.id);
    business.today.rent += dailyRent;
  }
  if (utilities > 0) {
    post(state, business.companyId, 'utilities', `Utilities — ${business.name}`, -utilities, business.id);
    business.today.otherCosts += utilities;
  }

  // Marketing spend for the day.
  if (business.marketingBudget > 0 && business.status === 'open') {
    post(state, business.companyId, 'marketing', `Marketing — ${business.name}`, -business.marketingBudget, business.id);
    business.today.marketing += business.marketingBudget;
  }

  // Service quality recovers toward what the team can actually deliver.
  const power = staffPower(state, business);
  const targetService = clamp(
    power.headcount === 0 ? 25 : 30 + power.service * 45 + (building.condition - 60) * 0.25,
    0,
    100,
  );
  business.serviceQuality = approach(business.serviceQuality, targetService, 0.3);

  // Reviews: customers rate value for money, service and availability.
  if (business.today.customers > 3 && business.status === 'open') {
    // Value for money is judged against the market price, not in absolute terms.
    const valueScore = clamp(1.15 / Math.max(0.4, priceIndex(business)), 0.3, 1.9);
    const availability = clamp(
      1 - business.today.lostCustomers / Math.max(1, business.today.customers + business.today.lostCustomers),
      0,
      1,
    );
    const raw = clamp(
      0.6 + valueScore * 0.9 + (business.serviceQuality / 100) * 1.4 + availability * 0.9 + gameRng.range(-0.3, 0.3),
      1,
      5,
    );
    const newReviews = Math.max(1, Math.round(business.today.customers / 45));
    const total = business.reviewScore * business.reviewCount + raw * newReviews;
    business.reviewCount += newReviews;
    business.reviewScore = clamp(total / business.reviewCount, 1, 5);
    // Reputation follows the review score, slowly.
    business.reputation = approach(business.reputation, ((business.reviewScore - 1) / 4) * 100, 0.16);
  } else if (business.status === 'open') {
    business.reputation = approach(business.reputation, 30, 0.03);
  }

  // Awareness: marketing pushes it up, and it decays without spend.
  const districtDef = district(building.district);
  const reachPerEuro = 26000 / Math.max(4000, districtDef.population);
  const gain = Math.sqrt(business.marketingBudget) * reachPerEuro * 0.9;
  const wordOfMouth = (business.today.customers / Math.max(400, districtDef.population * 0.02)) * 6;
  business.awareness = clamp(business.awareness * 0.975 + gain + wordOfMouth, 0, 100);

  // Perishables spoil.
  spoilStock(state, business);

  const profit =
    business.today.revenue -
    (business.today.cogs +
      business.today.wages +
      business.today.rent +
      business.today.marketing +
      business.today.otherCosts);

  business.totals.costs +=
    business.today.cogs + business.today.wages + business.today.rent + business.today.marketing + business.today.otherCosts;
  business.profitHistory.push(profit);
  if (business.profitHistory.length > 30) business.profitHistory.shift();

  business.yesterday = business.today;
  business.today = emptyDayStats();

  // Alerts the player would want to act on.
  if (business.status === 'open') {
    // Only worth mentioning when nothing is already on its way.
    const lowStock = type.productIds.filter(
      (id) => (business.stock[id] ?? 0) <= (business.reorderPoints[id] ?? 0) && (business.incoming[id] ?? 0) <= 0,
    );
    if (lowStock.length > 0) {
      pushAlert(
        state,
        lowStock.length >= type.productIds.length ? 'critical' : 'warning',
        `Low stock at ${business.name}`,
        `${lowStock.map((id) => product(id)?.name ?? id).join(', ')} at or below the reorder point.`,
        business.id,
      );
    }
    if (profit < 0 && business.profitHistory.length >= 3 && business.profitHistory.slice(-3).every((p) => p < 0)) {
      pushAlert(
        state,
        'warning',
        `${business.name} is losing money`,
        `Three days of losses, most recently €${Math.abs(Math.round(profit))}. Check pricing, staffing and rent.`,
        business.id,
      );
    }
    if (business.yesterday.lostCustomers > business.yesterday.customers * 0.25 && business.yesterday.lostCustomers > 10) {
      pushAlert(
        state,
        'warning',
        `${business.name} is turning customers away`,
        `${Math.round(business.yesterday.lostCustomers)} customers could not be served yesterday. More staff would convert them.`,
        business.id,
      );
    }
  }

  return profit;
}

function spoilStock(state: GameState, business: Business): void {
  let wasted = 0;
  for (const [productId, units] of Object.entries(business.stock)) {
    if (units <= 0) continue;
    const def = product(productId);
    if (!def || def.shelfLife <= 0) continue;
    // A fraction of perishable stock is written off each day.
    const rate = clamp(1 / (def.shelfLife * 2.2), 0.02, 0.4);
    const lost = units * rate;
    if (lost < 0.01) continue;
    business.stock[productId] = Math.max(0, units - lost);
    const value = lost * (business.costBasis[productId] ?? def.wholesalePrice);
    wasted += value;
    postNonCash(state, business.companyId, 'cogs', `Waste — ${business.name}`, -value, business.id);
  }
  if (wasted > 25) {
    pushAlert(
      state,
      'warning',
      `Stock is going to waste at ${business.name}`,
      `About ${Math.round(wasted)} euro of perishable stock was thrown away. Order smaller amounts more often, or fit refrigeration.`,
      business.id,
    );
  }
}

/** Average margin across the range, used in the business panel. */
export function grossMargin(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  if (type.productIds.length === 0) return 1;
  let revenue = 0;
  let cost = 0;
  for (const productId of type.productIds) {
    const def = product(productId);
    if (!def) continue;
    const price = business.prices[productId] ?? def.marketPrice;
    revenue += price * def.appeal;
    cost += (business.costBasis[productId] ?? def.wholesalePrice) * def.appeal;
  }
  return revenue > 0 ? (revenue - cost) / revenue : 0;
}
