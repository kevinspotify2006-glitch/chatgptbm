import type { SupplierDef } from '../sim/types';

/**
 * The cheapest supplier is deliberately not the best one: low price is paid for
 * with lead time, reliability and quality.
 */
export const SUPPLIERS: SupplierDef[] = [
  {
    id: 'northgate-wholesale',
    name: 'Northgate Wholesale',
    priceMultiplier: 1.0,
    reliability: 0.97,
    quality: 0.8,
    leadTimeHours: 12,
    minimumOrderValue: 200,
    categories: ['groceries', 'beverages', 'prepared', 'home'],
    volumeDiscount: 0.04,
    volumeThreshold: 15000,
    description: 'The default local wholesaler. Dependable, never cheap, never late.',
  },
  {
    id: 'harbour-imports',
    name: 'Harbour Imports',
    priceMultiplier: 0.86,
    reliability: 0.84,
    quality: 0.66,
    leadTimeHours: 52,
    minimumOrderValue: 1800,
    categories: ['groceries', 'beverages', 'apparel', 'home', 'electronics', 'sports', 'pet'],
    volumeDiscount: 0.07,
    volumeThreshold: 25000,
    description: '14% below list, but container shipping means long, uncertain lead times.',
  },
  {
    id: 'meridian-supply',
    name: 'Meridian Supply Co.',
    priceMultiplier: 0.93,
    reliability: 0.92,
    quality: 0.74,
    leadTimeHours: 26,
    minimumOrderValue: 900,
    categories: ['groceries', 'beverages', 'apparel', 'home', 'sports', 'pet', 'beauty'],
    volumeDiscount: 0.05,
    volumeThreshold: 18000,
    description: 'A sensible middle option across most categories.',
  },
  {
    id: 'atelier-fresh',
    name: 'Atelier Fresh',
    priceMultiplier: 1.22,
    reliability: 0.98,
    quality: 0.95,
    leadTimeHours: 8,
    minimumOrderValue: 180,
    categories: ['groceries', 'prepared', 'beverages'],
    volumeDiscount: 0.02,
    volumeThreshold: 9000,
    description: 'Premium fresh produce delivered daily. Expensive, and worth it in the right shop.',
  },
  {
    id: 'voltron-tech',
    name: 'Voltron Tech Distribution',
    priceMultiplier: 0.97,
    reliability: 0.94,
    quality: 0.86,
    leadTimeHours: 30,
    minimumOrderValue: 4000,
    categories: ['electronics'],
    volumeDiscount: 0.06,
    volumeThreshold: 60000,
    description: 'Authorised electronics distributor. Large minimum orders.',
  },
  {
    id: 'lumen-brands',
    name: 'Lumen Brands',
    priceMultiplier: 1.09,
    reliability: 0.95,
    quality: 0.88,
    leadTimeHours: 20,
    minimumOrderValue: 1200,
    categories: ['apparel', 'beauty', 'sports'],
    volumeDiscount: 0.05,
    volumeThreshold: 22000,
    description: 'Branded goods that customers actually recognise. Priced accordingly.',
  },
];

const byId = new Map(SUPPLIERS.map((supplier) => [supplier.id, supplier]));

export function supplier(id: string): SupplierDef | undefined {
  return byId.get(id);
}
