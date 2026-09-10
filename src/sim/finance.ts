import type { GameState } from './state';
import { LEDGER_LIMIT, companyById, playerBusinesses, playerCompany } from './state';
import type { LedgerCategory, Loan } from './types';
import { product } from '../data/products';
import { clamp, makeId, sum } from './util';
import { gameRng } from './rng';

export const LEDGER_LABELS: Record<LedgerCategory, string> = {
  sales: 'Product sales',
  service: 'Service revenue',
  stock: 'Stock purchased',
  cogs: 'Cost of goods sold',
  wages: 'Wages',
  rent: 'Rent',
  utilities: 'Utilities',
  marketing: 'Marketing',
  logistics: 'Logistics',
  setup: 'Fit-out',
  equipment: 'Equipment',
  property: 'Property',
  renovation: 'Renovation',
  loan: 'Loan',
  interest: 'Interest',
  tax: 'Tax',
  training: 'Training',
  severance: 'Severance',
  other: 'Other',
};

const REVENUE_CATEGORIES: LedgerCategory[] = ['sales', 'service'];

/**
 * Operating costs belong in the profit and loss account. Capital items —
 * buying a building, fitting out a shop, drawing or repaying a loan — move
 * cash but are not costs of trading, and counting them as such would make
 * every expansion look like a disaster.
 */
const OPERATING_COSTS: LedgerCategory[] = [
  'cogs', 'wages', 'rent', 'utilities', 'marketing', 'logistics', 'tax', 'training', 'severance', 'interest',
];

export function isRevenue(category: LedgerCategory): boolean {
  return REVENUE_CATEGORIES.includes(category);
}

export function isOperatingCost(category: LedgerCategory): boolean {
  return OPERATING_COSTS.includes(category);
}

/** Trading revenue and operating costs booked on a given day. */
export function dayTotals(state: GameState, day: number): { revenue: number; costs: number } {
  let revenue = 0;
  let costs = 0;
  for (const entry of state.ledger) {
    if (entry.day !== day) continue;
    if (isRevenue(entry.category)) revenue += entry.amount;
    else if (isOperatingCost(entry.category)) costs += -entry.amount;
  }
  return { revenue, costs: Math.max(0, costs) };
}

/**
 * The only way money moves. Every euro in the game passes through here, which
 * is what makes the finance screen and the "why did profit change" breakdown
 * trustworthy.
 */
export function post(
  state: GameState,
  companyId: string,
  category: LedgerCategory,
  label: string,
  amount: number,
  businessId: string | null = null,
): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  const company = companyById(state, companyId);
  if (!company) return;
  company.cash += amount;

  if (!company.isPlayer) return; // the ledger only tracks the player's books

  if (amount > 0) state.stats.revenueTotal += amount;
  else state.stats.costsTotal += -amount;

  const last = state.ledger[state.ledger.length - 1];
  // Collapse identical movements within the same hour so a busy shop does not
  // write one row per customer.
  if (
    last &&
    last.day === state.day &&
    last.hour === state.hour &&
    last.category === category &&
    last.label === label &&
    last.businessId === businessId
  ) {
    last.amount += amount;
    return;
  }

  state.ledger.push({
    day: state.day,
    hour: state.hour,
    category,
    label,
    amount,
    businessId,
  });
  if (state.ledger.length > LEDGER_LIMIT) {
    state.ledger.splice(0, state.ledger.length - LEDGER_LIMIT);
  }
}

/**
 * Records a cost that does not move cash. Cost of goods sold is the important
 * one: the cash left when the stock was bought, so charging it again at the
 * till would count it twice — but leaving it out of the profit figure would
 * make every shop look far more profitable than it is.
 */
