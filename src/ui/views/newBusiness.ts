import type { Ctx } from '../app';
import type { Building, BusinessTypeDef } from '../../sim/types';
import { BUSINESS_TYPES, CATEGORY_NAMES } from '../../data/businessTypes';
import { district } from '../../data/districts';
import { product } from '../../data/products';
import { role } from '../../data/roles';
import { foundBusiness } from '../../sim/business';
import { playerCompany } from '../../sim/state';
import { count, money } from '../../sim/format';
import { h, modal, stat, toast } from '../dom';

/** Business types that physically fit a unit and suit the district. */
export function typesForBuilding(building: Building): BusinessTypeDef[] {
  return BUSINESS_TYPES.filter(
    (type) => building.size >= type.minSize && building.suitableFor.includes(type.category),
  ).sort((a, b) => a.setupCost + a.equipmentCost - (b.setupCost + b.equipmentCost));
}

/**
 * Founding a business is the single biggest decision in the early game, so the
 * dialog shows the full cost and what the location is likely to support before
 * the player commits.
 */
export function openFoundBusinessDialog(ctx: Ctx, building: Building): void {
  const state = ctx.state;
  const company = playerCompany(state);
  const options = typesForBuilding(building);
  const { body, footer, close } = modal({ title: `New business — ${building.address}`, width: 700 });

  if (options.length === 0) {
    body.appendChild(
      h('p', {
        class: 'empty',
        text: `Nothing suitable fits here. The unit is ${building.size} m² and suits ${building.suitableFor
          .map((c) => CATEGORY_NAMES[c])
          .join(', ')}. Look for a larger unit or a different district.`,
      }),
    );
    return;
  }

  let selected = options[0];
  const detail = h('div', {});
  const nameInput = h('input', {
    type: 'text',
    value: `${company.name} ${selected.name}`,
    maxlength: 40,
    placeholder: 'Business name',
  });

  const list = h('div', { class: 'list' });
  const renderList = (): void => {
    list.innerHTML = '';
    for (const type of options) {
      const total = type.setupCost + type.equipmentCost;
      const affordable = company.cash >= total;
      list.appendChild(
        h(
          'div',
          {
            class: `card clickable${type.id === selected.id ? ' selected' : ''}`,
            style: type.id === selected.id ? 'border-color:var(--accent-2)' : '',
            on: {
              click: () => {
                selected = type;
                nameInput.value = `${company.name} ${type.name}`;
                renderList();
                renderDetail();
              },
            },
          },
          h(
            'div',
            { class: 'card-head' },
            h(
              'div',
              {},
              h('div', { class: 'card-title', text: `${type.icon} ${type.name}` }),
              h('div', { class: 'card-sub', text: type.description }),
            ),
            h('span', {
              class: `tag${affordable ? '' : ' bad'}`,
              text: money(total),
            }),
          ),
        ),
      );
    }
  };

  const renderDetail = (): void => {
    detail.innerHTML = '';
    const def = district(building.district);
    const total = selected.setupCost + selected.equipmentCost;
    const monthlyRent = building.status === 'rented' ? building.rent : 0;
    const staffCost = selected.roles.length * 2300;
    const preference = def.preferences[selected.category] ?? 1;
    const fit = preference >= 1.3 ? 'Strong fit' : preference >= 0.95 ? 'Reasonable fit' : 'Poor fit';

    detail.appendChild(
      h(
        'div',
        { class: 'panel' },
        h('h3', { class: 'panel-title', text: 'What this costs' }),
        stat('Fit-out', money(selected.setupCost)),
        stat('Equipment', money(selected.equipmentCost)),
        stat('Total up front', money(total), company.cash >= total ? 'good' : 'bad'),
        stat('Rent from here on', monthlyRent > 0 ? `${money(monthlyRent)}/mo` : 'Owned — no rent'),
        stat('Wages once staffed', `about ${money(staffCost)}/mo`),
        stat('Cash after opening', money(company.cash - total), company.cash - total > 5000 ? undefined : 'bad'),
      ),
    );

    detail.appendChild(
      h(
        'div',
        { class: 'panel' },
        h('h3', { class: 'panel-title', text: 'Location fit' }),
        stat('District', def.name),
        stat('Demand for this category', fit, preference >= 1.2 ? 'good' : preference < 0.9 ? 'bad' : undefined),
        stat('Foot traffic here', `${count(building.footTraffic)}/day`),
        stat('Average income', `${money(def.averageIncome)}/yr`),
        stat('Space', `${building.size} m² (needs ${selected.minSize} m²)`),
        stat('Storage', `${count(building.storageCapacity)} units`),
      ),
    );

    const sells =
      selected.productIds.length > 0
        ? selected.productIds.map((id) => product(id)?.name ?? id).join(', ')
        : 'No stock — this is a service business.';
    detail.appendChild(
      h(
        'div',
        { class: 'panel' },
        h('h3', { class: 'panel-title', text: 'How it runs' }),
        h('p', { class: 'tiny muted', text: `Sells: ${sells}` }),
        h('p', {
          class: 'tiny muted',
          text: `Roles you can hire: ${selected.roles.map((r) => role(r).name).join(', ')}.`,
        }),
        h('p', {
          class: 'tiny muted',
          text: `Opens ${selected.defaultOpenFrom}:00–${selected.defaultOpenTo}:00. One member of staff serves about ${selected.customersPerStaffHour} customers an hour.`,
        }),
      ),
    );
  };

  body.appendChild(h('label', { class: 'field' }, h('span', { text: 'Business name' }), nameInput));
  body.appendChild(h('div', { class: 'grid cols-2' }, list, detail));
  renderList();
  renderDetail();

  const confirm = h(
    'button',
    {
      class: 'btn primary',
      on: {
        click: () => {
          const result = foundBusiness(state, selected.id, building.id, nameInput.value);
          toast(result.message, result.ok ? 'good' : 'bad');
          if (!result.ok) return;
          close();
          if (result.businessId) ctx.go('businesses', { business: result.businessId });
          else ctx.refresh();
        },
      },
    },
    'Create business',
  );
  footer.appendChild(h('button', { class: 'btn ghost', on: { click: close } }, 'Cancel'));
  footer.appendChild(confirm);
}
