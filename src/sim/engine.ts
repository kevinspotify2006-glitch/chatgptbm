import type { GameState } from './state';
import { DAY_HISTORY_LIMIT, SPEEDS, playerBusinesses, playerCompany } from './state';
import { emit } from './bus';
import { allocateDemand } from './demand';
import { businessDaily, tradeHour } from './business';
import { competitorDaily, competitorWeekly, tradeHourAI } from './competitors';
import { employeesDaily, payWages } from './employees';
import { processOrders, runAutoRestock } from './procurement';
import { campaignsDaily } from './marketing';
import { economyDaily, revalueProperty } from './economy';
import { chargeTax, dayTotals, netWorth, settleLoansMonthly, updateCreditRating } from './finance';
import { checkAchievements } from './achievements';
import { pushAlert } from './alerts';
import { DAYS_PER_MONTH } from './format';
import { clamp, sum } from './util';
import { settleLivingWorld } from './living';
import { settleAdvancedWorld } from './advanced';
import { settleDeepSimulation } from './deepSimulation';
import { settleWorld2 } from './world2';

export class Engine {
  state: GameState;
  private accumulator = 0;
  private lastFrame = 0;
  private frame: number | null = null;
  private running = false;
  constructor(state: GameState) { this.state = state; }
  replaceState(state: GameState): void { this.state = state; this.accumulator = 0; emit('reset', undefined); }
  start(): void { if (this.running) return; this.running = true; this.lastFrame = performance.now(); const loop = (now: number): void => { if (!this.running) return; const delta = clamp((now - this.lastFrame) / 1000, 0, 0.5); this.lastFrame = now; this.advance(delta); this.frame = requestAnimationFrame(loop); }; this.frame = requestAnimationFrame(loop); }
  stop(): void { this.running = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; }
  setSpeed(index: number): void { this.state.speed = clamp(Math.round(index), 0, SPEEDS.length - 1); }
  togglePause(): void { this.state.speed = this.state.speed === 0 ? 2 : 0; }
  advance(seconds: number): void { const hoursPerSecond = SPEEDS[this.state.speed] ?? 0; if (hoursPerSecond <= 0) return; this.accumulator += seconds * hoursPerSecond; let steps = 0; while (this.accumulator >= 1 && steps < 48) { this.accumulator -= 1; steps += 1; this.stepHour(); } if (steps > 0) emit('tick', { day: this.state.day, hour: this.state.hour }); }
  stepHour(): void {
    const state = this.state; const allocations = allocateDemand(state);
    for (const business of state.businesses) { const allocation = allocations.get(business.id); if (business.companyId === state.playerCompanyId) tradeHour(state, business, allocation); else tradeHourAI(state, business, allocation); }
    processOrders(state); state.hour += 1; if (state.hour < 24) return;
    this.settleDay(); state.hour = 0; state.day += 1;
  }
  private settleDay(): void {
    const state = this.state; const company = playerCompany(state); payWages(state); let customers = 0;
    for (const business of playerBusinesses(state)) { customers += business.today.customers; businessDaily(state, business); }
    campaignsDaily(state); competitorDaily(state); employeesDaily(state); runAutoRestock(state); economyDaily(state); revalueProperty(state);
    for (const building of state.buildings) if (building.renovationEndsOnDay !== null && state.day >= building.renovationEndsOnDay) { building.renovationEndsOnDay = null; building.condition = 100; pushAlert(state, 'info', 'Renovation complete', `${building.address} is back to full condition.`, null); }
    const { revenue, costs } = dayTotals(state, state.day); const worth = netWorth(state);
    state.dayHistory.push({ day: state.day, revenue, costs, profit: revenue - costs, cash: company.cash, netWorth: worth, customers }); if (state.dayHistory.length > DAY_HISTORY_LIMIT) state.dayHistory.shift(); state.stats.peakNetWorth = Math.max(state.stats.peakNetWorth, worth);
    updateCreditRating(state); checkAchievements(state); settleLivingWorld(state); settleAdvancedWorld(state); settleDeepSimulation(state); settleWorld2(state);
    if (state.day % 7 === 0) this.settleWeek(); if (state.day % DAYS_PER_MONTH === 0) this.settleMonth(); this.checkSolvency(); emit('day', { day: state.day });
  }
  private settleWeek(): void { competitorWeekly(this.state); }
  private settleMonth(): void { const state = this.state; const { missed } = settleLoansMonthly(state); if (missed > 0) pushAlert(state, 'critical', 'Missed loan payment', `${missed} loan payment${missed > 1 ? 's' : ''} could not be met. Interest has been added and your credit rating has fallen.`, null); const tax = chargeTax(state); if (tax > 0) pushAlert(state, 'info', 'Corporation tax paid', `€${Math.round(tax).toLocaleString('en-GB')} on last month's profit.`, null); }
  private checkSolvency(): void {
    const state = this.state; const company = playerCompany(state); if (company.cash >= 0) return; const debt = -company.cash; const assets = netWorth(state) + debt;
    if (assets > 0 && debt < assets * 0.35) { pushAlert(state, 'critical', 'Your account is overdrawn', `You are €${Math.round(debt).toLocaleString('en-GB')} in the red. Sell stock or property, cut costs, or take a loan.`, null); return; }
    if (!state.stats.bankrupt) { state.stats.bankrupt = true; state.speed = 0; const losing = playerBusinesses(state).filter((b) => sum(b.profitHistory.slice(-7), (p) => p) < 0).map((b) => b.name); pushAlert(state, 'critical', 'Bankrupt', losing.length > 0 ? `Debts exceeded what the company is worth. The heaviest losses came from ${losing.join(', ')}.` : 'Debts exceeded what the company is worth.', null); }
  }
}
