import type { GameState } from '../sim/state';
import { SPEEDS, SPEED_LABELS, playerBusinesses, playerCompany } from '../sim/state';
import { Engine } from '../sim/engine';
import { on } from '../sim/bus';
import { netWorth } from '../sim/finance';
import { currentTier } from '../sim/achievements';
import { economyLabel } from '../sim/economy';
import { distinctAlerts, markAlertsRead, unreadAlerts } from '../sim/alerts';
import { AUTOSAVE_ID, saveGame } from '../sim/save';
import { calendar, clockLabel, money, moneyShort, moneySigned } from '../sim/format';
import { clear, h, modal, toast } from './dom';
import { renderTutorial } from './tutorial';

export interface View {
  el: HTMLElement;
  /** Called a few times a second while the view is on screen. */
  update?: () => void;
  destroy?: () => void;
}

export interface Ctx {
  engine: Engine;
  state: GameState;
  /** Switch to another view. */
  go: (route: string, params?: Record<string, string>) => void;
  /** Rebuild the current view from scratch. */
  refresh: () => void;
  /** Route parameters, e.g. the selected business id. */
  params: Record<string, string>;
}

export type ViewFactory = (ctx: Ctx) => View;

interface NavEntry {
  route: string;
  label: string;
  icon: string;
  factory: ViewFactory;
  badge?: (state: GameState) => number;
}

export class App {
  private engine: Engine;
  private root: HTMLElement;
  private entries: NavEntry[] = [];
  private current: View | null = null;
  private route = 'dashboard';
  private params: Record<string, string> = {};
  private main!: HTMLElement;
  private navHost!: HTMLElement;
  private mobileNavHost!: HTMLElement;
  private topbar!: HTMLElement;
  private lastAutosaveDay = 0;
  private updateTimer: number | null = null;
  private tutorialHost: HTMLElement | null = null;

  constructor(root: HTMLElement, engine: Engine) {
    this.root = root;
    this.engine = engine;
    this.lastAutosaveDay = engine.state.day;
  }

  register(entry: NavEntry): void {
    this.entries.push(entry);
  }

