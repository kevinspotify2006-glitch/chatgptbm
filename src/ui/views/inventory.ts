import type { Ctx, View } from '../app';
import type { Business } from '../../sim/types';
import { businessById, playerBusinesses } from '../../sim/state';
import { businessTypeOrThrow } from '../../data/businessTypes';
import { CATEGORY_LABELS, product } from '../../data/products';
import { SUPPLIERS, supplier } from '../../data/suppliers';
import { storageFree, storageUsed, setReorderPoint } from '../../sim/business';
import { placeOrder, quoteOrder, suggestOrder, unitPrice } from '../../sim/procurement';
import { absoluteHour } from '../../sim/state';
import { count, hoursLabel, money, moneyCents, pct } from '../../sim/format';
import { bar, button, empty, h, numberInput, section, select, stat, table, toast } from '../dom';

export function inventoryView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const businesses = playerBusinesses(state);

  el.appendChild(
    h('div', { class: 'view-head' }, h('h1', { text: 'Inventory' }), h('p', { text: 'Stock, reorder points and purchasing' })),
  );

  if (businesses.length === 0) {
    el.appendChild(section('No businesses', empty('Create a business before ordering stock.')));
    return { el };
  }

  const selectedId = ctx.params.business ?? businesses[0].id;
  const business = businessById(state, selectedId) ?? businesses[0];
  const type = businessTypeOrThrow(business.typeId);
  const building = state.buildings.find((b) => b.id === business.buildingId);

  el.appendChild(
    section(
      'Location',
      select(
        businesses.map((b) => ({ value: b.id, label: b.name })),
        business.id,
        (value) => ctx.go('inventory', { business: value }),
      ),
      building
        ? h(
            'div',
            { style: 'margin-top:12px' },
            stat(
              'Storage used',
              `${Math.round(storageUsed(business))} / ${count(building.storageCapacity)} units`,
              storageUsed(business) > building.storageCapacity * 0.9 ? 'bad' : undefined,
            ),
            bar(storageUsed(business) / Math.max(1, building.storageCapacity), storageUsed(business) > building.storageCapacity * 0.9 ? 'bad' : ''),
          )
        : null,
      h(
        'label',
        { class: 'switch' },
        h('input', {
          type: 'checkbox',
          checked: business.autoRestock,
          on: {
            change: (event: Event) => {
              business.autoRestock = (event.target as HTMLInputElement).checked;
              toast(business.autoRestock ? 'Automatic reordering is on.' : 'Automatic reordering is off.');
            },
          },
        }),
        h(
          'span',
          {},
          h('span', { text: 'Reorder automatically' }),
          h('span', {
            class: 'tiny muted',
            style: 'display:block',
            text: 'Each night, anything at or below its reorder point is topped up from the cheapest supplier that carries it.',
          }),
        ),
      ),
    ),
  );

  if (type.productIds.length === 0) {
    el.appendChild(
      section(
        'No stock needed',
        empty(`${type.name} is a service business. It has no inventory — your costs are staff, rent and marketing.`),
      ),
    );
    return { el };
  }

  // --------------------------------------------------------- stock table
  el.appendChild(
    section(
      'Stock levels',
      table(
        ['Product', 'Category', 'In stock', 'On order', 'Reorder at', 'Unit cost', 'Your price', 'Value'],
        type.productIds.map((productId) => {
          const def = product(productId);
          if (!def) return [];
          const units = business.stock[productId] ?? 0;
          const incoming = business.incoming[productId] ?? 0;
          const cost = business.costBasis[productId] ?? def.wholesalePrice;
          const low = units <= (business.reorderPoints[productId] ?? 0);
          return [
            h(
              'div',
              {},
              h('div', { text: def.name }),
              def.shelfLife > 0 ? h('div', { class: 'tiny muted', text: `Perishable — ${def.shelfLife} days` }) : null,
            ),
            CATEGORY_LABELS[def.category],
            h('span', { class: low ? 'bad' : '', text: count(units) }),
            incoming > 0 ? h('span', { class: 'tag accent', text: count(incoming) }) : '—',
            numberInput(
              business.reorderPoints[productId] ?? 0,
              (value) => {
                setReorderPoint(state, business.id, productId, value);
              },
              { min: '0', step: '5', style: 'max-width:90px' },
            ),
            moneyCents(cost),
            moneyCents(business.prices[productId] ?? def.marketPrice),
            money(units * cost),
          ];
        }),
      ),
    ),
  );

  // --------------------------------------------------------- order panel
  el.appendChild(orderPanel(ctx, business));

  // -------------------------------------------------------- open orders
  const orders = state.orders.filter((order) => order.businessId === business.id).slice().reverse();
  const now = absoluteHour(state);
  el.appendChild(
    section(
      'Orders',
      orders.length === 0
        ? empty('No orders yet.')
        : table(
            ['Supplier', 'Items', 'Value', 'Status', 'Arrives'],
            orders.slice(0, 14).map((order) => [
              supplier(order.supplierId)?.name ?? order.supplierId,
              order.lines.map((line) => `${line.quantity}× ${product(line.productId)?.name ?? line.productId}`).join(', '),
              money(order.total),
              h('span', {
                class: `tag ${order.status === 'delivered' ? 'good' : order.status === 'delayed' ? 'bad' : 'accent'}`,
                text: order.status,
              }),
              order.status === 'delivered' ? '—' : hoursLabel(order.arrivesOnTick - now),
            ]),
          ),
    ),
  );

  // ------------------------------------------------------ supplier table
  el.appendChild(
    section(
      'Suppliers',
      table(
        ['Supplier', 'Price', 'Lead time', 'Reliability', 'Quality', 'Minimum order', 'Carries'],
        SUPPLIERS.map((def) => {
          const spend = state.supplierSpend[def.id] ?? 0;
          const discounted = spend >= def.volumeThreshold;
          return [
            h(
              'div',
              {},
              h('div', { text: def.name }),
              h('div', { class: 'tiny muted', text: def.description }),
            ),
            h(
              'div',
              {},
              h('div', { text: pct(def.priceMultiplier * 100) }),
              discounted
                ? h('div', { class: 'tiny good', text: `−${Math.round(def.volumeDiscount * 100)}% volume discount` })
                : h('div', { class: 'tiny muted', text: `${money(def.volumeThreshold - spend)} to discount` }),
            ),
            hoursLabel(def.leadTimeHours),
            h('span', { class: def.reliability < 0.88 ? 'bad' : 'good', text: pct(def.reliability * 100) }),
            pct(def.quality * 100),
            money(def.minimumOrderValue),
            def.categories.map((category) => CATEGORY_LABELS[category]).join(', '),
          ];
        }),
      ),
      h('p', {
        class: 'tiny muted',
        text: 'A cheap supplier that misses a delivery costs more than an expensive one that never does — an empty shelf sells nothing.',
      }),
    ),
  );

  return { el };
}

