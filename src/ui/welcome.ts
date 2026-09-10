import type { GameState } from '../sim/state';
import { START_CASH } from '../sim/state';
import { createNewGame } from '../sim/setup';
import { deleteSave, listSaves, loadGame } from '../sim/save';
import { CITY_NAME, CITY_POPULATION } from '../data/districts';
import { count, money } from '../sim/format';
import { button, clear, h, toast } from './dom';

/**
 * The start screen. It exists so the first thing a player sees is a decision —
 * what to call the company — rather than a wall of numbers.
 */
export function showWelcome(root: HTMLElement, onStart: (state: GameState) => void): void {
  clear(root);
  const saves = listSaves();

  const nameInput = h('input', {
    type: 'text',
    value: 'Newco',
    maxlength: 40,
    placeholder: 'Company name',
  });

  const start = (): void => {
    const name = nameInput.value.trim() || 'Newco';
    onStart(createNewGame(name));
  };

  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') start();
  });

  const saveList = h('div', {});
  if (saves.length > 0) {
    saveList.appendChild(h('h3', { class: 'panel-title', style: 'margin-top:18px', text: 'Continue' }));
    for (const slot of saves.slice(0, 6)) {
      saveList.appendChild(
        h(
          'div',
          { class: 'save-row' },
          h(
            'div',
            { style: 'flex:1;min-width:0' },
            h('div', { text: slot.name + (slot.auto ? ' (auto)' : '') }),
            h('div', {
              class: 'save-meta',
              text: `${slot.company} · day ${slot.day} · ${money(slot.netWorth)}`,
            }),
          ),
          button(
            'Load',
            () => {
              const loaded = loadGame(slot.id);
              if (!loaded) {
                toast('That save could not be read.', 'bad');
                return;
              }
              onStart(loaded);
            },
            'btn small primary',
          ),
          button(
            'Delete',
            () => {
              deleteSave(slot.id);
              showWelcome(root, onStart);
            },
            'btn small ghost',
          ),
        ),
      );
    }
  }

  root.appendChild(
    h(
      'div',
      { class: 'welcome' },
      h(
        'div',
        { class: 'welcome-card' },
        h('div', { class: 'brand-mark', style: 'margin-bottom:14px' }, 'BM'),
        h('h1', { class: 'welcome-title', text: 'Business Manager' }),
        h('p', {
          class: 'welcome-sub',
          text: `${CITY_NAME}, population ${count(CITY_POPULATION)}. You have ${money(
            START_CASH,
          )} and no employees. Established chains already hold the best pitches. Find a gap, open something, and try to still be trading next month.`,
        }),
        h(
          'div',
          { class: 'panel' },
          h('label', { class: 'field' }, h('span', { text: 'What is your company called?' }), nameInput),
          h(
            'div',
            { class: 'btn-row' },
            button('Start a new company', start, 'btn primary'),
          ),
          h('p', {
            class: 'tiny muted',
            style: 'margin-top:12px',
            text: 'A short tutorial walks through the first business. You can skip it at any point.',
          }),
        ),
        saveList,
      ),
    ),
  );

  nameInput.focus();
  nameInput.select();
}
