import type { Ctx, View } from '../app';
import type { Building } from '../../sim/types';
import { CityMap, MAP_MODES, type MapMode } from '../map';
import { district } from '../../data/districts';
import { CATEGORY_NAMES, BUSINESS_TYPES } from '../../data/businessTypes';
import { buyBuilding, endLease, renovate, renovationCost, rentBuilding, sellBuilding } from '../../sim/business';
import { count, money, moneyShort, pct } from '../../sim/format';
import { clamp } from '../../sim/util';
import { button, confirmDialog, empty, h, section, stat, table, toast } from '../dom';
import { openFoundBusinessDialog } from './newBusiness';

export function mapView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const panelHost = h('div', {});
  const map = new CityMap(ctx.state, persistentCamera);

  const modeRow = h('div', { class: 'map-modes' });
  const legend = h('div', { class: 'map-legend' });

  const setMode = (mode: MapMode): void => {
    map.setMode(mode);
    for (const child of Array.from(modeRow.children)) {
      const el2 = child as HTMLElement;
      el2.className = `map-mode${el2.dataset.mode === mode ? ' active' : ''}`;
    }
    renderLegend(legend, mode);
  };

  for (const mode of MAP_MODES) {
    modeRow.appendChild(
      h(
        'button',
        { class: 'map-mode', data: { mode: mode.id }, on: { click: () => setMode(mode.id) } },
        mode.label,
      ),
    );
  }

  const controls = h(
    'div',
    { class: 'map-controls' },
    h('button', { class: 'icon-btn', title: 'Zoom in', on: { click: () => map.zoomBy(1.35) } }, '＋'),
    h('button', { class: 'icon-btn', title: 'Zoom out', on: { click: () => map.zoomBy(1 / 1.35) } }, '−'),
    h(
      'button',
      {
        class: 'icon-btn',
        title: 'Back to your businesses',
        on: {
          click: () => {
            const mine = ctx.state.buildings.find((b) => b.occupantCompanyId === ctx.state.playerCompanyId);
            if (mine) map.focus(mine, 5);
            else toast('You do not have any premises yet.');
          },
        },
      },
      '◎',
    ),
  );

  const shell = h('div', { class: 'map-shell' }, map.canvas, modeRow, controls, legend);

  map.onSelect = (building) => {
    renderBuildingPanel(ctx, panelHost, building, map);
  };

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: 'Northgate' }),
      h('p', { text: 'Tap a unit to inspect it. Drag to pan, pinch or scroll to zoom.' }),
    ),
  );
  el.appendChild(shell);
  el.appendChild(panelHost);
  el.appendChild(districtTable(ctx));

  // The canvas needs a layout pass before it can measure itself.
  requestAnimationFrame(() => {
    map.resize();
    setMode('standard');
    const preselect = ctx.params.building;
    if (preselect) {
      const building = ctx.state.buildings.find((b) => b.id === preselect);
      if (building) {
        map.focus(building, 6);
        map.select(building.id);
        renderBuildingPanel(ctx, panelHost, building, map);
      }
    }
  });

  return {
    el,
    update: () => map.setState(ctx.state),
    destroy: () => map.destroy(),
  };
}

/** The map remembers where the player was looking between visits. */
const persistentCamera = { x: 0.5, y: 0.46, zoom: 1 };

function renderLegend(host: HTMLElement, mode: MapMode): void {
  const def = MAP_MODES.find((m) => m.id === mode);
  host.innerHTML = '';
  host.appendChild(h('strong', { text: def?.label ?? '' }));
  host.appendChild(h('div', { class: 'tiny muted', text: def?.legend ?? '' }));
  const rows: [string, string][] =
    mode === 'standard' || mode === 'commercial'
      ? [
          ['#4bbf87', 'Yours'],
          ['#e2686d', 'Competitor'],
          ['#6f9bd0', 'Available'],
        ]
      : [
          ['rgb(58,110,180)', 'Low'],
          ['rgb(150,170,140)', 'Medium'],
          ['rgb(240,80,50)', 'High'],
        ];
  for (const [colour, label] of rows) {
    host.appendChild(
      h(
        'div',
        { class: 'legend-row' },
        h('span', { class: 'legend-swatch', style: `background:${colour}` }),
        h('span', { text: label }),
      ),
    );
  }
}

