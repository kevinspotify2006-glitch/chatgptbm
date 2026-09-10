import type { Ctx } from './app';
import type { GameState } from '../sim/state';
import { playerBusinesses } from '../sim/state';
import { h } from './dom';

interface Step {
  title: string;
  body: string;
  /** The step is finished once this is true. */
  done: (state: GameState) => boolean;
  /** Optional shortcut button. */
  action?: { label: string; route: string };
}

/**
 * The tutorial reads the real game state rather than scripting the player, so
 * it stays correct if they do things out of order, and it never blocks input.
 */
const STEPS: Step[] = [
  {
    title: 'Find a location',
    body: 'Open the map and look at what each district offers. Foot traffic sells convenience goods; income sells expensive ones. Tap a building to see its rent, size and who is nearby.',
    done: (state) => state.buildings.some((b) => b.occupantCompanyId === state.playerCompanyId),
    action: { label: 'Open the map', route: 'map' },
  },
  {
    title: 'Rent the unit',
    body: 'Renting needs the first month plus a two-month deposit. Buying costs far more but the building keeps its value and can be sold later.',
    done: (state) => state.buildings.some((b) => b.occupantCompanyId === state.playerCompanyId),
    action: { label: 'Open the map', route: 'map' },
  },
  {
    title: 'Create a business',
    body: 'Choose a business type that suits the unit and the district. Fit-out and equipment are paid once, up front.',
    done: (state) => playerBusinesses(state).length > 0,
    action: { label: 'Go to Businesses', route: 'businesses' },
  },
  {
    title: 'Order stock',
    body: 'Pick a supplier and order. Cheap suppliers have long lead times and let you down more often — that trade-off is the whole game early on.',
    done: (state) => playerBusinesses(state).some((b) => Object.values(b.stock).some((units) => units > 0) || state.orders.length > 0),
    action: { label: 'Go to Inventory', route: 'inventory' },
  },
  {
    title: 'Hire someone',
    body: 'Staff decide how many customers you can actually serve in an hour. One person is enough to open; a queue out of the door is lost revenue.',
    done: (state) => state.employees.length > 0,
    action: { label: 'Go to Employees', route: 'employees' },
  },
  {
    title: 'Set your prices and open',
    body: 'The pricing screen estimates daily customers at each price. Undercutting the district wins share but shreds your margin. Then open the doors.',
    done: (state) => playerBusinesses(state).some((b) => b.status === 'open'),
    action: { label: 'Go to Businesses', route: 'businesses' },
  },
  {
    title: 'Let time run',
    body: 'Press play, or space to pause. Customers arrive hour by hour and money moves in real time. Watch the first day closely.',
    done: (state) => state.dayHistory.length > 0,
  },
  {
    title: 'Read the result',
    body: 'The reports screen explains what happened and why: which costs moved, where customers were lost and what to try next.',
    done: (state) => state.dayHistory.length > 1,
    action: { label: 'Go to Reports', route: 'reports' },
  },
];

export function renderTutorial(ctx: Ctx): HTMLElement | null {
  const state = ctx.state;
  if (!state.settings.showTutorial) return null;

  // Advance past everything already done.
  let index = state.tutorialStep;
  while (index < STEPS.length && STEPS[index].done(state)) index += 1;
  state.tutorialStep = index;
  if (index >= STEPS.length) {
    state.settings.showTutorial = false;
    return null;
  }

  const step = STEPS[index];
  return h(
    'aside',
    { class: 'tutorial' },
    h('div', { class: 'tutorial-step', text: `Step ${index + 1} of ${STEPS.length}` }),
    h('h4', { text: step.title }),
    h('p', { text: step.body }),
    h(
      'div',
      { class: 'btn-row' },
      step.action
        ? h(
            'button',
            {
              class: 'btn small primary',
              on: { click: () => ctx.go(step.action!.route) },
            },
            step.action.label,
          )
        : null,
      h(
        'button',
        {
          class: 'btn small ghost',
          on: {
            click: () => {
              state.settings.showTutorial = false;
              ctx.refresh();
            },
          },
        },
        'Skip tutorial',
      ),
    ),
  );
}
