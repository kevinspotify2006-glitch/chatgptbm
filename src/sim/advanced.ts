import type { GameState } from './state';
import { buildingById, companyById, playerBusinesses, playerCompany } from './state';
import { pushAlert } from './alerts';
import { makeId, clamp } from './util';

export interface Warehouse { id: string; buildingId: string; companyId: string; capacity: number; used: number; efficiency: number; }
export interface LogisticsRoute { id: string; fromBusinessId: string; toBusinessId: string; unitsPerDay: number; costPerUnit: number; active: boolean; }
export interface Contract { id: string; companyId: string; businessId: string; customer: string; productId: string | null; unitsPerDay: number; pricePerUnit: number; daysLeft: number; penalty: number; reward: number; }
export interface Research { id: string; name: string; description: string; cost: number; prerequisite?: string; effect: string; }
export interface AdvancedState { warehouses: Warehouse[]; routes: LogisticsRoute[]; contracts: Contract[]; researched: string[]; researchPoints: number; autoPricing: boolean; autoScheduling: boolean; sandbox: boolean; holdings: string[]; }

export const RESEARCH: Research[] = [
  { id: 'forecasting', name: 'Demand Forecasting', description: 'Improves automated pricing and replenishment decisions.', cost: 100, effect: 'forecasting' },
  { id: 'logistics', name: 'Route Optimisation', description: 'Reduces logistics costs and increases route capacity.', cost: 150, prerequisite: 'forecasting', effect: 'logistics' },
  { id: 'crm', name: 'Customer Intelligence', description: 'Improves reputation and contract retention.', cost: 180, prerequisite: 'forecasting', effect: 'crm' },
  { id: 'automation', name: 'Operational Automation', description: 'Unlocks smarter automatic scheduling and pricing.', cost: 240, prerequisite: 'logistics', effect: 'automation' },
  { id: 'holding', name: 'Corporate Structure', description: 'Reduces acquisition friction and enables a holding company.', cost: 300, prerequisite: 'crm', effect: 'holding' },
];

function advanced(state: GameState): AdvancedState {
  const root = state as GameState & { advanced?: AdvancedState };
  if (!root.advanced) root.advanced = { warehouses: [], routes: [], contracts: [], researched: [], researchPoints: 0, autoPricing: false, autoScheduling: false, sandbox: false, holdings: [] };
  return root.advanced;
}

export function advancedState(state: GameState): AdvancedState { return advanced(state); }
export function addResearchPoints(state: GameState, points: number): void { advanced(state).researchPoints += Math.max(0, points); }

export function research(state: GameState, researchId: string): boolean {
  const a = advanced(state); const r = RESEARCH.find((x) => x.id === researchId);
  if (!r || a.researched.includes(researchId) || a.researchPoints < r.cost || (r.prerequisite && !a.researched.includes(r.prerequisite))) return false;
  a.researchPoints -= r.cost; a.researched.push(researchId); pushAlert(state, 'info', `Research complete: ${r.name}`, r.description, null); return true;
}

export function createWarehouse(state: GameState, buildingId: string, capacity: number): boolean {
  const a = advanced(state); const building = buildingById(state, buildingId); const company = playerCompany(state);
  if (!building || building.status === 'competitor' || a.warehouses.some((w) => w.buildingId === buildingId) || capacity <= 0) return false;
  const cost = 12000 + capacity * 8; if (company.cash < cost) return false;
  company.cash -= cost; building.status = 'owned'; building.occupantCompanyId = company.id;
  a.warehouses.push({ id: makeId('wh'), buildingId, companyId: company.id, capacity, used: 0, efficiency: a.researched.includes('logistics') ? 1.2 : 1 }); return true;
}

export function createRoute(state: GameState, fromBusinessId: string, toBusinessId: string, unitsPerDay: number): boolean {
  const a = advanced(state); if (fromBusinessId === toBusinessId || unitsPerDay <= 0) return false;
  if (!playerBusinesses(state).some((b) => b.id === fromBusinessId) || !playerBusinesses(state).some((b) => b.id === toBusinessId)) return false;
  a.routes.push({ id: makeId('route'), fromBusinessId, toBusinessId, unitsPerDay, costPerUnit: a.researched.includes('logistics') ? 0.7 : 1, active: true }); return true;
}

export function createContract(state: GameState, businessId: string, customer: string, unitsPerDay: number, pricePerUnit: number, days = 30): boolean {
  const a = advanced(state); if (!playerBusinesses(state).some((b) => b.id === businessId) || unitsPerDay <= 0 || pricePerUnit <= 0) return false;
  a.contracts.push({ id: makeId('contract'), companyId: state.playerCompanyId, businessId, customer, productId: null, unitsPerDay, pricePerUnit, daysLeft: days, penalty: unitsPerDay * pricePerUnit * 0.25, reward: unitsPerDay * pricePerUnit * days * 0.04 }); return true;
}

