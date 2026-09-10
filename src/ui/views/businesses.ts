import type { Ctx, View } from '../app';
import type { Business } from '../../sim/types';
import { businessById, employeesOf, playerBusinesses } from '../../sim/state';
import { businessTypeOrThrow } from '../../data/businessTypes';
import { product } from '../../data/products';
import { district } from '../../data/districts';
import { role } from '../../data/roles';
import {
  closeBusiness,
  grossMargin,
  hourlyCapacity,
  openBusiness,
  setHours,
  setMarketingBudget,
  setPrice,
  shutDownBusiness,
  storageUsed,
} from '../../sim/business';
import { attractiveness, estimateDailyCustomers, priceIndex, rivalsOf } from '../../sim/demand';
import { staffPower } from '../../sim/employees';
import { marketShare } from '../map';
import { count, money, moneyCents, moneySigned, pct } from '../../sim/format';
import { clamp, sum } from '../../sim/util';
import { bar, button, confirmDialog, empty, h, numberInput, section, stat, table, toast } from '../dom';

export function businessesView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const businesses = playerBusinesses(state);

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: 'Businesses' }),
      h('p', { text: `${businesses.length} location${businesses.length === 1 ? '' : 's'}` }),
    ),
  );

  if (businesses.length === 0) {
    el.appendChild(
      section(
        'No businesses yet',
        empty('Find premises on the map first, then create a business in the unit you have taken on.'),
        h('div', { class: 'btn-row' }, button('Open the map', () => ctx.go('map'), 'btn primary')),
      ),
    );
    return { el };
  }

  const selectedId = ctx.params.business ?? businesses[0].id;
  const selected = businessById(state, selectedId) ?? businesses[0];

  const list = h('div', { class: 'list', style: 'margin-bottom:14px' });
  for (const business of businesses) {
    const type = businessTypeOrThrow(business.typeId);
    const building = state.buildings.find((b) => b.id === business.buildingId);
    const yesterday = business.yesterday;
    const profit =
      yesterday.revenue -
      (yesterday.cogs + yesterday.wages + yesterday.rent + yesterday.marketing + yesterday.otherCosts);
    list.appendChild(
      h(
        'div',
        {
          class: `card clickable${business.id === selected.id ? '' : ''}`,
          style: business.id === selected.id ? 'border-color:var(--accent-2)' : '',
          on: { click: () => ctx.go('businesses', { business: business.id }) },
        },
        h(
          'div',
          { class: 'card-head' },
          h(
            'div',
            {},
            h('div', { class: 'card-title', text: `${type.icon} ${business.name}` }),
            h('div', {
              class: 'card-sub',
              text: `${building?.address ?? ''} · ${building ? district(building.district).name : ''}`,
            }),
          ),
          h('span', {
            class: `tag ${business.status === 'open' ? 'good' : business.status === 'setup' ? 'warn' : ''}`,
            text: business.status === 'setup' ? 'Not open' : business.status,
          }),
        ),
        h(
          'div',
          { style: 'display:flex;gap:16px;flex-wrap:wrap;font-size:12px' },
          h('span', { class: 'muted', text: `Today: ${money(business.today.revenue)}` }),
          h('span', { class: 'muted', text: `Customers: ${count(business.today.customers)}` }),
          h('span', {
            class: profit >= 0 ? 'good' : 'bad',
            text: `Yesterday: ${moneySigned(profit)}`,
          }),
        ),
      ),
    );
  }
  el.appendChild(list);
  el.appendChild(detailPanel(ctx, selected));

  return { el };
}

