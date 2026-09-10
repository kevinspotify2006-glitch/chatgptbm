import type { GameState } from './state';
import { playerBusinesses, playerCompany } from './state';
import { pushAlert } from './alerts';
import { businessType } from '../data/businessTypes';
import { clamp, sum } from './util';

export type ScenarioId = 'demand_surge' | 'supplier_pressure' | 'staff_shortage' | 'cash_squeeze';
export interface DecisionRecord { day: number; title: string; choice: string; consequence: string; }
export interface DirectorState {
  version: 1;
  decisions: DecisionRecord[];
  activeScenario: ScenarioId | null;
  scenarioEndsOnDay: number;
  scenarioResolved: boolean;
  lastScenarioDay: number;
  lastWhy: string;
  forecast: { revenue: number; profit: number; cash: number };
}

function createState(): DirectorState { return { version: 1, decisions: [], activeScenario: null, scenarioEndsOnDay: 0, scenarioResolved: false, lastScenarioDay: 0, lastWhy: '', forecast: { revenue: 0, profit: 0, cash: 0 } }; }
export function directorState(state: GameState): DirectorState {
  const holder = state as GameState & { director?: DirectorState };
  if (!holder.director) holder.director = createState();
  return holder.director;
}

export function explainBusiness(state: GameState, businessId: string): string[] {
  const b = state.businesses.find((x) => x.id === businessId); if (!b) return [];
  const type = businessType(b.typeId); const reasons: string[] = [];
  const capacity = Math.max(1, (state.buildings.find((x) => x.id === b.buildingId)?.customerCapacity ?? type?.baseCustomers ?? 1));
  const utilization = b.today.customers / capacity;
  if (utilization < .45) reasons.push('Demand is below the location capacity, so footfall, awareness, price or local preferences are limiting sales.');
  if (utilization > 1.1) reasons.push('Demand is pressing against capacity; more staff or a larger location could capture missed customers.');
  if (b.serviceQuality < 55) reasons.push('Service quality is weak and can reduce conversion, reviews and repeat customers.');
  if (b.reviewScore < 3.5 && b.reviewCount > 5) reasons.push('Customer reviews are pulling reputation down.');
  if (b.marketingBudget < 25 && b.awareness < 35) reasons.push('Awareness is low and marketing spend is modest, limiting customer acquisition.');
  if (Object.keys(b.stock).length && Object.values(b.stock).some((v) => v <= 0)) reasons.push('At least one product is out of stock, causing lost sales.');
  if (reasons.length === 0) reasons.push('No single bottleneck dominates: performance is being supported by balanced demand, quality and operations.');
  return reasons.slice(0, 4);
}

function chooseScenario(state: GameState): ScenarioId | null {
  const company = playerCompany(state); const open = playerBusinesses(state).filter((b) => b.status === 'open');
  if (!open.length) return null;
  const avgCash = company.cash;
  if (avgCash < 12000) return 'cash_squeeze';
  if (state.economy.unemployment > .085) return 'staff_shortage';
  if (state.economy.inflation > 1.06) return 'supplier_pressure';
  if (state.economy.growth > .045) return 'demand_surge';
  return null;
}

