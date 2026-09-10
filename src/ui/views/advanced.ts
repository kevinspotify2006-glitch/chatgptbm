import type { Ctx, View } from '../app';
import { advancedState, acquireBusiness, createContract, createRoute, createWarehouse, RESEARCH, research, toggleAutomation, toggleSandbox } from '../../sim/advanced';
import { playerBusinesses } from '../../sim/state';
import { buildingById } from '../../sim/state';
import { money } from '../../sim/format';
import { bar, button, empty, h, section, stat, toast } from '../dom';

export function advancedView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  render(ctx, el);
  return { el };
}

function render(ctx: Ctx, el: HTMLElement): void {
  const state = ctx.state;
  const a = advancedState(state);
  const company = state.companies.find((c) => c.id === state.playerCompanyId)!;
  const businesses = playerBusinesses(state).filter((b) => b.status === 'open');

  el.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', { text: 'Operations & Growth' }), h('p', { class: 'muted', text: 'Run the systems that turn a successful company into an organisation.' })),
    h('div', { class: 'page-actions' },
      button(a.sandbox ? 'Sandbox: ON' : 'Sandbox: OFF', () => { toggleSandbox(state); toast(a.sandbox ? 'Sandbox disabled' : 'Sandbox enabled', 'info'); ctx.refresh(); }, a.sandbox ? 'btn primary' : 'btn ghost'),
      button(a.autoPricing ? 'Auto pricing: ON' : 'Auto pricing: OFF', () => { toggleAutomation(state, 'pricing'); ctx.refresh(); }, a.autoPricing ? 'btn primary' : 'btn ghost'),
      button(a.autoScheduling ? 'Auto scheduling: ON' : 'Auto scheduling: OFF', () => { toggleAutomation(state, 'scheduling'); ctx.refresh(); }, a.autoScheduling ? 'btn primary' : 'btn ghost'),
    ),
  ));

  el.appendChild(h('div', { class: 'stat-grid' },
    stat('Cash', money(company.cash), company.cash >= 0 ? 'good' : 'bad'),
    stat('Research points', `${Math.floor(a.researchPoints)} RP`),
    stat('Warehouses', String(a.warehouses.length)),
    stat('Routes', String(a.routes.filter((r) => r.active).length)),
    stat('Contracts', String(a.contracts.length)),
    stat('Acquired companies', String(a.holdings.length)),
  ));

  const researchRows = RESEARCH.map((r) => {
    const done = a.researched.includes(r.id);
    const locked = Boolean(r.prerequisite && !a.researched.includes(r.prerequisite));
    const can = !done && !locked && a.researchPoints >= r.cost;
    return h('div', { class: 'list-row' },
      h('div', { style: 'flex:1' },
        h('div', { class: 'list-title' }, r.name, done ? ' · COMPLETE' : ''),
        h('div', { class: 'muted', text: r.description }),
      ),
      h('div', { class: 'list-meta', text: done ? 'Unlocked' : locked ? `Requires ${r.prerequisite}` : `${r.cost} RP` }),
      button(done ? 'Done' : locked ? 'Locked' : 'Research', () => { if (research(state, r.id)) { toast(`${r.name} unlocked`, 'good'); ctx.refresh(); } }, done || locked || !can ? 'btn ghost' : 'btn primary'),
    );
  });
  el.appendChild(section('Technology tree', h('div', { class: 'progress-wrap' }, bar(Math.min(1, a.researchPoints / 300)), h('span', { class: 'muted', text: `${Math.floor(a.researchPoints)} research points available` })), ...researchRows));

  const warehouseRows = a.warehouses.map((w) => {
    const b = buildingById(state, w.buildingId);
    const used = Math.min(1, w.used / Math.max(1, w.capacity));
    return h('div', { class: 'list-row' },
      h('div', { style: 'flex:1' }, h('div', { class: 'list-title', text: b?.name ?? w.id }), h('div', { class: 'progress-wrap' }, bar(used), h('span', { class: 'muted', text: `${Math.round(w.used)} / ${Math.round(w.capacity)} capacity` }))),
      h('span', { class: 'pill', text: `${w.efficiency.toFixed(1)}× efficiency` }),
    );
  });
  el.appendChild(section('Warehousing', warehouseRows.length ? warehouseRows : empty('No warehouses yet. Add a warehouse to create a real supply buffer.')));

  const routeRows = a.routes.map((r) => {
    const from = state.businesses.find((b) => b.id === r.fromBusinessId)?.name ?? r.fromBusinessId;
    const to = state.businesses.find((b) => b.id === r.toBusinessId)?.name ?? r.toBusinessId;
    return h('div', { class: 'list-row' }, h('div', { style: 'flex:1' }, h('div', { class: 'list-title', text: `${from} → ${to}` }), h('div', { class: 'muted', text: `${r.unitsPerDay} units/day · ${money(r.costPerUnit)} per unit` })), h('span', { class: `pill ${r.active ? 'good' : ''}`, text: r.active ? 'Active' : 'Paused' }));
  });
  el.appendChild(section('Logistics',
    ...routeRows,
    businesses.length >= 2 ? button('Create route', () => openRouteModal(ctx), 'btn primary') : empty('Open at least two businesses to create a route.'),
  ));

  const contractRows = a.contracts.map((c) => h('div', { class: 'list-row' }, h('div', { style: 'flex:1' }, h('div', { class: 'list-title', text: c.customer }), h('div', { class: 'muted', text: `${c.unitsPerDay} units/day · ${money(c.pricePerUnit)} each · ${c.daysLeft} days left` })), h('span', { class: 'pill', text: `${money(c.reward)} target reward` })));
  el.appendChild(section('Contracts', ...contractRows, businesses.length ? button('Create contract', () => openContractModal(ctx), 'btn primary') : empty('Open a business first.')));

  const targets = state.businesses.filter((b) => b.companyId !== state.playerCompanyId && b.status === 'open').slice(0, 8);
  el.appendChild(section('Acquisitions',
    a.researched.includes('holding') ? (targets.length ? targets.map((target) => h('div', { class: 'list-row' }, h('div', { style: 'flex:1' }, h('div', { class: 'list-title', text: target.name }), h('div', { class: 'muted', text: `${money(target.totals.revenue)} revenue · reputation ${target.reputation.toFixed(0)}` })), button('Acquire', () => { if (acquireBusiness(state, target.id)) { toast(`${target.name} acquired`, 'good'); ctx.refresh(); } else toast('Acquisition failed: insufficient cash or target unavailable', 'bad'); }, 'btn primary'))) : empty('No acquisition targets available.')) : empty('Research Corporate Structure to unlock acquisitions.'),
  ));
}

