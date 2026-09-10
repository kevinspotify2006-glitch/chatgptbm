import type { Ctx, View } from '../app';
import type { LedgerCategory } from '../../sim/types';
import { playerBusinesses } from '../../sim/state';
import { LEDGER_LABELS, isRevenue } from '../../sim/finance';
import { attractiveness, rivalsOf } from '../../sim/demand';
import { businessTypeOrThrow } from '../../data/businessTypes';
import { product } from '../../data/products';
import { ACHIEVEMENTS, currentTier } from '../../sim/achievements';
import { calendar, count, money, moneySigned, pct } from '../../sim/format';
import { sum } from '../../sim/util';
import { bar, empty, h, section, stat, table } from '../dom';
import { lineChart } from '../chart';

/**
 * Reports answer three questions in order: what happened, why it happened, and
 * what the player could do about it. Nothing here decides anything for them.
 */
export function reportsView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const businesses = playerBusinesses(state);

  el.appendChild(
    h('div', { class: 'view-head' }, h('h1', { text: 'Reports' }), h('p', { text: 'What happened, and why' })),
  );

  if (state.dayHistory.length === 0) {
    el.appendChild(section('Nothing to report', empty('No day has been settled yet. Let the clock run.')));
    return { el };
  }

  const yesterday = state.dayHistory[state.dayHistory.length - 1];
  const previous = state.dayHistory[state.dayHistory.length - 2];
  const cal = calendar(yesterday.day);

  // ------------------------------------------------------ headline change
  const headline = section(`Day ${yesterday.day} — ${cal.label}`);
  headline.appendChild(
    h(
      'div',
      { class: 'grid cols-4' },
      metric('Revenue', money(yesterday.revenue), previous ? delta(yesterday.revenue, previous.revenue) : ''),
      metric('Costs', money(yesterday.costs), previous ? delta(yesterday.costs, previous.costs, true) : ''),
      metric('Profit', moneySigned(yesterday.profit), previous ? delta(yesterday.profit, previous.profit) : '', yesterday.profit >= 0 ? 'good' : 'bad'),
      metric('Customers', count(yesterday.customers), previous ? delta(yesterday.customers, previous.customers) : ''),
    ),
  );

  if (previous) {
    headline.appendChild(explainChange(ctx, yesterday.day, previous.day));
  }
  el.appendChild(headline);

  // ------------------------------------------------------------- trends
  el.appendChild(
    h(
      'div',
      { class: 'grid cols-2' },
      section('Profit trend', lineChart(state.dayHistory.slice(-45).map((d) => d.profit))),
      section('Net worth', lineChart(state.dayHistory.slice(-45).map((d) => d.netWorth), { showZero: false })),
    ),
  );

  // -------------------------------------------------- per-business review
  for (const business of businesses) {
    const type = businessTypeOrThrow(business.typeId);
    const stats = business.yesterday;
    const profit =
      stats.revenue - (stats.cogs + stats.wages + stats.rent + stats.marketing + stats.otherCosts);
    const lostShare = stats.customers + stats.lostCustomers > 0
      ? stats.lostCustomers / (stats.customers + stats.lostCustomers)
      : 0;
    const own = attractiveness(state, business);
    const rivals = rivalsOf(state, business);
    const weakest = [...own.factors].sort((a, b) => a.value - b.value)[0];
    const outOfStock = type.productIds.filter((id) => (business.stock[id] ?? 0) <= 0);

    const advice: string[] = [];
    if (stats.revenue === 0 && business.status !== 'open') {
      advice.push('The business is not open. Nothing will happen until it is.');
    }
    if (lostShare > 0.15) {
      advice.push(
        `${pct(lostShare * 100)} of customers were turned away. More staff on shift, or longer hours, converts them.`,
      );
    }
    if (outOfStock.length > 0) {
      advice.push(
        `Out of stock: ${outOfStock.map((id) => product(id)?.name ?? id).join(', ')}. Raise the reorder point or switch to a faster supplier.`,
      );
    }
    if (weakest && weakest.value < 0.85) {
      advice.push(`Your weakest point against rivals is ${weakest.label.toLowerCase()} (${weakest.hint}).`);
    }
    if (profit < 0 && stats.rent > stats.revenue * 0.3) {
      advice.push('Rent is eating more than 30% of revenue. This location may simply be too expensive for what it takes.');
    }
    if (profit > 0 && lostShare < 0.05 && business.awareness < 40) {
      advice.push('You have spare capacity and low awareness — marketing would fill it.');
    }
    if (advice.length === 0) advice.push('Nothing is obviously wrong. Consider raising prices slightly to test the ceiling.');

    el.appendChild(
      section(
        `${type.icon} ${business.name}`,
        h(
          'div',
          { class: 'grid cols-4' },
          metric('Revenue', money(stats.revenue), ''),
          metric('Profit', moneySigned(profit), '', profit >= 0 ? 'good' : 'bad'),
          metric('Customers', count(stats.customers), ''),
          metric('Turned away', count(stats.lostCustomers), '', lostShare > 0.15 ? 'bad' : undefined),
        ),
        h(
          'div',
          { class: 'grid cols-2', style: 'margin-top:12px' },
          h(
            'div',
            {},
            h('h4', { class: 'panel-title', text: 'Cost structure' }),
            costRow('Cost of goods', stats.cogs, stats.revenue),
            costRow('Wages', stats.wages, stats.revenue),
            costRow('Rent & utilities', stats.rent + stats.otherCosts, stats.revenue),
            costRow('Marketing', stats.marketing, stats.revenue),
          ),
          h(
            'div',
            {},
            h('h4', { class: 'panel-title', text: 'What you could do' }),
            ...advice.map((line) => h('p', { class: 'tiny muted', text: `• ${line}` })),
            h('p', {
              class: 'tiny muted',
              text: `${rivals.length} direct rival${rivals.length === 1 ? '' : 's'} in this district.`,
            }),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------- achievements
  const tier = currentTier(state);
  const achievementPanel = section('Progression');
  achievementPanel.appendChild(stat('Tier', tier.name));
  achievementPanel.appendChild(bar(tier.progress, 'good'));
  achievementPanel.appendChild(
    table(
      ['Achievement', 'Progress', 'Status'],
      ACHIEVEMENTS.map((def) => {
        const unlocked = state.achievements.find((a) => a.id === def.id);
        const progress = def.progress(state);
        return [
          h('div', {}, h('div', { text: def.name }), h('div', { class: 'tiny muted', text: def.description })),
          bar(progress, unlocked ? 'good' : ''),
          unlocked
            ? h('span', { class: 'tag good', text: `Day ${unlocked.unlockedOnDay}` })
            : h('span', { class: 'tag', text: pct(progress * 100) }),
        ];
      }),
    ),
  );
  el.appendChild(achievementPanel);

  return { el };
}

function metric(label: string, value: string, change: string, tone?: 'good' | 'bad'): HTMLElement {
  return h(
    'div',
    { class: 'kpi' },
    h('div', { class: 'kpi-label', text: label }),
    h('div', { class: `kpi-value${tone ? ` ${tone}` : ''}`, text: value }),
    h('div', { class: 'kpi-sub', text: change }),
  );
}

function delta(current: number, previous: number, invert = false): string {
  if (previous === 0) return '';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const arrow = change >= 0 ? '▲' : '▼';
  const good = invert ? change < 0 : change >= 0;
  return `${arrow} ${Math.abs(change).toFixed(0)}% ${good ? 'vs yesterday' : 'vs yesterday'}`;
}

function costRow(label: string, amount: number, revenue: number): HTMLElement {
  const share = revenue > 0 ? amount / revenue : 0;
  return h(
    'div',
    { style: 'margin:6px 0' },
    h(
      'div',
      { style: 'display:flex;justify-content:space-between;font-size:12px' },
      h('span', { class: 'muted', text: label }),
      h('span', { text: `${money(amount)} (${pct(share * 100)})` }),
    ),
    bar(share, share > 0.45 ? 'bad' : share > 0.3 ? 'warn' : ''),
  );
}

/** Compares two days category by category and reports the biggest movers. */
function explainChange(ctx: Ctx, day: number, previousDay: number): HTMLElement {
  const state = ctx.state;
  const totals = new Map<LedgerCategory, { now: number; before: number }>();
  for (const entry of state.ledger) {
    if (entry.day !== day && entry.day !== previousDay) continue;
    const bucket = totals.get(entry.category) ?? { now: 0, before: 0 };
    if (entry.day === day) bucket.now += entry.amount;
    else bucket.before += entry.amount;
    totals.set(entry.category, bucket);
  }

  const movers = [...totals.entries()]
    .map(([category, bucket]) => ({ category, change: bucket.now - bucket.before }))
    .filter((row) => Math.abs(row.change) > 1)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);

  if (movers.length === 0) {
    return h('p', { class: 'tiny muted', text: 'Nothing changed materially compared with the day before.' });
  }

  return h(
    'div',
    { style: 'margin-top:12px' },
    h('h4', { class: 'panel-title', text: 'Why the result moved' }),
    table(
      ['Category', 'Change vs previous day'],
      movers.map((row) => [
        LEDGER_LABELS[row.category],
        h('span', {
          class: (isRevenue(row.category) ? row.change > 0 : row.change > 0) ? 'good' : 'bad',
          text: moneySigned(row.change),
        }),
      ]),
    ),
    h('p', {
      class: 'tiny muted',
      text: `Total swing: ${moneySigned(sum(movers, (m) => m.change))}.`,
    }),
  );
}