export function postNonCash(
  state: GameState,
  companyId: string,
  category: LedgerCategory,
  label: string,
  amount: number,
  businessId: string | null = null,
): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  const company = companyById(state, companyId);
  if (!company || !company.isPlayer) return;

  const last = state.ledger[state.ledger.length - 1];
  if (
    last &&
    last.day === state.day &&
    last.hour === state.hour &&
    last.category === category &&
    last.label === label &&
    last.businessId === businessId
  ) {
    last.amount += amount;
    return;
  }
  state.ledger.push({ day: state.day, hour: state.hour, category, label, amount, businessId });
  if (state.ledger.length > LEDGER_LIMIT) {
    state.ledger.splice(0, state.ledger.length - LEDGER_LIMIT);
  }
}

export function canAfford(state: GameState, amount: number): boolean {
  return playerCompany(state).cash >= amount;
}

// ------------------------------------------------------------- net worth

export function inventoryValue(state: GameState): number {
  let total = 0;
  for (const business of playerBusinesses(state)) {
    for (const [productId, units] of Object.entries(business.stock)) {
      const def = product(productId);
      if (def) total += def.wholesalePrice * units;
    }
  }
  return total;
}

export function propertyValue(state: GameState): number {
  const player = playerCompany(state);
  return sum(
    state.buildings.filter((b) => b.status === 'owned' && b.occupantCompanyId === player.id),
    (b) => b.value,
  );
}

export function debtTotal(state: GameState): number {
  return sum(state.loans, (loan) => loan.outstanding);
}

/** Businesses are worth a multiple of their recent profit, plus their fit-out. */
export function goodwillValue(state: GameState): number {
  let total = 0;
  for (const business of playerBusinesses(state)) {
    if (business.status !== 'open') continue;
    const recent = business.profitHistory.slice(-30);
    if (recent.length === 0) continue;
    const average = sum(recent, (value) => value) / recent.length;
    total += Math.max(0, average * 120);
  }
  return total;
}

export function netWorth(state: GameState): number {
  return (
    playerCompany(state).cash +
    inventoryValue(state) +
    propertyValue(state) +
    goodwillValue(state) -
    debtTotal(state)
  );
}

// ------------------------------------------------------------------ loans

export interface LoanOffer {
  id: string;
  lender: string;
  maxPrincipal: number;
  annualRate: number;
  termMonths: number;
  minimumCreditRating: number;
}

export function loanOffers(state: GameState): LoanOffer[] {
  const base = state.economy.interestRate;
  return [
    {
      id: 'starter',
      lender: 'Northgate Credit Union',
      maxPrincipal: 30000,
      annualRate: base + 0.045,
      termMonths: 24,
      minimumCreditRating: 30,
    },
    {
      id: 'business',
      lender: 'Meridian Business Bank',
      maxPrincipal: 150000,
      annualRate: base + 0.031,
      termMonths: 48,
      minimumCreditRating: 55,
    },
    {
      id: 'expansion',
      lender: 'Halcyon Capital',
      maxPrincipal: 750000,
      annualRate: base + 0.022,
      termMonths: 84,
      minimumCreditRating: 72,
    },
  ];
}

/** Standard annuity payment. */
export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const monthly = annualRate / 12;
  if (monthly <= 0) return principal / months;
  const factor = Math.pow(1 + monthly, months);
  return (principal * monthly * factor) / (factor - 1);
}

/** How much the bank is willing to lend on top of existing debt. */
export function borrowingHeadroom(state: GameState): number {
  const company = playerCompany(state);
  const secured = propertyValue(state) * 0.7 + goodwillValue(state) * 0.4;
  const rating = clamp(company.creditRating / 100, 0.1, 1);
  return Math.max(0, (secured + 25000 * rating) * (0.6 + rating) - debtTotal(state));
}