function renderBuildingPanel(ctx: Ctx, host: HTMLElement, building: Building | null, map: CityMap): void {
  host.innerHTML = '';
  if (!building) return;
  const state = ctx.state;
  const def = district(building.district);
  const business = building.businessId ? state.businesses.find((b) => b.id === building.businessId) : undefined;
  const rivals = state.buildings.filter((b) => b.district === building.district && b.status === 'competitor').length;
  const total = state.buildings.filter((b) => b.district === building.district).length;
  const competition = rivals / Math.max(1, total);
  const competitionLabel = competition > 0.4 ? 'High' : competition > 0.18 ? 'Medium' : 'Low';

  const isMine = building.occupantCompanyId === state.playerCompanyId;
  const suitable = building.suitableFor.map((category) => CATEGORY_NAMES[category]).join(', ');

  const actions = h('div', { class: 'btn-row', style: 'margin-top:12px' });

  if (building.status === 'available') {
    actions.appendChild(
      button(
        `Rent — ${money(building.rent)}/mo`,
        async () => {
          const ok = await confirmDialog(
            'Sign the lease?',
            `${building.address} costs ${money(building.rent)} per month. You pay ${money(building.rent * 3)} now: the first month plus a two-month deposit.`,
            'Sign lease',
          );
          if (!ok) return;
          const result = rentBuilding(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        },
        'btn primary',
      ),
    );
    actions.appendChild(
      button(`Buy — ${money(building.value)}`, async () => {
        const ok = await confirmDialog(
          'Buy this building?',
          `${building.address} is on the market for ${money(building.value)}. You keep the asset and pay no rent, but it is a large amount of cash.`,
          'Buy building',
        );
        if (!ok) return;
        const result = buyBuilding(state, building.id);
        toast(result.message, result.ok ? 'good' : 'bad');
        if (result.ok) ctx.refresh();
      }),
    );
  }

  if (isMine && !business) {
    actions.appendChild(
      button(
        'Create a business here',
        () => openFoundBusinessDialog(ctx, building),
        'btn primary',
      ),
    );
    if (building.status === 'rented') {
      actions.appendChild(
        button('End lease', async () => {
          const ok = await confirmDialog('End the lease?', `You get ${money(building.rent * 1.5)} of the deposit back.`, 'End lease');
          if (!ok) return;
          const result = endLease(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        }, 'btn ghost'),
      );
    }
    if (building.status === 'owned') {
      actions.appendChild(
        button('Sell building', async () => {
          const ok = await confirmDialog(
            'Sell this building?',
            `You would receive about ${money(Math.round(building.value * 0.94))} after agent fees.`,
            'Sell',
          );
          if (!ok) return;
          const result = sellBuilding(state, building.id);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (result.ok) ctx.refresh();
        }, 'btn ghost'),
      );
    }
  }

  if (isMine && building.condition < 97 && building.renovationEndsOnDay === null) {
    actions.appendChild(
      button(`Renovate — ${money(renovationCost(building))}`, async () => {
        const ok = await confirmDialog(
          'Start renovation?',
          `Six days of work brings ${building.address} back to full condition. Customers notice a tired unit.`,
          'Start work',
        );
        if (!ok) return;
        const result = renovate(state, building.id);
        toast(result.message, result.ok ? 'good' : 'bad');
        if (result.ok) ctx.refresh();
      }),
    );
  }

  if (business && business.companyId === state.playerCompanyId) {
    actions.appendChild(button('Manage business', () => ctx.go('businesses', { business: business.id }), 'btn primary'));
  }

  actions.appendChild(
    button('Focus on map', () => {
      map.focus(building, 6);
      map.select(building.id);
    }, 'btn ghost'),
  );

  const statusTag =
    building.occupantCompanyId === state.playerCompanyId
      ? h('span', { class: 'tag good', text: building.status === 'owned' ? 'Owned' : 'Leased' })
      : building.status === 'competitor'
        ? h('span', { class: 'tag bad', text: 'Competitor' })
        : h('span', { class: 'tag accent', text: 'Available' });

  const panel = section(
    'Building',
    h(
      'div',
      { class: 'card-head' },
      h(
        'div',
        {},
        h('div', { class: 'card-title', text: building.address }),
        h('div', { class: 'card-sub', text: `${def.name} · ${building.size} m² · ${building.floors} floor${building.floors > 1 ? 's' : ''}` }),
      ),
      statusTag,
    ),
    h(
      'div',
      { class: 'grid cols-2' },
      h(
        'div',
        {},
        stat('Rent', `${money(building.rent)}/mo`),
        stat('Purchase price', money(building.value)),
        stat('Condition', `${Math.round(building.condition)}/100`, building.condition < 50 ? 'bad' : undefined),
        stat('Storage', `${count(building.storageCapacity)} units`),
        stat('Customer capacity', count(building.customerCapacity)),
        stat('Parking', count(building.parking)),
      ),
      h(
        'div',
        {},
        stat('Foot traffic', `${count(building.footTraffic)}/day`),
        stat('Average income', `${money(def.averageIncome)}/yr`),
        stat('District population', count(def.population)),
        stat('Competition', competitionLabel, competition > 0.4 ? 'bad' : undefined),
        stat('Growth', pct(def.growth * 100, 1)),
        stat('Suitable for', suitable || '—'),
      ),
    ),
    business
      ? h('p', {
          class: 'tiny muted',
          text:
            business.companyId === state.playerCompanyId
              ? `Your business "${business.name}" trades here.`
              : `Occupied by ${state.companies.find((c) => c.id === business.companyId)?.name ?? 'a competitor'}.`,
        })
      : null,
    building.renovationEndsOnDay !== null
      ? h('p', { class: 'tiny muted', text: `Renovation finishes on day ${building.renovationEndsOnDay}.` })
      : null,
    h('p', { class: 'tiny muted', text: def.description }),
    actions,
  );

  host.appendChild(panel);
}

/** District comparison table — the fastest way to choose where to trade. */
function districtTable(ctx: Ctx): HTMLElement {
  const state = ctx.state;
  const rows = [...state.buildings.reduce((acc, building) => {
    const entry = acc.get(building.district) ?? { available: 0, competitors: 0, mine: 0, rent: 0, count: 0 };
    entry.count += 1;
    entry.rent += building.rent;
    if (building.status === 'available') entry.available += 1;
    if (building.status === 'competitor') entry.competitors += 1;
    if (building.occupantCompanyId === state.playerCompanyId) entry.mine += 1;
    acc.set(building.district, entry);
    return acc;
  }, new Map<string, { available: number; competitors: number; mine: number; rent: number; count: number }>())];

  return section(
    'Districts',
    table(
      ['District', 'Population', 'Income', 'Foot traffic', 'Avg rent', 'Free units', 'Rivals', 'Yours'],
      rows.map(([id, entry]) => {
        const def = district(id as never);
        const row = [
          def.name,
          count(def.population),
          moneyShort(def.averageIncome),
          count(def.footTraffic),
          money(entry.rent / Math.max(1, entry.count)),
          String(entry.available),
          String(entry.competitors),
          entry.mine > 0 ? h('span', { class: 'tag good', text: String(entry.mine) }) : '—',
        ];
        return row;
      }),
    ),
    h('p', {
      class: 'tiny muted',
      text: 'Cheap rent usually means low foot traffic. The trick is finding the district where what you sell matches what people there can afford.',
    }),
    rows.length === 0 ? empty('No districts loaded.') : null,
  );
}

/** Business types that physically fit a unit — used by the founding dialog. */
export function typesFor(building: Building): typeof BUSINESS_TYPES {
  return BUSINESS_TYPES.filter(
    (type) => building.size >= type.minSize && building.suitableFor.includes(type.category),
  ).sort((a, b) => a.setupCost - b.setupCost);
}

export function competitionIndex(ctx: Ctx, districtId: string): number {
  const buildings = ctx.state.buildings.filter((b) => b.district === districtId);
  const rivals = buildings.filter((b) => b.status === 'competitor').length;
  return clamp(rivals / Math.max(1, buildings.length * 0.55), 0, 1);
}