function detailPanel(ctx: Ctx, business: Business): HTMLElement {
  const state = ctx.state;
  const type = businessTypeOrThrow(business.typeId);
  const building = state.buildings.find((b) => b.id === business.buildingId);
  const staff = employeesOf(state, business.id);
  const power = staffPower(state, business);
  const host = h('div', {});

  // ------------------------------------------------------------ header
  const actions = h('div', { class: 'btn-row' });
  if (business.status === 'open') {
    actions.appendChild(
      button('Close temporarily', () => {
        const result = closeBusiness(state, business.id);
        toast(result.message, 'info');
        ctx.refresh();
      }),
    );
  } else {
    actions.appendChild(
      button(
        'Open for business',
        () => {
          const result = openBusiness(state, business.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) {
            if (state.speed === 0) ctx.engine.setSpeed(2);
            ctx.refresh();
          }
        },
        'btn primary',
      ),
    );
  }
  actions.appendChild(button('Order stock', () => ctx.go('inventory', { business: business.id })));
  actions.appendChild(button('Hire staff', () => ctx.go('employees', { business: business.id })));
  if (building) actions.appendChild(button('Show on map', () => ctx.go('map', { building: building.id })));
  actions.appendChild(
    button(
      'Shut down',
      async () => {
        const ok = await confirmDialog(
          'Shut this business down?',
          `Staff are paid off, remaining stock is cleared at half its cost, and ${business.name} is gone for good. The premises stay yours.`,
          'Shut it down',
        );
        if (!ok) return;
        const result = shutDownBusiness(state, business.id);
        toast(result.message, 'info');
        ctx.go('businesses');
      },
      'btn danger',
    ),
  );

  host.appendChild(
    section(
      'Overview',
      h(
        'div',
        { class: 'grid cols-3' },
        h(
          'div',
          {},
          stat('Type', type.name),
          stat('Location', building?.address ?? '—'),
          stat('District', building ? district(building.district).name : '—'),
          stat('Opened', business.openedOnDay > 0 ? `Day ${business.openedOnDay}` : 'Not yet'),
        ),
        h(
          'div',
          {},
          stat('Reputation', `${Math.round(business.reputation)}/100`),
          stat('Reviews', `${business.reviewScore.toFixed(1)}★ (${count(business.reviewCount)})`),
          stat('Service quality', `${Math.round(business.serviceQuality)}/100`, business.serviceQuality < 45 ? 'bad' : undefined),
          stat('Awareness', pct(business.awareness)),
        ),
        h(
          'div',
          {},
          stat('Staff', `${staff.length}`),
          stat('Can serve', `${Math.round(hourlyCapacity(state, business))}/hour`),
          stat('Market share', pct(marketShare(state, business.id) * 100, 1)),
          stat('Gross margin', pct(grossMargin(business) * 100)),
        ),
      ),
      actions,
    ),
  );

  // ------------------------------------------------------- today / yesterday
  const today = business.today;
  const yesterday = business.yesterday;
  const yesterdayProfit =
    yesterday.revenue - (yesterday.cogs + yesterday.wages + yesterday.rent + yesterday.marketing + yesterday.otherCosts);

  host.appendChild(
    h(
      'div',
      { class: 'grid cols-2' },
      section(
        'Today so far',
        stat('Customers served', count(today.customers)),
        stat('Turned away', count(today.lostCustomers), today.lostCustomers > today.customers * 0.15 ? 'bad' : 'muted'),
        stat('Revenue', money(today.revenue)),
        stat('Units sold', count(today.units)),
      ),
      section(
        'Yesterday',
        stat('Revenue', money(yesterday.revenue)),
        stat('Cost of goods', money(-yesterday.cogs)),
        stat('Wages', money(-yesterday.wages)),
        stat('Rent & utilities', money(-(yesterday.rent + yesterday.otherCosts))),
        stat('Marketing', money(-yesterday.marketing)),
        stat('Profit', moneySigned(yesterdayProfit), yesterdayProfit >= 0 ? 'good' : 'bad'),
      ),
    ),
  );

  // -------------------------------------------------------------- pricing
  if (type.productIds.length > 0) {
    const rows = type.productIds.map((productId) => {
      const def = product(productId);
      if (!def) return [];
      const price = business.prices[productId] ?? def.marketPrice;
      const cost = business.costBasis[productId] ?? def.wholesalePrice;
      const margin = price > 0 ? (price - cost) / price : 0;
      const input = numberInput(
        Number(price.toFixed(2)),
        (value) => {
          setPrice(state, business.id, productId, value);
          ctx.refresh();
        },
        { step: '0.05', min: '0.05' },
      );
      return [
        def.name,
        moneyCents(cost),
        input,
        h('span', { class: margin < 0.1 ? 'bad' : margin > 0.4 ? 'good' : '', text: pct(margin * 100) }),
        count(business.stock[productId] ?? 0),
        count(business.incoming[productId] ?? 0),
      ];
    });

    host.appendChild(
      section(
        'Products and pricing',
        table(['Product', 'Cost', 'Your price', 'Margin', 'In stock', 'On order'], rows),
        priceAnalysis(ctx, business),
      ),
    );
  } else {
    const fee = business.prices.service ?? type.serviceFee;
    host.appendChild(
      section(
        'Service pricing',
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'Fee per job' }),
          numberInput(Number(fee.toFixed(2)), (value) => {
            setPrice(state, business.id, 'service', value);
            ctx.refresh();
          }, { step: '1', min: '1' }),
        ),
        priceAnalysis(ctx, business),
      ),
    );
  }

  // ------------------------------------------------- competitive position
  host.appendChild(competitivePanel(ctx, business));

  // ----------------------------------------------------- staff & settings
  const staffRows = staff.map((employee) => [
    employee.name,
    role(employee.role).name,
    `${Math.round(employee.skill)}`,
    `${Math.round(employee.morale)}`,
    money(employee.salary),
  ]);

  host.appendChild(
    h(
      'div',
      { class: 'grid cols-2' },
      section(
        'Team',
        staff.length === 0
          ? empty('Nobody works here yet. Without staff you can serve about four customers an hour yourself.')
          : table(['Name', 'Role', 'Skill', 'Morale', 'Salary'], staffRows),
        h('p', {
          class: 'tiny muted',
          text: `Present today: ${power.present} of ${power.headcount}. Capacity ${Math.round(hourlyCapacity(state, business))} customers/hour.`,
        }),
        h('div', { class: 'btn-row' }, button('Manage staff', () => ctx.go('employees', { business: business.id }))),
      ),
      section(
        'Operations',
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'Opening hour' }),
          numberInput(business.openFrom, (value) => {
            setHours(state, business.id, value, business.openTo);
            ctx.refresh();
          }, { min: '0', max: '23', step: '1' }),
        ),
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'Closing hour' }),
          numberInput(business.openTo, (value) => {
            setHours(state, business.id, business.openFrom, value);
            ctx.refresh();
          }, { min: '1', max: '24', step: '1' }),
        ),
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'Marketing budget per day' }),
          numberInput(business.marketingBudget, (value) => {
            setMarketingBudget(state, business.id, value);
            ctx.refresh();
          }, { min: '0', step: '10' }),
        ),
        building
          ? stat(
              'Storage used',
              `${Math.round(storageUsed(business))} / ${count(building.storageCapacity)}`,
              storageUsed(business) > building.storageCapacity * 0.9 ? 'bad' : undefined,
            )
          : null,
        h('p', {
          class: 'tiny muted',
          text: 'Longer hours reach more customers but cost more in wages. Marketing raises awareness, which fades if you stop.',
        }),
      ),
    ),
  );

  return host;
}