export function takeLoan(
  state: GameState,
  offerId: string,
  principal: number,
): { ok: boolean; message: string } {
  const offer = loanOffers(state).find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'Unknown loan offer.' };
  const company = playerCompany(state);
  if (company.creditRating < offer.minimumCreditRating) {
    return {
      ok: false,
      message: `${offer.lender} requires a credit rating of ${offer.minimumCreditRating}; yours is ${Math.round(company.creditRating)}.`,
    };
  }
  const amount = Math.round(clamp(principal, 1000, offer.maxPrincipal));
  if (amount > borrowingHeadroom(state)) {
    return { ok: false, message: 'The bank will not lend this much against your current assets.' };
  }

  const loan: Loan = {
    id: makeId('loan'),
    lender: offer.lender,
    principal: amount,
    outstanding: amount,
    annualRate: offer.annualRate,
    termMonths: offer.termMonths,
    monthlyPayment: Math.round(monthlyPayment(amount, offer.annualRate, offer.termMonths)),
    takenOnDay: state.day,
    missedPayments: 0,
  };
  state.loans.push(loan);
  post(state, company.id, 'loan', `${offer.lender} loan`, amount);
  return { ok: true, message: `${offer.lender} approved €${amount.toLocaleString('en-GB')}.` };
}

export function repayLoan(state: GameState, loanId: string, amount: number): { ok: boolean; message: string } {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, message: 'Loan not found.' };
  const company = playerCompany(state);
  const payment = Math.min(amount, loan.outstanding, company.cash);
  if (payment <= 0) return { ok: false, message: 'Not enough cash to repay.' };
  loan.outstanding -= payment;
  post(state, company.id, 'loan', `Repayment — ${loan.lender}`, -payment);
  if (loan.outstanding < 1) {
    state.loans = state.loans.filter((l) => l.id !== loan.id);
    company.creditRating = clamp(company.creditRating + 4, 0, 100);
    return { ok: true, message: `${loan.lender} loan cleared. Credit rating improved.` };
  }
  return { ok: true, message: `Repaid €${Math.round(payment).toLocaleString('en-GB')}.` };
}

/** Charged on the first day of every month. */
export function settleLoansMonthly(state: GameState): { paid: number; missed: number } {
  const company = playerCompany(state);
  let paid = 0;
  let missed = 0;
  for (const loan of [...state.loans]) {
    const interest = loan.outstanding * (loan.annualRate / 12);
    const payment = Math.min(loan.monthlyPayment, loan.outstanding + interest);
    if (company.cash >= payment) {
      post(state, company.id, 'interest', `Interest — ${loan.lender}`, -interest);
      post(state, company.id, 'loan', `Repayment — ${loan.lender}`, -(payment - interest));
      loan.outstanding = Math.max(0, loan.outstanding - (payment - interest));
      paid += payment;
      company.creditRating = clamp(company.creditRating + 0.4, 0, 100);
    } else {
      loan.missedPayments += 1;
      loan.outstanding += interest + payment * 0.05; // interest rolls up plus a penalty
      missed += 1;
      company.creditRating = clamp(company.creditRating - 9, 0, 100);
    }
    if (loan.outstanding < 1) state.loans = state.loans.filter((l) => l.id !== loan.id);
  }
  return { paid, missed };
}

// -------------------------------------------------------------------- tax

/** Corporation tax on the month's profit; losses carry no refund. */
export const TAX_RATE = 0.19;

export function monthlyProfit(state: GameState, days: number): { revenue: number; costs: number; profit: number } {
  const from = state.day - days;
  let revenue = 0;
  let costs = 0;
  for (const record of state.dayHistory) {
    if (record.day <= from) continue;
    revenue += record.revenue;
    costs += record.costs;
  }
  return { revenue, costs, profit: revenue - costs };
}

export function chargeTax(state: GameState): number {
  const { profit } = monthlyProfit(state, 30);
  if (profit <= 0) return 0;
  const tax = profit * TAX_RATE;
  post(state, state.playerCompanyId, 'tax', 'Corporation tax', -tax);
  return tax;
}

/** Small random drift so the credit rating reflects how the business is doing. */
export function updateCreditRating(state: GameState): void {
  const company = playerCompany(state);
  const recent = state.dayHistory.slice(-14);
  const profit = sum(recent, (r) => r.profit);
  const target = profit > 0 ? 78 : company.cash > 0 ? 52 : 22;
  const drift = (target - company.creditRating) * 0.05 + gameRng.range(-0.4, 0.4);
  company.creditRating = clamp(company.creditRating + drift, 0, 100);
}
