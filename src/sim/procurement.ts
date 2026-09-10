import type { GameState } from './state';
import { absoluteHour, buildingById, businessById, playerCompany } from './state';
import type { Business, PurchaseOrder } from './types';
import { SUPPLIERS, supplier } from '../data/suppliers';
import { product } from '../data/products';
import { businessTypeOrThrow } from '../data/businessTypes';
import { post } from './finance';
import { storageFree } from './business';
import { eventFactors } from './demand';
import { pushAlert } from './alerts';
import { makeId, sum } from './util';
import { gameRng } from './rng';

/** Delivery charge per kilogram, before supplier differences. */
const DELIVERY_RATE = 0.18;
/** Flat call-out charge on any delivery. */
const DELIVERY_CALLOUT = 15;

export function suppliersFor(business: Business): typeof SUPPLIERS {
  const type = businessTypeOrThrow(business.typeId);
  const categories = new Set(
    type.productIds.map((id) => product(id)?.category).filter((c): c is NonNullable<typeof c> => Boolean(c)),
  );
  return SUPPLIERS.filter((s) => s.categories.some((category) => categories.has(category)));
}

/** What one unit costs from a given supplier right now. */
export function unitPrice(state: GameState, supplierId: string, productId: string, districtEventCost = 1): number {
  const def = supplier(supplierId);
  const productDef = product(productId);
  if (!def || !productDef) return 0;
  const spend = state.supplierSpend[supplierId] ?? 0;
  const discount = spend >= def.volumeThreshold ? def.volumeDiscount : 0;
  return Number(
    (productDef.wholesalePrice * def.priceMultiplier * (1 - discount) * state.economy.inflation * districtEventCost).toFixed(2),
  );
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export interface OrderQuote {
  lines: { productId: string; quantity: number; unitPrice: number }[];
  units: number;
  volume: number;
  goodsCost: number;
  deliveryCost: number;
  total: number;
  leadTimeHours: number;
  problems: string[];
}

export function quoteOrder(
  state: GameState,
  supplierId: string,
  businessId: string,
  requested: OrderLineInput[],
): OrderQuote {
  const problems: string[] = [];
  const def = supplier(supplierId);
  const business = businessById(state, businessId);
  const building = business ? buildingById(state, business.buildingId) : undefined;
  const lines: OrderQuote['lines'] = [];
  let units = 0;
  let volume = 0;
  let weight = 0;
  let goodsCost = 0;

  if (!def) problems.push('Unknown supplier.');
  if (!business || !building) problems.push('Unknown business.');

  if (def && business && building) {
    const costFactor = eventFactors(state, building.district).supplyCost;
    const type = businessTypeOrThrow(business.typeId);

    for (const input of requested) {
      const quantity = Math.floor(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const productDef = product(input.productId);
      if (!productDef) continue;
      if (!type.productIds.includes(input.productId)) {
        problems.push(`${business.name} does not sell ${productDef.name}.`);
        continue;
      }
      if (!def.categories.includes(productDef.category)) {
        problems.push(`${def.name} does not carry ${productDef.name}.`);
        continue;
      }
      const price = unitPrice(state, supplierId, input.productId, costFactor);
      lines.push({ productId: input.productId, quantity, unitPrice: price });
      units += quantity;
      volume += quantity * productDef.volume;
      weight += quantity * productDef.weight;
      goodsCost += quantity * price;
    }

    if (units === 0) problems.push('Nothing selected to order.');
    if (goodsCost > 0 && goodsCost < def.minimumOrderValue) {
      problems.push(`${def.name} has a minimum order of €${def.minimumOrderValue.toLocaleString('en-GB')}.`);
    }

    const incomingVolume = sum(
      state.orders.filter((o) => o.businessId === businessId && o.status !== 'delivered'),
      (order) =>
        sum(order.lines, (line) => (product(line.productId)?.volume ?? 1) * line.quantity),
    );
    const room = storageFree(state, business) - incomingVolume;
    if (volume > room) {
      problems.push(
        `Storage is too small: ${Math.round(volume)} units of space needed, ${Math.max(0, Math.round(room))} free.`,
      );
    }
  }

  const deliveryCost =
    units > 0
      ? Number((DELIVERY_CALLOUT + weight * DELIVERY_RATE * (def ? 2 - def.reliability : 1)).toFixed(2))
      : 0;
  const total = Number((goodsCost + deliveryCost).toFixed(2));
  if (total > playerCompany(state).cash) problems.push('Not enough cash for this order.');

  return {
    lines,
    units,
    volume: Number(volume.toFixed(1)),
    goodsCost: Number(goodsCost.toFixed(2)),
    deliveryCost,
    total,
    leadTimeHours: def?.leadTimeHours ?? 0,
    problems,
  };
}

export function placeOrder(
  state: GameState,
  supplierId: string,
  businessId: string,
  requested: OrderLineInput[],
): { ok: boolean; message: string } {
  const quote = quoteOrder(state, supplierId, businessId, requested);
  if (quote.problems.length > 0) return { ok: false, message: quote.problems[0] };
  const def = supplier(supplierId);
  const business = businessById(state, businessId);
  if (!def || !business) return { ok: false, message: 'Order could not be placed.' };

  const now = absoluteHour(state);
  const order: PurchaseOrder = {
    id: makeId('po'),
    supplierId,
    businessId,
    lines: quote.lines,
    goodsCost: quote.goodsCost,
    deliveryCost: quote.deliveryCost,
    total: quote.total,
    placedOnTick: now,
    arrivesOnTick: now + def.leadTimeHours,
    status: 'transit',
  };
  state.orders.push(order);
  for (const line of order.lines) {
    business.incoming[line.productId] = (business.incoming[line.productId] ?? 0) + line.quantity;
  }
  state.supplierSpend[supplierId] = (state.supplierSpend[supplierId] ?? 0) + quote.total;

  // Buying stock converts cash into inventory: it moves money but it is not a
  // cost of trading until the goods are sold.
  post(state, business.companyId, 'stock', `Stock purchase — ${def.name}`, -quote.goodsCost, businessId);
  if (quote.deliveryCost > 0) {
    post(state, business.companyId, 'logistics', `Delivery — ${def.name}`, -quote.deliveryCost, businessId);
    business.today.otherCosts += quote.deliveryCost;
  }
  return {
    ok: true,
    message: `${quote.units} units ordered from ${def.name}, arriving in about ${def.leadTimeHours} hours.`,
  };
}

/** Advances every open order. Runs once per simulated hour. */
export function processOrders(state: GameState): void {
  const now = absoluteHour(state);
  for (const order of state.orders) {
    if (order.status === 'delivered' || now < order.arrivesOnTick) continue;
    const def = supplier(order.supplierId);
    const business = businessById(state, order.businessId);
    if (!def || !business) {
      order.status = 'delivered';
      continue;
    }

    if (order.status === 'transit' && !gameRng.chance(def.reliability)) {
      order.status = 'delayed';
      order.arrivesOnTick = now + gameRng.int(6, 26);
      pushAlert(
        state,
        'warning',
        `${def.name} delivery delayed`,
        `The order for ${business.name} is late. New estimate: ${order.arrivesOnTick - now} hours.`,
        business.id,
      );
      continue;
    }

    let received = 0;
    let rejected = 0;
    let credit = 0;
    for (const line of order.lines) {
      const productDef = product(line.productId);
      if (!productDef) continue;
      const room = Math.floor(storageFree(state, business) / Math.max(0.01, productDef.volume));
      const accepted = Math.max(0, Math.min(line.quantity, room));

      if (accepted > 0) {
        // Weighted average cost, so cost of goods stays honest after a price change.
        const current = business.stock[line.productId] ?? 0;
        const currentCost = business.costBasis[line.productId] ?? line.unitPrice;
        const total = current + accepted;
        business.costBasis[line.productId] =
          total > 0 ? (current * currentCost + accepted * line.unitPrice) / total : line.unitPrice;
        business.stock[line.productId] = total;
        received += accepted;
      }
      const short = line.quantity - accepted;
      rejected += short;
      // What does not fit is credited rather than silently lost.
      credit += short * line.unitPrice;
      business.incoming[line.productId] = Math.max(0, (business.incoming[line.productId] ?? 0) - line.quantity);
    }

    if (credit > 0.01) {
      post(state, business.companyId, 'stock', `Credit note — ${def.name}`, credit, business.id);
    }

    order.status = 'delivered';
    pushAlert(
      state,
      'info',
      `Delivery received at ${business.name}`,
      rejected > 0
        ? `${received} units stored, ${rejected} did not fit and were credited. Consider a bigger unit.`
        : `${received} units are on the shelves.`,
      business.id,
    );
  }

  // Keep the order list bounded.
  const delivered = state.orders.filter((o) => o.status === 'delivered');
  if (delivered.length > 40) {
    const keep = new Set(delivered.slice(-40).map((o) => o.id));
    state.orders = state.orders.filter((o) => o.status !== 'delivered' || keep.has(o.id));
  }
}

/** Picks the cheapest supplier that carries a product. */
export function bestSupplierFor(state: GameState, productId: string): string | null {
  const productDef = product(productId);
  if (!productDef) return null;
  const options = SUPPLIERS.filter((s) => s.categories.includes(productDef.category));
  if (options.length === 0) return null;
  let best = options[0];
  let bestPrice = unitPrice(state, best.id, productId);
  for (const option of options.slice(1)) {
    const price = unitPrice(state, option.id, productId);
    if (price < bestPrice) {
      best = option;
      bestPrice = price;
    }
  }
  return best.id;
}

/**
 * Turns a wish list into an order this supplier will actually accept.
 *
 * Constraints pull in opposite directions: a minimum order value forces the
 * order up, while storage space and cash force it down. Scaling the whole
 * basket by one factor satisfies both where a solution exists, and returns an
 * empty list where none does — which is how the caller knows to try another
 * supplier rather than placing an order that will be rejected.
 */
export function planOrder(
  state: GameState,
  business: Business,
  supplierId: string,
  wishlist: OrderLineInput[],
): OrderLineInput[] {
  const def = supplier(supplierId);
  if (!def) return [];
  const lines = wishlist.filter((line) => {
    const productDef = product(line.productId);
    return productDef !== undefined && def.categories.includes(productDef.category) && line.quantity > 0;
  });
  if (lines.length === 0) return [];

  const goods = sum(lines, (line) => line.quantity * unitPrice(state, supplierId, line.productId));
  const volume = sum(lines, (line) => line.quantity * (product(line.productId)?.volume ?? 1));
  if (goods <= 0 || volume <= 0) return [];

  const incomingVolume = sum(
    state.orders.filter((o) => o.businessId === business.id && o.status !== 'delivered'),
    (order) => sum(order.lines, (line) => (product(line.productId)?.volume ?? 1) * line.quantity),
  );
  const room = storageFree(state, business) - incomingVolume;
  if (room <= 0) return [];

  // Cost of the basket at scale 1, including delivery.
  const weight = sum(lines, (line) => line.quantity * (product(line.productId)?.weight ?? 0.5));
  const costAtOne = goods + DELIVERY_CALLOUT + weight * DELIVERY_RATE * (2 - def.reliability);
  const cash = playerCompany(state).cash;
  const maxByCash = (cash * 0.85) / costAtOne;
  const maxByRoom = room / volume;
  const maxScale = Math.min(maxByCash, maxByRoom);
  // A minimum order value forces the basket up to at least this scale.
  const minScale = def.minimumOrderValue > 0 ? (def.minimumOrderValue * 1.04) / goods : 0;
  if (minScale > maxScale) return [];

  const scale = Math.min(Math.max(1, minScale), maxScale);
  const scaled = lines
    .map((line) => ({ productId: line.productId, quantity: Math.max(1, Math.floor(line.quantity * scale)) }))
    .filter((line) => line.quantity > 0);

  // Trust the quote, not the arithmetic above.
  return quoteOrder(state, supplierId, business.id, scaled).problems.length === 0 ? scaled : [];
}

/** Suppliers that could serve this basket, cheapest first. */
export function rankedSuppliers(business: Business): string[] {
  const type = businessTypeOrThrow(business.typeId);
  const categories = new Set(
    type.productIds.map((id) => product(id)?.category).filter((c): c is NonNullable<typeof c> => Boolean(c)),
  );
  return SUPPLIERS.filter((def) => def.categories.some((category) => categories.has(category)))
    .slice()
    .sort((a, b) => a.priceMultiplier - b.priceMultiplier)
    .map((def) => def.id);
}

/** Automatic reordering, for businesses where the player switched it on. */
export function runAutoRestock(state: GameState): void {
  for (const business of state.businesses) {
    if (business.companyId !== state.playerCompanyId || !business.autoRestock) continue;
    const type = businessTypeOrThrow(business.typeId);

    const wishlist: OrderLineInput[] = [];
    for (const productId of type.productIds) {
      const onHand = (business.stock[productId] ?? 0) + (business.incoming[productId] ?? 0);
      const reorder = business.reorderPoints[productId] ?? 0;
      if (onHand > reorder) continue;
      // Order in larger, less frequent batches: every delivery carries a
      // call-out charge, so topping up daily is an expensive habit.
      wishlist.push({ productId, quantity: Math.max(Math.ceil(reorder * 7), 60) });
    }
    if (wishlist.length === 0) continue;

    for (const supplierId of rankedSuppliers(business)) {
      const lines = planOrder(state, business, supplierId, wishlist);
      if (lines.length === 0) continue;
      const result = placeOrder(state, supplierId, business.id, lines);
      if (result.ok) break;
    }
  }
}

/**
 * Suggested order quantities for a whole basket.
 *
 * Suggesting each product independently overfills the stock room, so the
 * quantities are scaled together until the order actually fits — a suggestion
 * the player cannot place is worse than no suggestion at all. Passing a
 * supplier also satisfies that supplier's minimum order value.
 */
export function suggestOrder(
  state: GameState,
  business: Business,
  supplierId?: string,
  productIds?: string[],
): OrderLineInput[] {
  const type = businessTypeOrThrow(business.typeId);
  const ids = productIds ?? type.productIds;
  const appealTotal = sum(
    type.productIds.map((id) => product(id)?.appeal ?? 0),
    (value) => value,
  );
  if (appealTotal <= 0) return [];

  // Target roughly a week of expected sales per product.
  const wishlist: OrderLineInput[] = [];
  for (const productId of ids) {
    const def = product(productId);
    if (!def) continue;
    const share = def.appeal / appealTotal;
    const onHand = (business.stock[productId] ?? 0) + (business.incoming[productId] ?? 0);
    const perDay = type.baseCustomers * share * def.unitsPerBasket;
    const quantity = Math.max(0, Math.ceil(perDay * 7) - onHand);
    if (quantity > 0) wishlist.push({ productId, quantity });
  }
  if (wishlist.length === 0) return [];

  if (supplierId) {
    const planned = planOrder(state, business, supplierId, wishlist);
    if (planned.length > 0) return planned;
  }

  // No supplier given (or none workable): just make it fit the stock room.
  const budget = storageFree(state, business) * 0.9;
  const needed = sum(wishlist, (line) => line.quantity * (product(line.productId)?.volume ?? 1));
  const scale = needed > budget && needed > 0 ? budget / needed : 1;
  return wishlist
    .map((line) => ({ productId: line.productId, quantity: Math.floor(line.quantity * scale) }))
    .filter((line) => line.quantity > 0);
}

/** Suggested quantity for a single product, kept for one-off top-ups. */
export function suggestedQuantity(state: GameState, business: Business, productId: string): number {
  return suggestOrder(state, business, undefined, [productId])[0]?.quantity ?? 0;
}