/** Estimated demand at different price points — the pricing analytics from §32. */
function priceAnalysis(ctx: Ctx, business: Business): HTMLElement {
  const state = ctx.state;
  const type = businessTypeOrThrow(business.typeId);
  const steps = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
  const current = priceIndex(business);

  const rows = steps.map((factor) => {
    const overrides: Record<string, number> = {};
    for (const productId of type.productIds) {
      const def = product(productId);
      if (!def) continue;
      overrides[productId] = (business.prices[productId] ?? def.marketPrice) * factor;
    }
    if (type.serviceFee > 0) {
      overrides.service = (business.prices.service ?? type.serviceFee) * factor;
    }
    const customers = estimateDailyCustomers(state, business, overrides);
    // Revenue per customer moves with the price change.
    const perCustomer = revenuePerCustomer(business, factor);
    const cogs = costPerCustomer(business);
    const gross = customers * (perCustomer - cogs);
    return {
      factor,
      customers,
      revenue: customers * perCustomer,
      gross,
    };
  });

  const best = rows.reduce((a, b) => (b.gross > a.gross ? b : a), rows[0]);

  return h(
    'div',
    {},
    h('h4', { class: 'panel-title', style: 'margin-top:14px', text: 'What happens if you change price' }),
    table(
      ['Price', 'Est. customers/day', 'Est. revenue/day', 'Est. gross profit/day'],
      rows.map((row) => [
        h('span', {
          class: row.factor === 1 ? 'tag accent' : '',
          text: row.factor === 1 ? 'Current' : `${row.factor > 1 ? '+' : ''}${Math.round((row.factor - 1) * 100)}%`,
        }),
        count(row.customers),
        money(row.revenue),
        h('span', { class: row === best ? 'good' : '', text: money(row.gross) }),
      ]),
    ),
    h('p', {
      class: 'tiny muted',
      text: `You are currently charging ${Math.round(current * 100)}% of the market price. These are estimates at today's demand; competitors will react to a big move.`,
    }),
  );
}