  start(): void {
    this.build();
    this.go(this.route);
    this.engine.start();

    on('tick', () => this.updateChrome());
    on('day', () => {
      this.maybeAutosave();
      this.refresh();
    });
    on('alert', (alert) => {
      if (alert.priority === 'critical') toast(alert.title, 'bad');
      this.updateChrome();
    });

    // Views repaint a few times a second, which is plenty for numbers that
    // change hourly and keeps typing in forms from being interrupted.
    this.updateTimer = window.setInterval(() => {
      this.current?.update?.();
      this.updateChrome();
    }, 320);

    document.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.engine.togglePause();
        this.updateChrome();
      }
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
      if (index >= 0) {
        this.engine.setSpeed(index + 1);
        this.updateChrome();
      }
    });
  }

  stop(): void {
    this.engine.stop();
    if (this.updateTimer !== null) window.clearInterval(this.updateTimer);
  }

  private get state(): GameState {
    return this.engine.state;
  }

  private ctx(): Ctx {
    return {
      engine: this.engine,
      state: this.state,
      go: (route, params) => this.go(route, params),
      refresh: () => this.refresh(),
      params: this.params,
    };
  }

  go(route: string, params: Record<string, string> = {}): void {
    const entry = this.entries.find((item) => item.route === route) ?? this.entries[0];
    if (!entry) return;
    this.route = entry.route;
    this.params = params;
    this.current?.destroy?.();
    clear(this.main);
    this.current = entry.factory(this.ctx());
    this.main.appendChild(this.current.el);
    this.main.scrollTop = 0;
    this.renderNav();
    this.updateChrome();
  }

  refresh(): void {
    this.go(this.route, this.params);
  }

  private build(): void {
    clear(this.root);
    this.topbar = h('header', { class: 'topbar' });
    this.navHost = h('nav', { class: 'nav' });
    this.mobileNavHost = h('nav', { class: 'mobile-nav' });
    this.main = h('main', { class: 'main' });

    const brand = h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-mark', text: 'BM' }),
      h(
        'div',
        {},
        h('div', { class: 'brand-name', text: 'Business Manager' }),
        h('div', { class: 'brand-sub', text: 'Northgate' }),
      ),
    );

    this.root.appendChild(
      h('div', { class: 'shell' }, brand, this.topbar, this.navHost, this.main, this.mobileNavHost),
    );
    this.renderNav();
    this.renderTopbar();
  }

  private renderNav(): void {
    for (const host of [this.navHost, this.mobileNavHost]) {
      clear(host);
      for (const entry of this.entries) {
        const count = entry.badge?.(this.state) ?? 0;
        host.appendChild(
          h(
            'button',
            {
              class: `nav-item${entry.route === this.route ? ' active' : ''}`,
              on: { click: () => this.go(entry.route) },
            },
            h('span', { class: 'nav-icon', text: entry.icon }),
            h('span', { text: entry.label }),
            count > 0 ? h('span', { class: 'nav-badge', text: String(count) }) : null,
          ),
        );
      }
    }
  }

  private renderTopbar(): void {
    clear(this.topbar);

    const metric = (label: string, id: string): HTMLElement =>
      h(
        'div',
        { class: 'metric' },
        h('span', { class: 'metric-label', text: label }),
        h('span', { class: 'metric-value', id }),
        h('span', { class: 'metric-sub', id: `${id}-sub` }),
      );

    this.topbar.appendChild(metric('Cash', 'hud-cash'));
    this.topbar.appendChild(metric('Net worth', 'hud-worth'));
    this.topbar.appendChild(metric('Today', 'hud-today'));
    this.topbar.appendChild(metric('Date', 'hud-date'));
    this.topbar.appendChild(h('div', { class: 'topbar-spacer' }));

    const speeds = h('div', { class: 'speed-group', id: 'hud-speeds' });
    SPEEDS.forEach((_, index) => {
      speeds.appendChild(
        h(
          'button',
          {
            class: 'speed-btn',
            data: { speed: String(index) },
            title: index === 0 ? 'Pause (space)' : `Speed ${SPEED_LABELS[index]}`,
            on: {
              click: () => {
                this.engine.setSpeed(index);
                this.updateChrome();
              },
            },
          },
          SPEED_LABELS[index],
        ),
      );
    });
    this.topbar.appendChild(speeds);

    const bell = h(
      'div',
      { class: 'bell' },
      h('button', { class: 'icon-btn', title: 'Alerts', on: { click: () => this.openAlerts() } }, '🔔'),
      h('span', { class: 'bell-count', id: 'hud-alerts', text: '0' }),
    );
    this.topbar.appendChild(bell);
    this.updateChrome();
  }

  private updateChrome(): void {
    const state = this.state;
    const company = playerCompany(state);
    const set = (id: string, value: string, tone?: string): void => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = value;
      el.className = `metric-value${tone ? ` ${tone}` : ''}`;
    };
    const setSub = (id: string, value: string): void => {
      const el = document.getElementById(`${id}-sub`);
      if (el) el.textContent = value;
    };

    set('hud-cash', money(company.cash), company.cash < 0 ? 'bad' : undefined);
    const businesses = playerBusinesses(state).filter((b) => b.status === 'open').length;
    setSub('hud-cash', `${businesses} open · ${state.employees.length} staff`);

    const worth = netWorth(state);
    set('hud-worth', moneyShort(worth));
    setSub('hud-worth', currentTier(state).name);

    let revenue = 0;
    let costs = 0;
    for (const business of playerBusinesses(state)) {
      revenue += business.today.revenue;
      costs +=
        business.today.cogs + business.today.wages + business.today.rent + business.today.marketing + business.today.otherCosts;
    }
    const profit = revenue - costs;
    set('hud-today', moneySigned(profit), profit >= 0 ? 'good' : 'bad');
    setSub('hud-today', `${money(revenue)} in`);

    const cal = calendar(state.day);
    set('hud-date', `${clockLabel(state.hour)}`);
    setSub('hud-date', `${cal.weekday.slice(0, 3)} ${cal.dayOfMonth} ${cal.monthName.slice(0, 3)} · ${economyLabel(state).label}`);

    const speeds = document.getElementById('hud-speeds');
    if (speeds) {
      for (const child of Array.from(speeds.children)) {
        const index = Number((child as HTMLElement).dataset.speed);
        child.className = `speed-btn${index === state.speed ? ' active' : ''}`;
      }
    }

    const count = unreadAlerts(state).length;
    const badge = document.getElementById('hud-alerts');
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? '' : 'none';
    }

    this.renderNavBadges();
    this.renderTutorial();
  }

  private renderNavBadges(): void {
    for (const host of [this.navHost, this.mobileNavHost]) {
      const items = Array.from(host.children);
      this.entries.forEach((entry, index) => {
        const item = items[index];
        if (!item) return;
        const count = entry.badge?.(this.state) ?? 0;
        const existing = item.querySelector('.nav-badge');
        if (count > 0) {
          if (existing) existing.textContent = String(count);
          else item.appendChild(h('span', { class: 'nav-badge', text: String(count) }));
        } else if (existing) {
          existing.remove();
        }
      });
    }
  }

  private renderTutorial(): void {
    this.tutorialHost?.remove();
    this.tutorialHost = renderTutorial(this.ctx());
    if (this.tutorialHost) document.body.appendChild(this.tutorialHost);
  }

  private openAlerts(): void {
    const { body } = modal({ title: 'Alerts', width: 620 });
    const alerts = distinctAlerts(this.state);
    if (alerts.length === 0) {
      body.appendChild(h('p', { class: 'empty', text: 'Nothing needs your attention right now.' }));
    }
    for (const alert of alerts) {
      body.appendChild(
        h(
          'div',
          { class: 'alert-row' },
          h('span', { class: `alert-dot ${alert.priority}` }),
          h(
            'div',
            { style: 'flex:1' },
            h('div', { class: 'alert-title', text: alert.title }),
            h('div', { class: 'alert-detail', text: alert.detail }),
          ),
          h('span', { class: 'alert-time', text: `Day ${alert.day} ${clockLabel(alert.hour)}` }),
        ),
      );
    }
    markAlertsRead(this.state);
    this.updateChrome();
  }

  private maybeAutosave(): void {
    const state = this.state;
    if (!state.settings.autosave) return;
    if (state.day === this.lastAutosaveDay) return;
    this.lastAutosaveDay = state.day;
    saveGame(state, AUTOSAVE_ID, 'Autosave', true);
  }
}
