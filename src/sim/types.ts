/**
 * Domain model for BUSINESS MANAGER.
 *
 * Anything ending in `Def` is static content loaded from `src/data` — it never
 * changes at runtime. Everything else is mutable simulation state and is what
 * the save file persists.
 */

// ---------------------------------------------------------------- city

export type DistrictId =
  | 'downtown'
  | 'financial'
  | 'highend'
  | 'midtown'
  | 'southside'
  | 'shopping'
  | 'entertainment'
  | 'industrial'
  | 'warehouse'
  | 'suburbs'
  | 'university'
  | 'tourist'
  | 'waterfront'
  | 'airport'
  | 'transit';

export interface AgeMix {
  young: number;
  adult: number;
  senior: number;
}

export interface DistrictDef {
  id: DistrictId;
  name: string;
  short: string;
  /** Map footprint in normalised city space (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  population: number;
  /** People per square kilometre, drives how close customers live. */
  density: number;
  /** Average yearly household income in euros. */
  averageIncome: number;
  /** 0..1 — how unevenly income is spread; high means rich and poor together. */
  incomeSpread: number;
  ageMix: AgeMix;
  /** Pedestrians passing a prime address on an average day. */
  footTraffic: number;
  vehicleTraffic: number;
  /** 0..2 — visitors from outside the city. */
  tourism: number;
  /** 0..2 — how much commercial activity already happens here. */
  commercialActivity: number;
  /** Euro per m² per month for commercial space. */
  rentPerSqm: number;
  /** Euro per m² to buy. */
  pricePerSqm: number;
  /** Yearly growth rate, e.g. 0.03. */
  growth: number;
  /** Category preference multipliers keyed by business category. */
  preferences: Partial<Record<BusinessCategory, number>>;
  colour: string;
  description: string;
}

export type BuildingStatus = 'available' | 'rented' | 'owned' | 'competitor';

export interface Building {
  id: string;
  address: string;
  district: DistrictId;
  /** Footprint on the map, in normalised city space (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Floor area in m². */
  size: number;
  floors: number;
  /** Monthly rent in euros. */
  rent: number;
  /** Asking price in euros. */
  price: number;
  /** Current market value; moves with the district. */
  value: number;
  /** Customers that fit inside at once. */
  customerCapacity: number;
  /** Units of stock the back room holds. */
  storageCapacity: number;
  parking: number;
  /** 0..100 — poor condition costs more upkeep and puts customers off. */
  condition: number;
  /** Pedestrians per day at this specific address. */
  footTraffic: number;
  /** Business categories that suit the building. */
  suitableFor: BusinessCategory[];
  status: BuildingStatus;
  /** Company that rents or owns it, if any. */
  occupantCompanyId: string | null;
  /** Business operating here, if any. */
  businessId: string | null;
  /** Set while a renovation is running. */
  renovationEndsOnDay: number | null;
}

// ------------------------------------------------------------ businesses

export type BusinessCategory = 'retail' | 'food' | 'services' | 'specialized';

export interface BusinessTypeDef {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string;
  /** Minimum floor area the type needs. */
  minSize: number;
  /** One-off fit-out cost before opening. */
  setupCost: number;
  /** Equipment the business needs; part of setup. */
  equipmentCost: number;
  /** Product ids this type sells. Empty for pure service businesses. */
  productIds: string[];
  /** Service businesses earn per served customer instead of selling stock. */
  serviceFee: number;
  /** Baseline customers per day at an average address before any modifiers. */
  baseCustomers: number;
  /** How many customers one employee can serve per hour. */
  customersPerStaffHour: number;
  /** Roles this business type needs, in hiring priority order. */
  roles: EmployeeRoleId[];
  /** Opening and closing hour in local time. */
  defaultOpenFrom: number;
  defaultOpenTo: number;
  /** 0..1 — how strongly customers here care about price versus quality. */
  priceSensitivity: number;
  icon: string;
}

export type BusinessStatus = 'setup' | 'open' | 'closed';

