import type { Building, BusinessCategory, DistrictDef } from './types';
import { DISTRICTS } from '../data/districts';
import { CITY_SEED, Rng } from './rng';
import { clamp } from './util';

/**
 * The city layout is generated once from a fixed seed, so every player gets the
 * same Northgate — the layout is static, only its economic state is dynamic.
 * Generating it keeps 200+ buildings out of the source tree while remaining
 * completely deterministic.
 */

const STREET_NAMES = [
  'Marlow', 'Kestrel', 'Ashford', 'Bellamy', 'Cormorant', 'Dunmore', 'Ellery',
  'Fenwick', 'Garrick', 'Halstead', 'Ivory', 'Jasper', 'Kingsley', 'Langmere',
  'Merrick', 'Northgate', 'Orwell', 'Pemberton', 'Quarry', 'Ravensworth',
  'Sable', 'Thornbury', 'Underhill', 'Vandermeer', 'Whitlock', 'Yarrow',
];

const STREET_SUFFIX = ['Street', 'Avenue', 'Road', 'Lane', 'Way', 'Square', 'Terrace'];

/** How many plots a district gets, before rounding. */
function plotCount(def: DistrictDef): number {
  const area = def.w * def.h;
  return Math.round(clamp(area * 900 * (0.6 + def.commercialActivity * 0.7), 8, 26));
}

function pickSuitable(rng: Rng, def: DistrictDef, size: number): BusinessCategory[] {
  const categories: BusinessCategory[] = [];
  const preference = def.preferences;
  const order: BusinessCategory[] = ['retail', 'food', 'services', 'specialized'];
  for (const category of order) {
    const weight = preference[category] ?? 1;
    // Very large units rarely suit food; very small ones rarely suit services.
    const sizeFit =
      category === 'food' ? clamp(1.4 - size / 400, 0.2, 1.2)
      : category === 'services' ? clamp(size / 160, 0.3, 1.3)
      : 1;
    if (rng.chance(clamp(weight * 0.55 * sizeFit, 0.08, 0.95))) categories.push(category);
  }
  if (categories.length === 0) categories.push(order[rng.int(0, order.length - 1)]);
  return categories;
}

export function generateCity(): Building[] {
  const rng = new Rng(CITY_SEED);
  const buildings: Building[] = [];

  for (const def of DISTRICTS) {
    const count = plotCount(def);
    // Lay the plots out on a loose grid inside the district so the map reads as
    // blocks and streets rather than scattered dots.
    const columns = Math.max(2, Math.round(Math.sqrt(count * (def.w / def.h))));
    const rows = Math.max(2, Math.ceil(count / columns));
    const padding = 0.006;
    const cellW = (def.w - padding * 2) / columns;
    const cellH = (def.h - padding * 2) / rows;

    const streetName = `${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIX)}`;
    const altStreet = `${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIX)}`;

    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      if (row >= rows) break;

      const gap = 0.0016;
      const w = cellW - gap * 2;
      const h = cellH - gap * 2;
      const x = def.x + padding + column * cellW + gap;
      const y = def.y + padding + row * cellH + gap;

      // Corner plots and plots on the district edge see more passers-by.
      const edge = column === 0 || column === columns - 1 || row === 0 || row === rows - 1;
      const corner = (column === 0 || column === columns - 1) && (row === 0 || row === rows - 1);
      const trafficFactor = corner ? 1.45 : edge ? 1.15 : 0.72;

      const size = Math.round(
        clamp(rng.around(70 + def.commercialActivity * 110, 90) * (edge ? 1.1 : 1), 40, 620),
      );
      const floors = size > 280 ? rng.int(1, 2) : rng.int(1, 3);
      const condition = Math.round(clamp(rng.around(72, 22), 25, 100));
      // Poor condition drags both rent and price down.
      const conditionFactor = 0.7 + (condition / 100) * 0.45;

      const rent = Math.round((size * def.rentPerSqm * conditionFactor * (edge ? 1.12 : 0.94)) / 5) * 5;
      const price = Math.round((size * def.pricePerSqm * conditionFactor * (edge ? 1.1 : 0.95)) / 500) * 500;
      const footTraffic = Math.round(def.footTraffic * trafficFactor * rng.range(0.75, 1.25));

      const number = 2 * (index + 1) + rng.int(0, 1);
      const address = `${number} ${index % 2 === 0 ? streetName : altStreet}`;

      buildings.push({
        id: `${def.id}-${index + 1}`,
        address,
        district: def.id,
        x, y, w, h,
        size,
        floors,
        rent,
        price,
        value: price,
        customerCapacity: Math.max(4, Math.round(size / 4.5)),
        storageCapacity: Math.max(120, Math.round(size * 3.6)),
        parking: def.id === 'suburbs' || def.id === 'warehouse' || def.id === 'industrial'
          ? rng.int(4, 40)
          : rng.int(0, 8),
        condition,
        footTraffic,
        suitableFor: pickSuitable(rng, def, size),
        status: 'available',
        occupantCompanyId: null,
        businessId: null,
        renovationEndsOnDay: null,
      });
    }
  }

  return buildings;
}

/** Straight-line distance between two buildings, in kilometres. */
export const CITY_SPAN_KM = 18;

export function distanceKm(a: Building, b: Building): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  return Math.max(0.3, Math.hypot(dx, dy) * CITY_SPAN_KM);
}