function openRouteModal(ctx: Ctx): void {
  const { body, footer, close } = (awaitModal('Create logistics route'));
  const businesses = playerBusinesses(ctx.state).filter((b) => b.status === 'open');
  const from = h('select', {}, ...businesses.map((b) => h('option', { value: b.id, text: b.name })));
  const to = h('select', {}, ...businesses.map((b) => h('option', { value: b.id, text: b.name })));
  const units = h('input', { type: 'number', value: '20', min: 1 });
  body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'From' }), from));
  body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'To' }), to));
  body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Units per day' }), units));
  footer.appendChild(button('Cancel', close, 'btn ghost'));
  footer.appendChild(button('Create', () => { if (from.value === to.value) return toast('Choose two different businesses', 'bad'); if (createRoute(ctx.state, from.value, to.value, Number(units.value))) { toast('Logistics route created', 'good'); close(); ctx.refresh(); } }, 'btn primary'));
}

function openContractModal(ctx: Ctx): void {
  const { body, footer, close } = (awaitModal('Create contract'));
  const businesses = playerBusinesses(ctx.state).filter((b) => b.status === 'open');
  const business = h('select', {}, ...businesses.map((b) => h('option', { value: b.id, text: b.name })));
  const customer = h('input', { value: 'Local Enterprise', placeholder: 'Customer name' });
  const units = h('input', { type: 'number', value: '10', min: 1 });
  const price = h('input', { type: 'number', value: '25', min: 0.5, step: 0.5 });
  const days = h('input', { type: 'number', value: '30', min: 1 });
  for (const [label, input] of [['Business', business], ['Customer', customer], ['Units/day', units], ['Price/unit', price], ['Days', days]] as const) body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input));
  footer.appendChild(button('Cancel', close, 'btn ghost'));
  footer.appendChild(button('Sign contract', () => { if (createContract(ctx.state, business.value, customer.value.trim() || 'Unnamed client', Number(units.value), Number(price.value), Number(days.value))) { toast('Contract signed', 'good'); close(); ctx.refresh(); } }, 'btn primary'));
}

function awaitModal(title: string): { body: HTMLElement; footer: HTMLElement; close: () => void } {
  // Imported lazily here to keep the main view import list compact.
  // eslint-free project: direct DOM modal construction is sufficient.
  const overlay = h('div', { class: 'modal-overlay' });
  const body = h('div', { class: 'modal-body' });
  const footer = h('div', { class: 'modal-footer' });
  const close = () => overlay.remove();
  overlay.appendChild(h('div', { class: 'modal-card', style: 'max-width:520px' }, h('div', { class: 'modal-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn', on: { click: close } }, '✕')), body, footer));
  document.body.appendChild(overlay);
  return { body, footer, close };
}
