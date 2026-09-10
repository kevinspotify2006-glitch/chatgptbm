import type { Ctx, View } from '../app';
import { setCompanyStrategy, world2State, type CompanyStrategy } from '../../sim/world2';
import { playerBusinesses, playerCompany } from '../../sim/state';
import { money, pct } from '../../sim/format';
import { empty, h, section, stat, table, button, toast } from '../dom';

const STRATEGIES: { id: CompanyStrategy; name: string; description: string }[] = [
  { id: 'low_cost', name: 'Low Cost', description: 'Protect margin through lean operations and competitive pricing.' },
  { id: 'premium', name: 'Premium', description: 'Trade volume for stronger brand, awareness and pricing power.' },
  { id: 'growth', name: 'Growth', description: 'Prioritise customer acquisition, marketing and expansion.' },
  { id: 'quality', name: 'Quality', description: 'Invest in service quality and long-term customer satisfaction.' },
  { id: 'defensive', name: 'Defensive', description: 'Reduce risk and protect cash during uncertain periods.' },
  { id: 'niche', name: 'Niche', description: 'Focus on specialised demand instead of serving everyone.' },
  { id: 'innovation', name: 'Innovation', description: 'Push service quality and technology for a differentiated offer.' },
];

export function strategyView(ctx: Ctx): View {
  const state = ctx.state;
  const world = world2State(state);
  const company = playerCompany(state);
  const businesses = playerBusinesses(state).filter((b) => b.status === 'open');
  const el = h('div', { class: 'view' });
  el.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Company Strategy' }), h('p', { class: 'muted', text: 'Your strategy shapes how the company grows, competes and manages risk.' }))));
  el.appendChild(h('div', { class: 'stat-grid' }, stat('Current strategy', STRATEGIES.find((s) => s.id === world.playerStrategy)?.name ?? world.playerStrategy), stat('Strategy since', `Day ${world.strategySinceDay}`), stat('Cash', money(company.cash)), stat('Open businesses', String(businesses.length))));

  const strategyRows = STRATEGIES.map((item) => h('div', { class: `list-row ${world.playerStrategy === item.id ? 'selected' : ''}` },
    h('div', { style: 'flex:1' }, h('div', { class: 'list-title', text: item.name }), h('div', { class: 'muted', text: item.description })),
    button(world.playerStrategy === item.id ? 'Active' : 'Choose', () => { setCompanyStrategy(state, item.id); toast(`${item.name} strategy selected`, 'good'); ctx.refresh(); }, world.playerStrategy === item.id ? 'btn primary' : 'btn ghost'),
  ));
  el.appendChild(section('Strategic direction', ...strategyRows));

  const healthRows = businesses.map((business) => {
    const health = world.businessHealth[business.id];
    return [h('span', { text: business.name }), health?.stage ?? '—', pct((health?.margin ?? 0) * 100, 1), `${Math.round((health?.utilization ?? 0) * 100)}%`, pct((health?.satisfaction ?? 0) * 100, 1), pct((health?.risk ?? 0) * 100, 1)];
  });
  el.appendChild(section('Business lifecycle & health', healthRows.length ? table(['Business', 'Stage', 'Margin', 'Utilisation', 'Satisfaction', 'Risk'], healthRows) : empty('Open a business to start lifecycle analysis.')));
  el.appendChild(section('Management insight', world.lastInsight ? h('div', { class: 'alert-row' }, h('span', { class: 'alert-dot info' }), h('div', {}, h('div', { class: 'alert-title', text: world.lastInsight }), h('div', { class: 'alert-detail', text: 'This recommendation is generated from your latest operating data.' }))) : empty('Advance the simulation for the first weekly management insight.')));
  return { el };
}