export function resolveScenario(state: GameState, choice: 'invest' | 'protect' | 'ignore'): void {
  const d = directorState(state); const scenario = d.activeScenario; if (!scenario || d.scenarioResolved) return;
  const company = playerCompany(state); let consequence = '';
  if (scenario === 'demand_surge') {
    if (choice === 'invest' && company.cash >= 5000) { company.cash -= 5000; for (const b of playerBusinesses(state)) b.awareness = clamp(b.awareness + 4, 0, 100); consequence = '€5,000 invested in capacity and awareness; your businesses are positioned to capture more demand.'; }
    else if (choice === 'protect') consequence = 'You protected cash and accepted that some surge demand may be missed.';
    else consequence = 'You made no investment and left the temporary demand opportunity largely untouched.';
  } else if (scenario === 'supplier_pressure') {
    if (choice === 'invest' && company.cash >= 3000) { company.cash -= 3000; for (const b of playerBusinesses(state)) b.reorderPoints = Object.fromEntries(Object.entries(b.reorderPoints).map(([k,v]) => [k, Math.round(v * 1.2)])); consequence = '€3,000 committed to safer inventory buffers, reducing stockout risk.'; }
    else if (choice === 'protect') consequence = 'You protected cash and accepted a higher stockout risk while supplier costs are elevated.';
    else consequence = 'You ignored the pressure; margins may remain under strain until prices normalise.';
  } else if (scenario === 'staff_shortage') {
    if (choice === 'invest' && company.cash >= 2500) { company.cash -= 2500; for (const e of state.employees.filter((x) => x.companyId === company.id)) e.morale = clamp(e.morale + 8, 0, 100); consequence = '€2,500 spent on retention and recruitment pressure; staff morale improved.'; }
    else if (choice === 'protect') consequence = 'You protected cash but accepted lower staffing resilience.';
    else consequence = 'You made no intervention; service capacity may suffer while labour is tight.';
  } else {
    if (choice === 'protect') { consequence = 'You protected liquidity and reduced expansion risk.'; }
    else if (choice === 'invest' && company.cash >= 2000) { company.cash -= 2000; consequence = '€2,000 invested in a controlled push to stabilise customer acquisition.'; }
    else consequence = 'You avoided additional spending while cash remains tight.';
  }
  d.decisions.unshift({ day: state.day, title: scenarioTitle(scenario), choice, consequence }); d.decisions = d.decisions.slice(0, 50); d.scenarioResolved = true; d.lastWhy = consequence;
  pushAlert(state, 'info', 'Scenario resolved', consequence, null);
}

function scenarioTitle(id: ScenarioId): string { return ({ demand_surge: 'Demand surge', supplier_pressure: 'Supplier cost pressure', staff_shortage: 'Labour pressure', cash_squeeze: 'Cash squeeze' })[id]; }
export function currentScenario(state: GameState): { id: ScenarioId; title: string; description: string } | null {
  const d = directorState(state); if (!d.activeScenario || d.scenarioResolved) return null;
  const id = d.activeScenario;
  const description: Record<ScenarioId,string> = {
    demand_surge: 'The economy is expanding. Decide whether to invest to capture extra demand or protect cash.',
    supplier_pressure: 'Input costs are rising. Decide whether to build a buffer or protect liquidity.',
    staff_shortage: 'Labour is tight. Decide whether to invest in retention or accept lower resilience.',
    cash_squeeze: 'Liquidity is under pressure. Protect cash or make a controlled investment with limited runway.',
  };
  return { id, title: scenarioTitle(id), description: description[id] };
}

function forecast(state: GameState): void {
  const d = directorState(state); const history = state.dayHistory.slice(-14); const avgRevenue = history.length ? sum(history, x => x.revenue) / history.length : 0; const avgProfit = history.length ? sum(history, x => x.profit) / history.length : 0; const cash = playerCompany(state).cash;
  d.forecast = { revenue: avgRevenue * 7, profit: avgProfit * 7, cash: cash + avgProfit * 7 };
}

export function settleDirector(state: GameState): void {
  const d = directorState(state); forecast(state);
  if (d.activeScenario && state.day >= d.scenarioEndsOnDay && !d.scenarioResolved) {
    resolveScenario(state, 'protect');
  }
  if (state.day - d.lastScenarioDay >= 14 && !d.activeScenario) {
    const next = chooseScenario(state);
    if (next) { d.activeScenario = next; d.scenarioEndsOnDay = state.day + 7; d.scenarioResolved = false; d.lastScenarioDay = state.day; pushAlert(state, 'warning', scenarioTitle(next), currentScenario(state)?.description ?? '', null); }
  }
}
