import type { Ctx, View } from '../app';
import { currentMarketEvents, deepState, marketSharePercent } from '../../sim/deepSimulation';
import { businessType } from '../../data/businessTypes';
import { playerBusinesses } from '../../sim/state';
import { money, pct } from '../../sim/format';
import { empty, h, section, stat, table } from '../dom';

export function marketView(ctx: Ctx): View {
  const state = ctx.state;
  const deep = deepState(state);
  const el = h('div', { class: 'view' });
  const player = playerBusinesses(state).filter((b) => b.status === 'open');

  el.appendChild(h('div', { class: 'view-head' }, h('h1', { text: 'Market Intelligence' }), h('p', { text: 'See the forces behind demand, customers and competition.' })));
  el.appendChild(h('div', { class: 'grid cols-4' },
    stat('Retail share', pct(marketSharePercent(state, 'retail'), 1)),
    stat('Food share', pct(marketSharePercent(state, 'food'), 1)),
    stat('Services share', pct(marketSharePercent(state, 'services'), 1)),
    stat('Specialized share', pct(marketSharePercent(state, 'specialized'), 1)),
  ));

  const events = currentMarketEvents(state);
  const eventRows = events.map((event) => h('div', { class: 'alert-row' },
    h('span', { class: 'alert-dot info' }),
    h('div', { style: 'flex:1' },
      h('div', { class: 'alert-title', text: event.title }),
      h('div', { class: 'alert-detail', text: `${event.description} · ${event.daysLeft} days remaining` }),
    ),
  ));
  el.appendChild(section('Live market events', ...(eventRows.length ? eventRows : [empty('No exceptional market events are active. The city is currently stable.')] )));

  const districtRows = (Object.entries(deep.districts) as [string, NonNullable<typeof deep.districts[string]>][]).map(([district, market]) => [
    h('span', { text: district.replace(/^./, (c) => c.toUpperCase()) }),
    pct(((market?.demandIndex ?? 1) - 1) * 100, 1),
    pct(((market?.footfallIndex ?? 1) - 1) * 100, 1),
    pct((market?.playerShare ?? 0) * 100, 1),
  ]);
  el.appendChild(section('District markets', table(['District', 'Demand vs base', 'Footfall vs base', 'Your share'], districtRows)));

  const businessRows = player.map((business) => {
    const retention = deep.customerRetention[business.id] ?? 0;
    const cac = deep.customerAcquisitionCost[business.id] ?? 0;
    const ltv = deep.customerLifetimeValue[business.id] ?? 0;
    const type = businessType(business.typeId);
    return [
      h('span', { text: `${type?.icon ?? ''} ${business.name}` }),
      pct(retention * 100, 1),
      money(cac),
      money(ltv),
      pct(business.awareness, 1),
    ];
  });
  const customerContent = businessRows.length
    ? table(['Business', 'Retention', 'Acquisition cost', 'Lifetime value', 'Awareness'], businessRows)
    : empty('Open a business to start collecting customer economics.');
  el.appendChild(section('Customer economics', customerContent));

  const segmentRows = Object.entries(deep.segments).map(([name, segment]) => [
    h('span', { text: name.replace(/^./, (c) => c.toUpperCase()) }),
    Math.round(segment.population).toLocaleString('en-GB'),
    `${Math.round(segment.priceSensitivity * 100)}%`,
    `${Math.round(segment.qualitySensitivity * 100)}%`,
    `${Math.round(segment.loyalty * 100)}%`,
  ]);
  el.appendChild(section('Consumer segments', table(['Segment', 'Population', 'Price sensitivity', 'Quality sensitivity', 'Loyalty'], segmentRows)));

  return { el };
}
