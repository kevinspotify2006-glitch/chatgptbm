import type { Ctx, View } from '../app';
import { playerBusinesses, playerCompany } from '../../sim/state';
import { debtTotal, inventoryValue, netWorth, propertyValue } from '../../sim/finance';
import { currentTier } from '../../sim/achievements';
import { economyLabel } from '../../sim/economy';
import { distinctAlerts } from '../../sim/alerts';
import { cityEvent } from '../../data/events';
import { businessType } from '../../data/businessTypes';
import { marketShare } from '../map';
import { calendar, clockLabel, count, money, moneySigned, moneyShort, pct } from '../../sim/format';
import { sum } from '../../sim/util';
import { bar, empty, h, section, stat, table } from '../dom';
import { lineChart } from '../chart';
import { getLivingNews, getLivingReviews } from '../../sim/living';

export function dashboardView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const company = playerCompany(state);
  const businesses = playerBusinesses(state);
  const open = businesses.filter((b) => b.status === 'open');
  const cal = calendar(state.day);

  const todayRevenue = sum(businesses, (b) => b.today.revenue);
  const todayCosts = sum(
    businesses,
    (b) => b.today.cogs + b.today.wages + b.today.rent + b.today.marketing + b.today.otherCosts,
  );
  const last30 = state.dayHistory.slice(-30);
  const monthRevenue = sum(last30, (d) => d.revenue);
  const monthProfit = sum(last30, (d) => d.profit);
  const worth = netWorth(state);
  const tier = currentTier(state);
  const economy = economyLabel(state);

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: company.name }),
      h('p', { text: `${cal.label} · ${clockLabel(state.hour)} · economy: ${economy.label}` }),
    ),
  );

  if (state.stats.bankrupt) {
    el.appendChild(
      h(
        'section',
        { class: 'panel', style: 'border-color:var(--bad)' },
        h('h3', { class: 'panel-title bad', text: 'Bankrupt' }),
        h('p', {
          text: 'Your debts are larger than everything the company owns. Sell property and stock to raise cash, or start again from Settings.',
        }),
      ),
    );
  }

  // ------------------------------------------------------------- KPI row
  el.appendChild(
    h(
      'div',
      { class: 'grid cols-4', style: 'margin-bottom:14px' },
      kpi('Cash', money(company.cash), `${count(state.employees.length)} on payroll`, company.cash < 0 ? 'bad' : undefined),
      kpi('Profit today', moneySigned(todayRevenue - todayCosts), `${money(todayRevenue)} revenue`, todayRevenue - todayCosts >= 0 ? 'good' : 'bad'),
      kpi('Last 30 days', moneySigned(monthProfit), `${money(monthRevenue)} revenue`, monthProfit >= 0 ? 'good' : 'bad'),
      kpi('Net worth', moneyShort(worth), tier.name),
    ),
  );

  // ---------------------------------------------------------- main grid
  const left = h('div', {});
  const right = h('div', {});

  left.appendChild(
    section(
      'Daily profit',
      lineChart(state.dayHistory.slice(-45).map((d) => d.profit)),
      h('p', {
        class: 'tiny muted',
        text:
          state.dayHistory.length === 0
            ? 'Nothing has been settled yet. Press play and let a day run.'
            : `Last ${Math.min(45, state.dayHistory.length)} days. Best ${money(Math.max(...state.dayHistory.map((d) => d.profit)))}, worst ${money(Math.min(...state.dayHistory.map((d) => d.profit)))}.`,
      }),
    ),
  );

  if (open.length > 0) {
    left.appendChild(
      section(
        'Your businesses',
        table(
          ['Business', 'District', 'Customers', 'Revenue', 'Profit', 'Share'],
          open.map((business) => {
            const type = businessType(business.typeId);
            const building = state.buildings.find((b) => b.id === business.buildingId);
            const profit = business.yesterday.revenue
              ? business.yesterday.revenue -
                (business.yesterday.cogs +
                  business.yesterday.wages +
                  business.yesterday.rent +
                  business.yesterday.marketing +
                  business.yesterday.otherCosts)
              : 0;
            const row = h('span', {
              class: profit >= 0 ? 'good' : 'bad',
              text: state.dayHistory.length ? moneySigned(profit) : '—',
            });
            return [
              h('span', { text: `${type?.icon ?? ''} ${business.name}` }),
              building?.address ?? '—',
              count(business.today.customers),
              money(business.today.revenue),
              row,
              pct(marketShare(state, business.id) * 100),
            ];
          }),
        ),
        h('p', { class: 'tiny muted', text: 'Customers and revenue are today so far; profit is yesterday’s settled figure.' }),
      ),
    );
  } else {
    left.appendChild(
      section(
        'Your businesses',
        empty('You are not trading yet. Open the map, find a unit you can afford, and create your first business.'),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', on: { click: () => ctx.go('map') } }, 'Open the map'),
        ),
      ),
    );
  }

  // ------------------------------------------------------------- sidebar
  const alerts = distinctAlerts(state).slice(0, 7);
  const alertPanel = section('Alerts');
  if (alerts.length === 0) alertPanel.appendChild(empty('Nothing needs your attention.'));
  for (const alert of alerts) {
    alertPanel.appendChild(
      h(
        'div',
        { class: 'alert-row' },
        h('span', { class: `alert-dot ${alert.priority}` }),
        h(
          'div',
          { style: 'flex:1;min-width:0' },
          h('div', { class: 'alert-title', text: alert.title }),
          h('div', { class: 'alert-detail', text: alert.detail }),
        ),
      ),
    );
  }
  right.appendChild(alertPanel);

  right.appendChild(
    section(
      'Balance sheet',
      stat('Cash', money(company.cash), company.cash < 0 ? 'bad' : undefined),
      stat('Stock', money(inventoryValue(state))),
      stat('Property', money(propertyValue(state))),
      stat('Debt', money(-debtTotal(state)), debtTotal(state) > 0 ? 'bad' : 'muted'),
      stat('Net worth', money(worth), worth >= 0 ? 'good' : 'bad'),
      stat('Credit rating', `${Math.round(company.creditRating)}/100`),
    ),
  );

  right.appendChild(
    section(
      'Progression',
      stat('Tier', tier.name),
      tier.next ? stat('Next', tier.next, 'muted') : stat('Next', 'Top tier reached', 'good'),
      bar(tier.progress, 'good'),
      h('p', { class: 'tiny muted', text: `${state.achievements.length} achievements unlocked.` }),
    ),
  );

  const economyPanel = section(
    'City economy',
    stat('Consumer confidence', `${Math.round(state.economy.confidence)}`, economy.tone === 'good' ? 'good' : economy.tone === 'bad' ? 'bad' : undefined),
    stat('Interest rate', pct(state.economy.interestRate * 100, 2)),
    stat('Unemployment', pct(state.economy.unemployment * 100, 1)),
    stat('Price level', `${((state.economy.inflation - 1) * 100).toFixed(1)}% above day 1`),
  );
  if (state.events.length > 0) {
    for (const active of state.events) {
      const def = cityEvent(active.defId);
      if (!def) continue;
      economyPanel.appendChild(
        h(
          'div',
          { style: 'margin-top:8px' },
          h('span', { class: `tag ${def.demand < 1 ? 'bad' : 'good'}`, text: def.name }),
          h('div', { class: 'tiny muted', text: `${def.description} ${active.daysLeft} days left.` }),
        ),
      );
    }
  }
  right.appendChild(economyPanel);

  // --------------------------------------------------------- living world
  const livingPanel = section('Living Northgate');
  const news = getLivingNews(state).slice(0, 5);
  const reviews = getLivingReviews(state).slice(0, 3);
  if (news.length === 0 && reviews.length === 0) {
    livingPanel.appendChild(empty('The city is quiet for now. Keep trading and the world will react.'));
  }
  for (const item of news) {
    livingPanel.appendChild(h('div', { class: 'alert-row' }, h('span', { class: 'alert-dot info' }), h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'alert-title', text: `${item.category} · ${item.headline}` }), h('div', { class: 'alert-detail', text: item.detail }))));
  }
  for (const review of reviews) {
    const stars = '★'.repeat(Math.round(review.score)) + '☆'.repeat(Math.max(0, 5 - Math.round(review.score)));
    const business = businesses.find((b) => b.id === review.businessId);
    livingPanel.appendChild(h('div', { style: 'margin-top:10px;padding-top:10px;border-top:1px solid var(--line)' }, h('div', { class: 'good', text: `${stars} ${review.score.toFixed(1)}` }), h('div', { class: 'tiny', text: `“${review.text}”${business ? ` — ${business.name}` : ''}` })));
  }
  left.appendChild(livingPanel);

  el.appendChild(h('div', { class: 'grid cols-2' }, left, right));
  return { el };
}

function kpi(label: string, value: string, sub: string, tone?: 'good' | 'bad'): HTMLElement {
  return h(
    'div',
    { class: 'kpi' },
    h('div', { class: 'kpi-label', text: label }),
    h('div', { class: `kpi-value${tone ? ` ${tone}` : ''}`, text: value }),
    h('div', { class: 'kpi-sub', text: sub }),
  );
}
