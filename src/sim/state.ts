import type {
  ActiveEvent,
  Alert,
  Building,
  Business,
  Campaign,
  Company,
  DayRecord,
  DistrictId,
  Employee,
  LedgerEntry,
  Loan,
  PurchaseOrder,
} from './types';

export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'business-manager:save';
export const SETTINGS_KEY = 'business-manager:settings';

/**
 * Starting capital. Tight enough that the first choice matters, but large
 * enough that more than one kind of business is actually reachable — a food
 * or specialist opening needs a fit-out a retail unit does not.
 */
export const START_CASH = 60000;
export const START_DAY = 1;
export const START_HOUR = 8;

export const LEDGER_LIMIT = 600;
export const DAY_HISTORY_LIMIT = 365;
export const ALERT_LIMIT = 60;

/** In-game hours advanced per real second at each speed setting. */
export const SPEEDS = [0, 0.5, 1, 2, 4] as const;
export const SPEED_LABELS = ['❚❚', '1×', '2×', '4×', '8×'] as const;

export interface EconomyState {
  /** 0..200, 100 is neutral. Drives how freely people spend. */
  confidence: number;
  /** Cumulative price level, 1.0 at the start. */
  inflation: number;
  /** Yearly base interest rate, e.g. 0.045. */
  interestRate: number;
  /** 0..1 */
  unemployment: number;
  /** Yearly growth rate of the whole city economy. */
  growth: number;
}

export interface DistrictState {
  /** Multiplier on customer demand in this district. */
  demandIndex: number;
  /** Multiplier on rent asked here. */
  rentIndex: number;
  /** Multiplier on property values here. */
  propertyIndex: number;
}

export interface Settings {
  autosave: boolean;
  showTutorial: boolean;
  compactNumbers: boolean;
  confirmLargeSpend: boolean;
}

export interface Achievement {
  id: string;
  unlockedOnDay: number;
}

export interface GameState {
  version: number;
  seed: number;
  /** Day 1 is the first day of business. */
  day: number;
  /** 0..23 */
  hour: number;
  /** Index into SPEEDS. */
  speed: number;
  playerCompanyId: string;

  companies: Company[];
  businesses: Business[];
  buildings: Building[];
  employees: Employee[];
  /** People available to hire right now. */
  applicants: Employee[];
  orders: PurchaseOrder[];
  campaigns: Campaign[];
  loans: Loan[];

  ledger: LedgerEntry[];
  dayHistory: DayRecord[];
  alerts: Alert[];
  events: ActiveEvent[];

  economy: EconomyState;
  districts: Record<DistrictId, DistrictState>;

  /** Cumulative money spent per supplier, for volume discounts. */
  supplierSpend: Record<string, number>;

  achievements: Achievement[];
  tutorialStep: number;
  settings: Settings;

  stats: {
    revenueTotal: number;
    costsTotal: number;
    customersTotal: number;
    unitsTotal: number;
    peakNetWorth: number;
    bankrupt: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  showTutorial: true,
  compactNumbers: true,
  confirmLargeSpend: true,
};

export const DEFAULT_ECONOMY: EconomyState = {
  confidence: 100,
  inflation: 1,
  interestRate: 0.045,
  unemployment: 0.062,
  growth: 0.024,
};

export function defaultDistrictState(): DistrictState {
  return { demandIndex: 1, rentIndex: 1, propertyIndex: 1 };
}

/** Absolute hour since day 0, used for order arrival times. */
export function absoluteHour(state: GameState): number {
  return state.day * 24 + state.hour;
}

// ---------------------------------------------------------------- lookups

export function playerCompany(state: GameState): Company {
  const company = state.companies.find((c) => c.id === state.playerCompanyId);
  if (!company) throw new Error('Player company missing from state');
  return company;
}

export function companyById(state: GameState, id: string): Company | undefined {
  return state.companies.find((c) => c.id === id);
}

export function businessById(state: GameState, id: string): Business | undefined {
  return state.businesses.find((b) => b.id === id);
}

export function buildingById(state: GameState, id: string): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function employeeById(state: GameState, id: string): Employee | undefined {
  return state.employees.find((e) => e.id === id);
}

/** Businesses the player owns, in the order they were opened. */
export function playerBusinesses(state: GameState): Business[] {
  return state.businesses.filter((b) => b.companyId === state.playerCompanyId);
}

export function competitorBusinesses(state: GameState): Business[] {
  return state.businesses.filter((b) => b.companyId !== state.playerCompanyId);
}

export function businessesInDistrict(state: GameState, district: DistrictId): Business[] {
  const ids = new Set(state.buildings.filter((b) => b.district === district).map((b) => b.id));
  return state.businesses.filter((b) => ids.has(b.buildingId));
}

export function employeesOf(state: GameState, businessId: string): Employee[] {
  return state.employees.filter((e) => e.businessId === businessId);
}
