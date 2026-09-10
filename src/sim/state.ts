import type {
  ActiveEvent, Alert, Building, Business, Campaign, Company, DayRecord, DistrictId, Employee, LedgerEntry, Loan, PurchaseOrder,
} from './types';
import type { AdvancedState } from './advanced';
import type { DeepSimulationState } from './deepSimulation';
import type { World2State } from './world2';
import type { DirectorState } from './director';
import type { Living3State } from './living3';

export const SAVE_VERSION = 6;
export const STORAGE_KEY = 'business-manager:save';
export const SETTINGS_KEY = 'business-manager:settings';
export const START_CASH = 60000;
export const START_DAY = 1;
export const START_HOUR = 8;
export const LEDGER_LIMIT = 600;
export const DAY_HISTORY_LIMIT = 365;
export const ALERT_LIMIT = 60;
export const SPEEDS = [0, 0.5, 1, 2, 4] as const;
export const SPEED_LABELS = ['❚❚', '1×', '2×', '4×', '8×'] as const;
export interface EconomyState { confidence: number; inflation: number; interestRate: number; unemployment: number; growth: number; }
export interface DistrictState { demandIndex: number; rentIndex: number; propertyIndex: number; }
export interface Settings { autosave: boolean; showTutorial: boolean; compactNumbers: boolean; confirmLargeSpend: boolean; }
export interface Achievement { id: string; unlockedOnDay: number; }
export interface GameState {
  version: number; seed: number; day: number; hour: number; speed: number; playerCompanyId: string;
  companies: Company[]; businesses: Business[]; buildings: Building[]; employees: Employee[]; applicants: Employee[]; orders: PurchaseOrder[]; campaigns: Campaign[]; loans: Loan[]; ledger: LedgerEntry[]; dayHistory: DayRecord[];
  alerts: Alert[]; events: ActiveEvent[]; economy: EconomyState; districts: Record<DistrictId, DistrictState>; supplierSpend: Record<string, number>; achievements: Achievement[]; tutorialStep: number; settings: Settings;
  stats: { revenueTotal: number; costsTotal: number; customersTotal: number; unitsTotal: number; peakNetWorth: number; bankrupt: boolean; };
  advanced?: AdvancedState;
  simulation?: DeepSimulationState;
  world2?: World2State;
  director?: DirectorState;
  living3?: Living3State;
}
export const DEFAULT_SETTINGS: Settings = { autosave: true, showTutorial: true, compactNumbers: true, confirmLargeSpend: true };
export const DEFAULT_ECONOMY: EconomyState = { confidence: 100, inflation: 1, interestRate: 0.045, unemployment: 0.062, growth: 0.024 };
export function defaultDistrictState(): DistrictState { return { demandIndex: 1, rentIndex: 1, propertyIndex: 1 }; }
export function absoluteHour(state: GameState): number { return state.day * 24 + state.hour; }
export function playerCompany(state: GameState): Company { const company = state.companies.find((c) => c.id === state.playerCompanyId); if (!company) throw new Error('Player company missing from state'); return company; }
export function companyById(state: GameState, id: string): Company | undefined { return state.companies.find((c) => c.id === id); }
export function businessById(state: GameState, id: string): Business | undefined { return state.businesses.find((b) => b.id === id); }
export function buildingById(state: GameState, id: string): Building | undefined { return state.buildings.find((b) => b.id === id); }
export function employeeById(state: GameState, id: string): Employee | undefined { return state.employees.find((e) => e.id === id); }
export function playerBusinesses(state: GameState): Business[] { return state.businesses.filter((b) => b.companyId === state.playerCompanyId); }
export function competitorBusinesses(state: GameState): Business[] { return state.businesses.filter((b) => b.companyId !== state.playerCompanyId); }
export function businessesInDistrict(state: GameState, district: DistrictId): Business[] { const ids = new Set(state.buildings.filter((b) => b.district === district).map((b) => b.id)); return state.businesses.filter((b) => ids.has(b.buildingId)); }
export function employeesOf(state: GameState, businessId: string): Employee[] { return state.employees.filter((e) => e.businessId === businessId); }
