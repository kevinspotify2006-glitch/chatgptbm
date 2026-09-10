import type { Ctx, View } from '../app';
import type { Building } from '../../sim/types';
import { DISTRICTS, district } from '../../data/districts';
import { buyBuilding, endLease, renovate, renovationCost, rentBuilding, sellBuilding } from '../../sim/business';
import { playerCompany } from '../../sim/state';
import { count, money, pct } from '../../sim/format';
import { sum } from '../../sim/util';
import { button, confirmDialog, empty, h, section, select, table, toast } from '../dom';

export function propertyView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const company = playerCompany(state);

  const mine = state.buildings.filter((b) => b.occupantCompanyId === company.id);
  const owned = mine.filter((b) => b.status === 'owned');
  const leased = mine.filter((b) => b.status === 'rented');

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: 'Real estate' }),
      h('p', {
        text: `${owned.length} owned · ${leased.length} leased · ${money(sum(owned, (b) => b.value))} of property`,
      }),
    ),
  );

  // ----------------------------------------------------------- portfolio
  const portfolio = section('Your premises');
  if (mine.length === 0) {
    portfolio.appendChild(empty('You do not hold any premises yet.'));
  } else {
    portfolio.appendChild(
      table(
        ['Address', 'District', 'Size', 'Status', 'Rent', 'Value', 'Condition', ''],
        mine.map((building) => {
          const business = building.businessId ? state.businesses.find((b) => b.id === building.businessId) : undefined;
          return [
            h(
              'div',
              {},
              h('div', { text: building.address }),
              business ? h('div', { class: 'tiny muted', text: business.name }) : h('div', { class: 'tiny muted', text: 'Empty' }),
            ),
            district(building.district).name,
            `${building.size} m²`,
            h('span', {
              class: `tag ${building.status === 'owned' ? 'good' : 'accent'}`,
              text: building.status === 'owned' ? 'Owned' : 'Leased',
            }),
            building.status === 'rented' ? `${money(building.rent)}/mo` : '—',
            money(building.value),
            h('span', {
              class: building.condition < 50 ? 'bad' : '',
              text:
                building.renovationEndsOnDay !== null
                  ? `Work until day ${building.renovationEndsOnDay}`
                  : `${Math.round(building.condition)}/100`,
            }),
            buildingActions(ctx, building),
          ];
        }),
      ),
    );
    portfolio.appendChild(
      h('p', {
        class: 'tiny muted',
        text: 'Owning removes rent and gives you an asset that moves with the district; leasing keeps cash free for stock and staff.',
      }),
    );
  }
  el.appendChild(portfolio);

  // ------------------------------------------------------------- market
  let districtFilter = 'all';
  let sortBy = 'rent';
  const marketHost = h('div', {});

  const renderMarket = (): void => {
    marketHost.innerHTML = '';
    let available = state.buildings.filter((b) => b.status === 'available');
    if (districtFilter !== 'all') available = available.filter((b) => b.district === districtFilter);
    available.sort((a, b) => {
      if (sortBy === 'rent') return a.rent - b.rent;
      if (sortBy === 'price') return a.value - b.value;
      if (sortBy === 'size') return b.size - a.size;
      return b.footTraffic - a.footTraffic;
    });

    marketHost.appendChild(
      table(
        ['Address', 'District', 'Size', 'Foot traffic', 'Rent', 'Price', 'Condition', ''],
        available.slice(0, 40).map((building) => [
          building.address,
          district(building.district).name,
          `${building.size} m²`,
          count(building.footTraffic),
          `${money(building.rent)}/mo`,
          money(building.value),
          `${Math.round(building.condition)}`,
          h(
            'div',
            { class: 'btn-row' },
            button('View', () => ctx.go('map', { building: building.id }), 'btn small'),
            button(
              'Rent',
              async () => {
                const ok = await confirmDialog(
                  'Sign the lease?',
                  `${building.address} costs ${money(building.rent)} per month. ${money(building.rent * 3)} is due now.`,
                  'Sign lease',
                );
                if (!ok) return;
                const result = rentBuilding(state, building.id);
                toast(result.message, result.ok ? 'good' : 'bad');
                if (result.ok) ctx.refresh();
              },
              'btn small primary',
            ),
          ),
        ]),
      ),
    );
    if (available.length === 0) marketHost.appendChild(empty('Nothing available with these filters.'));
    else if (available.length > 40) {
      marketHost.appendChild(h('p', { class: 'tiny muted', text: `Showing 40 of ${available.length} available units.` }));
    }
  };

  el.appendChild(
    section(
      'Available units',
      h(
        'div',
        { class: 'grid cols-2' },
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'District' }),
          select(
            [{ value: 'all', label: 'All districts' }, ...DISTRICTS.map((d) => ({ value: d.id, label: d.name }))],
            districtFilter,
            (value) => {
              districtFilter = value;
              renderMarket();
            },
          ),
        ),
        h(
          'label',
          { class: 'field' },
          h('span', { text: 'Sort by' }),
          select(
            [
              { value: 'rent', label: 'Cheapest rent' },
              { value: 'price', label: 'Cheapest to buy' },
              { value: 'size', label: 'Largest' },
              { value: 'traffic', label: 'Busiest' },
            ],
            sortBy,
            (value) => {
              sortBy = value;
              renderMarket();
            },
          ),
        ),
      ),
      marketHost,
    ),
  );
  renderMarket();

  // ------------------------------------------------------ district table
  el.appendChild(
    section(
      'District property market',
      table(
        ['District', 'Rent/m²', 'Price/m²', 'Growth', 'Value index', 'Free units'],
        DISTRICTS.map((def) => {
          const districtState = state.districts[def.id];
          const free = state.buildings.filter((b) => b.district === def.id && b.status === 'available').length;
          return [
            def.name,
            money(def.rentPerSqm * (districtState?.rentIndex ?? 1)),
            money(def.pricePerSqm * (districtState?.propertyIndex ?? 1)),
            pct(def.growth * 100, 1),
            h('span', {
              class: (districtState?.propertyIndex ?? 1) > 1.02 ? 'good' : '',
              text: pct((districtState?.propertyIndex ?? 1) * 100),
            }),
            String(free),
          ];
        }),
      ),
    ),
  );

  return { el };
}