export function acquireBusiness(state: GameState, businessId: string): boolean {
  const a = advanced(state); const target = state.businesses.find((b) => b.id === businessId); const company = playerCompany(state);
  if (!target || target.companyId === company.id || target.status !== 'open' || !a.researched.includes('holding')) return false;
  const targetCompany = companyById(state, target.companyId); if (!targetCompany) return false;
  const price = Math.max(15000, target.totals.revenue * 0.15 + Math.max(0, target.reputation) * 250); if (company.cash < price) return false;
  company.cash -= price; target.companyId = company.id; target.employeeIds.forEach((id) => { const e = state.employees.find((x) => x.id === id); if (e) e.companyId = company.id; });
  if (!a.holdings.includes(company.id)) a.holdings.push(company.id); targetCompany.brandAwareness *= 0.98; return true;
}

export function toggleSandbox(state: GameState): void { advanced(state).sandbox = !advanced(state).sandbox; }
export function toggleAutomation(state: GameState, kind: 'pricing' | 'scheduling'): void { const a = advanced(state); if (kind === 'pricing') a.autoPricing = !a.autoPricing; else a.autoScheduling = !a.autoScheduling; }

function automatedOperations(state: GameState): void {
  const a = advanced(state);
  for (const business of playerBusinesses(state)) {
    if (business.status !== 'open') continue;
    if (a.autoPricing && (a.researched.includes('forecasting') || a.sandbox)) for (const productId of Object.keys(business.prices)) {
      const current = business.prices[productId]; if (!Number.isFinite(current) || current <= 0) continue;
      const stock = business.stock[productId] ?? 0; const incoming = business.incoming[productId] ?? 0;
      const factor = stock + incoming < Math.max(2, business.reorderPoints[productId] ?? 2) ? 1.025 : business.today.customers > 0 ? 0.995 : 1;
      business.prices[productId] = Math.max(0.5, current * factor);
    }
    if (a.autoScheduling && (a.researched.includes('automation') || a.sandbox)) {
      const employees = state.employees.filter((e) => e.businessId === business.id); const stress = employees.reduce((n, e) => n + e.stress, 0);
      if (employees.length > 0 && stress / employees.length > 75) { business.openFrom = Math.min(12, business.openFrom + 1); business.openTo = Math.max(business.openFrom + 4, business.openTo - 1); }
    }
  }
}

function settleContracts(state: GameState): void {
  const a = advanced(state);
  for (const c of a.contracts) {
    if (c.daysLeft <= 0) continue; const business = state.businesses.find((b) => b.id === c.businessId); if (!business) continue;
    const fulfilled = Math.min(c.unitsPerDay, business.today.customers); const revenue = fulfilled * c.pricePerUnit;
    if (revenue > 0) { const company = playerCompany(state); company.cash += revenue; business.today.revenue += revenue; business.totals.revenue += revenue; }
    if (fulfilled + 0.01 < c.unitsPerDay) { playerCompany(state).cash -= c.penalty; business.today.otherCosts += c.penalty; }
    c.daysLeft -= 1; if (c.daysLeft === 0) pushAlert(state, 'info', `Contract completed: ${c.customer}`, `The ${c.customer} agreement has ended.`, business.id);
  }
  a.contracts.splice(0, a.contracts.length, ...a.contracts.filter((c) => c.daysLeft > 0));
}

function settleRoutes(state: GameState): void {
  const a = advanced(state);
  for (const r of a.routes.filter((x) => x.active)) {
    const from = state.businesses.find((b) => b.id === r.fromBusinessId); const to = state.businesses.find((b) => b.id === r.toBusinessId); if (!from || !to) continue;
    const units = Math.min(r.unitsPerDay, Object.values(from.stock).reduce((n, v) => n + v, 0)); const cost = units * r.costPerUnit; if (units <= 0) continue;
    let remaining = units; for (const [productId, qty] of Object.entries(from.stock)) { if (remaining <= 0) break; const move = Math.min(qty, remaining); from.stock[productId] = qty - move; to.stock[productId] = (to.stock[productId] ?? 0) + move; remaining -= move; }
    playerCompany(state).cash -= cost; to.today.otherCosts += cost;
  }
}

export function settleAdvancedWorld(state: GameState): void {
  const a = advanced(state); a.researchPoints += Math.max(1, Math.round((state.economy.growth + 0.02) * 10)); automatedOperations(state); settleRoutes(state); settleContracts(state);
  for (const w of a.warehouses) w.used = clamp(w.used, 0, w.capacity * w.efficiency);
}