export interface Business {
  id: string;
  companyId: string;
  typeId: string;
  buildingId: string;
  name: string;
  status: BusinessStatus;
  openFrom: number;
  openTo: number;
  /** 0..100 customer-facing reputation. */
  reputation: number;
  /** 0..100 how well the place is run right now. */
  serviceQuality: number;
  /** Running average review score, 1..5. */
  reviewScore: number;
  reviewCount: number;
  /** Product id -> price the player charges. */
  prices: Record<string, number>;
  /** Product id -> units on the shelf. */
  stock: Record<string, number>;
  /** Product id -> units on order. */
  incoming: Record<string, number>;
  /** Product id -> weighted average purchase cost, so COGS is honest. */
  costBasis: Record<string, number>;
  /** Product id -> reorder trigger level. */
  reorderPoints: Record<string, number>;
  employeeIds: string[];
  /** Marketing spend allocated per day. */
  marketingBudget: number;
  /** 0..100 how many people in the district know the business. */
  awareness: number;
  /** Rolling daily figures, reset at the daily settlement. */
  today: BusinessDayStats;
  /** Yesterday's figures, kept for the trend arrows. */
  yesterday: BusinessDayStats;
  /** Lifetime totals. */
  totals: { revenue: number; costs: number; customers: number; units: number };
  /** Last 30 daily profit values, newest last. */
  profitHistory: number[];
  openedOnDay: number;
  autoRestock: boolean;
}

export interface BusinessDayStats {
  revenue: number;
  cogs: number;
  wages: number;
  rent: number;
  marketing: number;
  otherCosts: number;
  customers: number;
  lostCustomers: number;
  units: number;
}

export function emptyDayStats(): BusinessDayStats {
  return {
    revenue: 0,
    cogs: 0,
    wages: 0,
    rent: 0,
    marketing: 0,
    otherCosts: 0,
    customers: 0,
    lostCustomers: 0,
    units: 0,
  };
}

// -------------------------------------------------------------- products

export type ProductCategory =
  | 'groceries'
  | 'beverages'
  | 'prepared'
  | 'electronics'
  | 'apparel'
  | 'home'
  | 'sports'
  | 'pet'
  | 'beauty';

export interface ProductDef {
  id: string;
  name: string;
  category: ProductCategory;
  /** What a supplier charges at list price. */
  wholesalePrice: number;
  /** What the market considers a normal shelf price. */
  marketPrice: number;
  /** 0..1 build quality / brand tier. */
  quality: number;
  /** 0..1 how much people want it before any modifiers. */
  appeal: number;
  /**
   * Average units sold per visitor — across everyone who walks in, not just
   * the ones who buy. For bread that is above one; for a laptop it is a small
   * fraction, because most people browsing do not leave with one.
   */
  unitsPerBasket: number;
  weight: number;
  /** Storage units one item occupies. */
  volume: number;
  /** Days before the product spoils. 0 = non-perishable. */
  shelfLife: number;
}

export interface SupplierDef {
  id: string;
  name: string;
  /** Multiplier on wholesale price. */
  priceMultiplier: number;
  /** 0..1 chance a delivery arrives on schedule. */
  reliability: number;
  /** 0..1 quality of the goods delivered. */
  quality: number;
  /** Delivery time in hours. */
  leadTimeHours: number;
  minimumOrderValue: number;
  /** Product categories the supplier carries. */
  categories: ProductCategory[];
  /** Discount granted once the player passes a spend threshold. */
  volumeDiscount: number;
  volumeThreshold: number;
  description: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  businessId: string;
  lines: { productId: string; quantity: number; unitPrice: number }[];
  goodsCost: number;
  deliveryCost: number;
  total: number;
  placedOnTick: number;
  arrivesOnTick: number;
  status: 'transit' | 'delayed' | 'delivered';
}

// ------------------------------------------------------------- employees

export type EmployeeRoleId =
  | 'cashier'
  | 'sales'
  | 'manager'
  | 'warehouse'
  | 'driver'
  | 'cook'
  | 'server'
  | 'technician'
  | 'cleaner'
  | 'accountant'
  | 'marketer';