function revenuePerCustomer(business: Business, factor: number): number {
  const type = businessTypeOrThrow(business.typeId);
  let total = type.serviceFee > 0 ? (business.prices.service ?? type.serviceFee) * factor : 0;
  const defs = type.productIds.map((id) => product(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const appeal = sum(defs, (d) => d.appeal);
  if (appeal <= 0) return total;
  for (const def of defs) {
    const price = (business.prices[def.id] ?? def.marketPrice) * factor;
    total += (def.appeal / appeal) * def.unitsPerBasket * price;
  }
  return total;
}

function costPerCustomer(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  const defs = type.productIds.map((id) => product(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const appeal = sum(defs, (d) => d.appeal);
  if (appeal <= 0) return 0;
  let total = 0;
  for (const def of defs) {
    const cost = business.costBasis[def.id] ?? def.wholesalePrice;
    total += (def.appeal / appeal) * def.unitsPerBasket * cost;
  }
  return total;
}

/** Why this business is winning or losing against the businesses next door. */
function competitivePanel(ctx: Ctx, business: Business): HTMLElement {
  const state = ctx.state;
  const own = attractiveness(state, business);
  const rivals = rivalsOf(state, business);
  const panel = section('Competitive position');

  panel.appendChild(
    h('p', {
      class: 'tiny muted',
      text:
        rivals.length === 0
          ? 'Nobody else in this district sells what you sell. Enjoy it while it lasts.'
          : `${rivals.length} rival${rivals.length === 1 ? '' : 's'} compete for the same customers here.`,
    }),
  );

  for (const factor of own.factors) {
    const relative = clamp(factor.value / 2, 0, 1);
    panel.appendChild(
      h(
        'div',
        { style: 'margin:8px 0' },
        h(
          'div',
          { style: 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px' },
          h('span', { text: factor.label }),
          h('span', { class: 'muted', text: factor.hint }),
        ),
        bar(relative, factor.value >= 1.05 ? 'good' : factor.value < 0.85 ? 'bad' : ''),
      ),
    );
  }

  if (rivals.length > 0) {
    panel.appendChild(
      table(
        ['Competitor', 'Owner', 'Price level', 'Reviews', 'Pull'],
        rivals.map((rival) => {
          const owner = state.companies.find((c) => c.id === rival.companyId);
          const score = attractiveness(state, rival).score;
          const total = own.score + sum(rivals, (r) => attractiveness(state, r).score);
          return [
            rival.name,
            owner?.name ?? '—',
            pct(priceIndex(rival) * 100),
            `${rival.reviewScore.toFixed(1)}★`,
            pct((score / Math.max(0.0001, total)) * 100),
          ];
        }),
      ),
    );
  }

  return panel;
}
