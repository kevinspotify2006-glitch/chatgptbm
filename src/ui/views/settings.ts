import type { Ctx, View } from '../app';
import { AUTOSAVE_ID, deleteSave, listSaves, loadGame, renameSave, saveGame } from '../../sim/save';
import { playerCompany } from '../../sim/state';
import { createNewGame } from '../../sim/setup';
import { money } from '../../sim/format';
import { makeId } from '../../sim/util';
import { button, confirmDialog, empty, h, section, stat, toast } from '../dom';

export function settingsView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const company = playerCompany(state);

  el.appendChild(h('div', { class: 'view-head' }, h('h1', { text: 'Settings' }), h('p', { text: 'Saves and preferences' })));

  // --------------------------------------------------------------- saves
  const savePanel = section('Saved games');
  const nameInput = h('input', {
    type: 'text',
    value: `${company.name} — day ${state.day}`,
    maxlength: 40,
    placeholder: 'Save name',
  });

  savePanel.appendChild(
    h(
      'div',
      { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px' },
      h('label', { class: 'field', style: 'flex:1;min-width:180px;margin:0' }, h('span', { text: 'Save as' }), nameInput),
      button(
        'Save now',
        () => {
          const result = saveGame(state, makeId('save'), nameInput.value.trim() || `Day ${state.day}`);
          toast(result.message, result.ok ? 'good' : 'bad');
          ctx.refresh();
        },
        'btn primary',
      ),
    ),
  );

  const saves = listSaves();
  if (saves.length === 0) {
    savePanel.appendChild(empty('No saved games yet.'));
  }
  for (const slot of saves) {
    savePanel.appendChild(
      h(
        'div',
        { class: 'save-row' },
        h(
          'div',
          { style: 'flex:1;min-width:0' },
          h('div', { text: slot.name + (slot.auto ? ' (auto)' : '') }),
          h('div', {
            class: 'save-meta',
            text: `${slot.company} · day ${slot.day} · ${money(slot.netWorth)} · ${new Date(slot.savedAt).toLocaleString()}`,
          }),
        ),
        button(
          'Load',
          async () => {
            const ok = await confirmDialog('Load this save?', 'Anything unsaved in the current game is lost.', 'Load');
            if (!ok) return;
            const loaded = loadGame(slot.id);
            if (!loaded) {
              toast('That save could not be read.', 'bad');
              return;
            }
            ctx.engine.replaceState(loaded);
            toast(`Loaded “${slot.name}”.`, 'good');
            ctx.go('dashboard');
          },
          'btn small',
        ),
        button(
          'Rename',
          () => {
            const next = window.prompt('New name', slot.name);
            if (next === null) return;
            renameSave(slot.id, next);
            ctx.refresh();
          },
          'btn small ghost',
        ),
        button(
          'Delete',
          async () => {
            const ok = await confirmDialog('Delete this save?', `“${slot.name}” cannot be recovered.`, 'Delete');
            if (!ok) return;
            deleteSave(slot.id);
            ctx.refresh();
          },
          'btn small danger',
        ),
      ),
    );
  }
  el.appendChild(savePanel);

  // --------------------------------------------------------- preferences
  el.appendChild(
    section(
      'Preferences',
      toggle('Autosave at the end of each day', state.settings.autosave, (value) => {
        state.settings.autosave = value;
        if (value) saveGame(state, AUTOSAVE_ID, 'Autosave', true);
      }),
      toggle('Show the tutorial', state.settings.showTutorial, (value) => {
        state.settings.showTutorial = value;
        if (value) state.tutorialStep = 0;
        ctx.refresh();
      }),
      toggle('Confirm large purchases', state.settings.confirmLargeSpend, (value) => {
        state.settings.confirmLargeSpend = value;
      }),
    ),
  );

  // ------------------------------------------------------------ new game
  el.appendChild(
    section(
      'New game',
      h('p', { class: 'tiny muted', text: 'Starts again from day 1 with fresh capital and a new set of competitors.' }),
      h(
        'div',
        { class: 'btn-row' },
        button(
          'Start a new game',
          async () => {
            const ok = await confirmDialog(
              'Start a new game?',
              'The current game continues to exist only if you have saved it.',
              'Start over',
            );
            if (!ok) return;
            const name = window.prompt('Company name', 'Newco');
            if (name === null) return;
            ctx.engine.replaceState(createNewGame(name));
            toast('New game started.', 'good');
            ctx.go('dashboard');
          },
          'btn danger',
        ),
      ),
    ),
  );

  // -------------------------------------------------------------- about
  el.appendChild(
    section(
      'About',
      stat('Company', company.name),
      stat('Day', String(state.day)),
      stat('Total revenue', money(state.stats.revenueTotal)),
      stat('Total costs', money(state.stats.costsTotal)),
      stat('Customers served', String(Math.round(state.stats.customersTotal))),
      stat('Peak net worth', money(state.stats.peakNetWorth)),
      h('p', {
        class: 'tiny muted',
        text: 'Keyboard: space pauses, 1–4 set the speed. The simulation runs the same at every speed.',
      }),
    ),
  );

  return { el };
}

function toggle(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    checked: value,
    on: {
      change: () => onChange(input.checked),
    },
  });
  return h('label', { class: 'switch' }, input, h('span', { text: label }));
}
