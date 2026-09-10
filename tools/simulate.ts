/**
 * Headless balance harness.
 *
 * Runs the simulation without a browser so the economy can be checked on its
 * own: is a first business viable, do competitors react, does the player go
 * broke doing something sensible? Run it with:
 *
 *   npx tsx tools/simulate.ts [days] [businessTypeId]
 *
 * It plays a deliberately average opening: rent the cheapest unit that fits,
 * stock it, hire the team, open, and change nothing after that. If that loses
 * money forever, the balance is wrong; if it prints money, so is the balance.
 */
import { createNewGame } from '../src/sim/setup';
import { Engine } from '../src/sim/engine';
import { foundBusiness, openBusiness, rentBuilding } from '../src/sim/business';
import { placeOrder, rankedSuppliers, suggestOrder } from '../src/sim/procurement';
import { applicantsFor, hire } from '../src/sim/employees';
import { businessTypeOrThrow } from '../src/data/businessTypes';
import { playerBusinesses, playerCompany } from '../src/sim/state';
import { netWorth } from '../src/sim/finance';
import { district } from '../src/data/districts';
import { money } from '../src/sim/format';
import { sum } from '../src/sim/util';

const days = Number(process.argv[2] ?? 60);
const typeId = process.argv[3] ?? 'convenience';
// "cheap" rents the cheapest unit that fits; "best" rents the busiest one the
// player can afford. Real players do the second; the first is the trap.
const strategy = process.argv[4] ?? 'cheap';
const staffTarget = Number(process.argv[5] ?? 0) || 0;
const marketingBudget = Number(process.argv[6] ?? 0) || 0;

const state = createNewGame('Harness Ltd');
const engine = new Engine(state);
const type = businessTypeOrThrow(typeId);

// Pick the cheapest available unit that fits this business type.
const affordable = state.buildings.filter(
  (b) =>
    b.status === 'available' &&
    b.size >= type.minSize &&
    b.suitableFor.includes(type.category) &&
    b.rent * 3 + type.setupCost + type.equipmentCost < playerCompany(state).cash * 0.6,
);
const candidates =
  strategy === 'best'
    ? affordable.slice().sort((a, b) => b.footTraffic - a.footTraffic)
    : affordable.slice().sort((a, b) => a.rent - b.rent);

const target = candidates[0];
if (!target) {
  console.error(`No affordable unit for ${type.name}.`);
  process.exit(1);
}

console.log(`Opening a ${type.name} at ${target.address}, ${district(target.district).name}`);
console.log(`Rent ${money(target.rent)}/mo · ${target.size} m² · ${target.footTraffic} passers-by/day\n`);

const rentResult = rentBuilding(state, target.id);
if (!rentResult.ok) throw new Error(rentResult.message);
const founded = foundBusiness(state, typeId, target.id, 'Test Shop');
if (!founded.ok || !founded.businessId) throw new Error(founded.message);
const business = playerBusinesses(state)[0];

// Stock it from the cheapest supplier that carries the range.
if (type.productIds.length > 0) {
  for (const supplierId of rankedSuppliers(business)) {
    const lines = suggestOrder(state, business, supplierId);
    if (lines.length === 0) continue;
    const order = placeOrder(state, supplierId, business.id, lines);
    console.log('Order:', order.message);
    if (order.ok) break;
  }
  business.autoRestock = true;
}

// Hire one person per role the type uses.
console.log('Applicant roles available:', state.applicants.map((a) => a.role).join(', '));
const roles = staffTarget > 0 ? type.roles.slice(0, staffTarget) : type.roles;
for (const roleId of roles) {
  const applicant = applicantsFor(state, business).find((a) => a.role === roleId);
  if (!applicant) continue;
  const result = hire(state, applicant.id, business.id);
  if (!result.ok) console.log('Hire failed:', result.message);
}
console.log(`Hired ${state.employees.length} people. Cash now ${money(playerCompany(state).cash)}\n`);

// Wait for the first delivery, then open.
for (let hour = 0; hour < 72; hour += 1) {
  engine.stepHour();
  if (sum(Object.values(business.stock), (units) => units) > 0) break;
}
business.marketingBudget = marketingBudget;
const opened = openBusiness(state, business.id);
console.log('Open:', opened.message, '\n');

console.log('day   revenue     costs      profit      cash     customers  rivals');
let bankruptOn = 0;
for (let day = 0; day < days; day += 1) {
  for (let hour = 0; hour < 24; hour += 1) engine.stepHour();
  const record = state.dayHistory[state.dayHistory.length - 1];
  if (!record) continue;
  const rivals = state.businesses.filter((b) => b.companyId !== state.playerCompanyId).length;
  if (day % 5 === 0 || day === days - 1) {
    console.log(
      `${String(record.day).padStart(3)}  ${money(record.revenue).padStart(9)}  ${money(record.costs).padStart(9)}  ` +
        `${money(record.profit).padStart(9)}  ${money(record.cash).padStart(9)}  ${String(Math.round(record.customers)).padStart(8)}  ${String(rivals).padStart(6)}`,
    );
  }
  if (state.stats.bankrupt && bankruptOn === 0) bankruptOn = record.day;
}

const settled = state.dayHistory;
const totalProfit = sum(settled, (d) => d.profit);
const profitable = settled.filter((d) => d.profit > 0).length;

// Ledger breakdown for the last full day, so a loss can be explained.
const lastDay = state.dayHistory[state.dayHistory.length - 1]?.day ?? state.day;
const byCategory = new Map<string, number>();
for (const entry of state.ledger) {
  if (entry.day !== lastDay) continue;
  byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
}
console.log(`\n--- ledger for day ${lastDay} ---`);
for (const [category, amount] of [...byCategory.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
  console.log(`${category.padEnd(12)} ${money(amount).padStart(10)}`);
}
const staffNow = state.employees.length;
console.log(`open hours ${business.openFrom}-${business.openTo}, staff ${staffNow}, stock units ${Math.round(sum(Object.values(business.stock), (v) => v))}`);

console.log('\n--- notable alerts ---');
for (const alert of state.alerts.slice(0, 12)) {
  console.log(`day ${String(alert.day).padStart(3)} [${alert.priority}] ${alert.title} — ${alert.detail}`);
}

console.log('\n--- summary ---');
console.log(`Days simulated:     ${settled.length}`);
console.log(`Profitable days:    ${profitable} (${Math.round((profitable / Math.max(1, settled.length)) * 100)}%)`);
const recent = settled.slice(-14);
const recentAvg = recent.length > 0 ? sum(recent, (d) => d.profit) / recent.length : 0;
console.log(`Cumulative profit:  ${money(totalProfit)}`);
console.log(`Avg profit/day:     ${money(totalProfit / Math.max(1, settled.length))}`);
console.log(`Last 14 days/day:   ${money(recentAvg)}`);
console.log(`Cash:               ${money(playerCompany(state).cash)}`);
console.log(`Net worth:          ${money(netWorth(state))}`);
console.log(`Reputation:         ${Math.round(business.reputation)}/100  ·  ${business.reviewScore.toFixed(1)}★`);
console.log(`Awareness:          ${Math.round(business.awareness)}%`);
console.log(`Staff:              ${state.employees.length}`);
console.log(`Competitor outlets: ${state.businesses.filter((b) => b.companyId !== state.playerCompanyId).length}`);
if (bankruptOn > 0) console.log(`BANKRUPT on day ${bankruptOn}`);