function buildingActions(ctx: Ctx, building: Building): HTMLElement {
  const state = ctx.state;
  const row = h('div', { class: 'btn-row' });
  row.appendChild(button('Map', () => ctx.go('map', { building: building.id }), 'btn small'));

  if (building.condition < 97 && building.renovationEndsOnDay === null) {
    row.appendChild(
      button(
        `Renovate ${money(renovationCost(building))}`,
        async () => {
          const ok = await confirmDialog('Start renovation?', 'Six days of work restores the unit to full condition.', 'Start');
          if (!ok) return;
          const result = renovate(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        },
        'btn small',
      ),
    );
  }

  if (building.status === 'rented' && !building.businessId) {
    row.appendChild(
      button(
        'End lease',
        async () => {
          const ok = await confirmDialog('End the lease?', `You get ${money(building.rent * 1.5)} of the deposit back.`, 'End lease');
          if (!ok) return;
          const result = endLease(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        },
        'btn small ghost',
      ),
    );
  }

  if (building.status === 'rented') {
    row.appendChild(
      button(
        `Buy ${money(building.value)}`,
        async () => {
          const ok = await confirmDialog(
            'Buy the freehold?',
            `Buying ${building.address} for ${money(building.value)} ends the rent and turns it into an asset.`,
            'Buy',
          );
          if (!ok) return;
          const result = buyBuilding(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        },
        'btn small',
      ),
    );
  }

  if (building.status === 'owned' && !building.businessId) {
    row.appendChild(
      button(
        'Sell',
        async () => {
          const ok = await confirmDialog(
            'Sell this building?',
            `You would receive about ${money(Math.round(building.value * 0.94))} after fees.`,
            'Sell',
          );
          if (!ok) return;
          const result = sellBuilding(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        },
        'btn small danger',
      ),
    );
  }

  return row;
}

/** Total property exposure, used on the dashboard. */
export function portfolioValue(ctx: Ctx): number {
  return sum(
    ctx.state.buildings.filter((b) => b.status === 'owned' && b.occupantCompanyId === ctx.state.playerCompanyId),
    (b) => b.value,
  );
}