export interface EmployeeRoleDef {
  id: EmployeeRoleId;
  name: string;
  /** Monthly salary at skill 50. */
  baseSalary: number;
  description: string;
}

export type EmployeeTrait =
  | 'hardworker'
  | 'lazy'
  | 'ambitious'
  | 'loyal'
  | 'unreliable'
  | 'fastlearner'
  | 'perfectionist'
  | 'teamplayer'
  | 'difficult'
  | 'friendly';

export interface Employee {
  id: string;
  name: string;
  age: number;
  role: EmployeeRoleId;
  /** Monthly salary in euros. */
  salary: number;
  /** 0..100 */
  skill: number;
  experience: number;
  productivity: number;
  reliability: number;
  morale: number;
  stress: number;
  loyalty: number;
  traits: EmployeeTrait[];
  /** Business id, or null while in the applicant pool. */
  businessId: string | null;
  companyId: string | null;
  hiredOnDay: number;
  /** Days of training completed; drives diminishing returns. */
  trainingDays: number;
  /** Day the current training finishes, if any. */
  trainingEndsOnDay: number | null;
}

// -------------------------------------------------------------- companies

export interface Company {
  id: string;
  name: string;
  isPlayer: boolean;
  cash: number;
  /** 0..100 — banks lend more to a good credit rating. */
  creditRating: number;
  /** 0..100 — how well known the brand is across the city. */
  brandAwareness: number;
  foundedOnDay: number;
  /** AI only. */
  personality: CompetitorPersonality | null;
}

export type CompetitorPersonality =
  | 'lowcost'
  | 'premium'
  | 'aggressive'
  | 'conservative'
  | 'marketer'
  | 'quality'
  | 'opportunist';

// ---------------------------------------------------------------- finance

export type LedgerCategory =
  | 'sales'
  | 'service'
  | 'stock'
  | 'cogs'
  | 'wages'
  | 'rent'
  | 'utilities'
  | 'marketing'
  | 'logistics'
  | 'setup'
  | 'equipment'
  | 'property'
  | 'renovation'
  | 'loan'
  | 'interest'
  | 'tax'
  | 'training'
  | 'severance'
  | 'other';

export interface LedgerEntry {
  day: number;
  hour: number;
  category: LedgerCategory;
  label: string;
  amount: number;
  businessId: string | null;
}

export interface DayRecord {
  day: number;
  revenue: number;
  costs: number;
  profit: number;
  cash: number;
  netWorth: number;
  customers: number;
}

export interface Loan {
  id: string;
  lender: string;
  principal: number;
  outstanding: number;
  /** Yearly nominal interest, e.g. 0.079. */
  annualRate: number;
  termMonths: number;
  monthlyPayment: number;
  takenOnDay: number;
  missedPayments: number;
}

// -------------------------------------------------------------- marketing

export interface MarketingChannelDef {
  id: string;
  name: string;
  /** Cost per day while the campaign runs. */
  dailyCost: number;
  /** Share of the district that can be reached, 0..1. */
  reach: number;
  /** How efficiently reach turns into awareness, 0..1. */
  conversion: number;
  /** Which audience the channel is good at hitting. */
  targets: ('young' | 'adult' | 'senior')[];
  minimumDays: number;
  description: string;
}

export interface Campaign {
  id: string;
  companyId: string;
  businessId: string;
  channelId: string;
  daysLeft: number;
  dailyCost: number;
}

// ----------------------------------------------------------------- events

export interface CityEventDef {
  id: string;
  name: string;
  description: string;
  /** Districts affected; empty means the whole city. */
  districts: DistrictId[];
  /** Multiplier on customer demand. */
  demand: number;
  /** Multiplier on wholesale prices. */
  supplyCost: number;
  /** Multiplier on rent. */
  rent: number;
  durationDays: [number, number];
  weight: number;
}

export interface ActiveEvent {
  id: string;
  defId: string;
  daysLeft: number;
}

export type AlertPriority = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  priority: AlertPriority;
  title: string;
  detail: string;
  day: number;
  hour: number;
  businessId: string | null;
  read: boolean;
}