function orderPanel(ctx: Ctx, business: Business): HTMLElement {
  const state = ctx.state;
  const type = businessTypeOrThrow(business.typeId);
  const available = SUPPLIERS.filter((def) =>
    type.productIds.some((id) => {
      const productDef = product(id);
      return productDef ? def.categories.includes(productDef.category) : false;
    }),
  );

  const panel = section('Place an order');
  if (available.length === 0) {
    panel.appendChild(empty('No supplier carries what this business sells.'));
    return panel;
  }

  let supplierId = available[0].id;
  const quantities: Record<string, number> = {};
  const linesHost = h('div', {});
  const summary = h('div', {});

  const refreshSummary = (): void => {
    const requested = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    const quote = quoteOrder(state, supplierId, business.id, requested);
    summary.innerHTML = '';
    summary.appendChild(
      h(
        'div',
        {},
        stat('Units', count(quote.units)),
        stat('Goods', money(quote.goodsCost)),
        stat('Delivery', money(quote.deliveryCost)),
        stat('Total', money(quote.total), quote.total > 0 ? undefined : 'muted'),
        stat('Arrives in', hoursLabel(quote.leadTimeHours)),
      ),
    );
    for (const problem of quote.problems) {
      summary.appendChild(h('p', { class: 'tiny bad', text: problem }));
    }
    summary.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        button(
          'Place order',
          () => {
            const result = placeOrder(state, supplierId, business.id, requested);
            toast(result.message, result.ok ? 'good' : 'bad');
            if (result.ok) ctx.refresh();
          },
          `btn primary${quote.problems.length > 0 ? ' disabled' : ''}`,
        ),
        button('Suggest quantities', () => {
          for (const productId of type.productIds) quantities[productId] = 0;
          for (const line of suggestOrder(state, business, supplierId)) quantities[line.productId] = line.quantity;
          renderLines();
          refreshSummary();
        }),
        button('Clear', () => {
          for (const productId of Object.keys(quantities)) quantities[productId] = 0;
          renderLines();
          refreshSummary();
        }, 'btn ghost'),
      ),
    );
    const orderButton = summary.querySelector('.btn.primary');
    if (orderButton instanceof HTMLButtonElement) orderButton.disabled = quote.problems.length > 0;
  };

  const renderLines = (): void => {
    linesHost.innerHTML = '';
    const def = supplier(supplierId);
    const rows = type.productIds
      .map((productId): (string | HTMLElement)[] | null => {
        const productDef = product(productId);
        if (!productDef || !def?.categories.includes(productDef.category)) return null;
        const price = unitPrice(state, supplierId, productId);
        const input = numberInput(
          quantities[productId] ?? 0,
          (value) => {
            quantities[productId] = Math.max(0, Math.floor(value));
            refreshSummary();
          },
          { min: '0', step: '10', style: 'max-width:110px' },
        );
        return [
          productDef.name,
          moneyCents(price),
          count(business.stock[productId] ?? 0),
          input,
          moneyCents(price * (quantities[productId] ?? 0)),
        ];
      })
      .filter((row): row is (string | HTMLElement)[] => row !== null);

    if (rows.length === 0) {
      linesHost.appendChild(empty(`${def?.name ?? 'This supplier'} does not carry anything this business sells.`));
      return;
    }
    linesHost.appendChild(table(['Product', 'Unit price', 'In stock', 'Order', 'Line total'], rows));
  };

  panel.appendChild(
    h(
      'label',
      { class: 'field' },
      h('span', { text: 'Supplier' }),
      select(
        available.map((def) => ({
          value: def.id,
          label: `${def.name} — ${pct(def.priceMultiplier * 100)} of list, ${hoursLabel(def.leadTimeHours)} lead time`,
        })),
        supplierId,
        (value) => {
          supplierId = value;
          renderLines();
          refreshSummary();
        },
      ),
    ),
  );
  panel.appendChild(linesHost);
  panel.appendChild(summary);
  panel.appendChild(
    h('p', {
      class: 'tiny muted',
      text: `Space left: ${Math.round(storageFree(state, business))} units. Anything that does not fit on arrival is credited back.`,
    }),
  );

  renderLines();
  refreshSummary();
  return panel;
}
