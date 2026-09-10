import type { ProductCategory, ProductDef } from '../sim/types';

function p(
  id: string,
  name: string,
  category: ProductCategory,
  wholesalePrice: number,
  marketPrice: number,
  quality: number,
  appeal: number,
  unitsPerBasket: number,
  weight: number,
  volume: number,
  shelfLife: number,
): ProductDef {
  return { id, name, category, wholesalePrice, marketPrice, quality, appeal, unitsPerBasket, weight, volume, shelfLife };
}

/**
 * Product catalogue. Adding a row here is enough for the product to appear in
 * supplier ordering, inventory, pricing and the demand model.
 */
export const PRODUCTS: ProductDef[] = [
  // groceries
  p('bread', 'Bread', 'groceries', 0.82, 2.4, 0.55, 0.72, 1.4, 0.6, 1.2, 3),
  p('milk', 'Milk', 'groceries', 0.94, 2.15, 0.6, 0.68, 1.6, 1.05, 1.1, 7),
  p('produce', 'Fresh produce', 'groceries', 1.35, 3.5, 0.62, 0.66, 2.2, 0.8, 1.4, 5),
  p('snacks', 'Snacks', 'groceries', 0.68, 2.1, 0.42, 0.78, 2.1, 0.2, 0.6, 90),
  p('readymeal', 'Ready meals', 'groceries', 2.4, 6.2, 0.5, 0.63, 0.55, 0.45, 0.9, 6),
  p('household', 'Household goods', 'home', 1.9, 5.1, 0.55, 0.4, 0.6, 0.9, 1.6, 0),

  // beverages
  p('coffeebeans', 'Coffee beans', 'beverages', 6.4, 15.5, 0.7, 0.6, 0.7, 1.0, 1.0, 180),
  p('softdrinks', 'Soft drinks', 'beverages', 0.55, 1.9, 0.4, 0.8, 2.4, 0.5, 0.8, 240),
  p('energydrinks', 'Energy drinks', 'beverages', 0.85, 2.6, 0.4, 0.66, 1.8, 0.5, 0.7, 240),
  p('juice', 'Fresh juice', 'beverages', 1.25, 3.6, 0.68, 0.58, 1.1, 0.6, 0.8, 5),

  // prepared food
  p('coffeecup', 'Coffee (cup)', 'prepared', 0.42, 3.1, 0.62, 0.92, 1.3, 0.3, 0.3, 0),
  p('pastry', 'Pastries', 'prepared', 0.75, 2.9, 0.6, 0.8, 1.6, 0.15, 0.4, 2),
  p('sandwich', 'Sandwiches', 'prepared', 1.65, 5.4, 0.6, 0.86, 1.2, 0.3, 0.5, 2),
  p('burger', 'Burger meal', 'prepared', 2.7, 9.5, 0.5, 0.83, 1.1, 0.5, 0.7, 1),
  p('dinner', 'Restaurant dinner', 'prepared', 7.2, 27.5, 0.78, 0.6, 0.85, 0.8, 1.0, 1),
  p('pizza', 'Pizza', 'prepared', 2.3, 11.5, 0.58, 0.78, 1.1, 0.6, 1.0, 1),

  // electronics
  p('phone', 'Smartphone', 'electronics', 285, 549, 0.82, 0.7, 0.03, 0.4, 0.8, 0),
  p('laptop', 'Laptop', 'electronics', 520, 949, 0.85, 0.55, 0.012, 2.1, 2.4, 0),
  p('headphones', 'Headphones', 'electronics', 34, 89, 0.65, 0.68, 0.09, 0.35, 0.6, 0),
  p('accessories', 'Tech accessories', 'electronics', 4.2, 16.5, 0.45, 0.72, 0.55, 0.2, 0.4, 0),

  // apparel
  p('tshirt', 'T-shirts', 'apparel', 6.2, 19.5, 0.5, 0.66, 0.45, 0.2, 0.5, 0),
  p('jeans', 'Jeans', 'apparel', 18, 59, 0.62, 0.6, 0.22, 0.6, 1.1, 0),
  p('jacket', 'Jackets', 'apparel', 42, 139, 0.72, 0.52, 0.1, 1.1, 2.0, 0),
  p('sneakers', 'Sneakers', 'apparel', 31, 99, 0.68, 0.74, 0.18, 0.9, 1.6, 0),

  // home, sports, pet, beauty
  p('furniture', 'Small furniture', 'home', 78, 219, 0.66, 0.46, 0.07, 14, 9, 0),
  p('decor', 'Home décor', 'home', 8.5, 27, 0.55, 0.58, 0.5, 1.2, 1.8, 0),
  p('fitness', 'Fitness gear', 'sports', 21, 65, 0.6, 0.6, 0.28, 2.4, 2.6, 0),
  p('bicycle', 'Bicycles', 'sports', 210, 549, 0.7, 0.5, 0.035, 13, 12, 0),
  p('petfood', 'Pet food', 'pet', 3.6, 9.8, 0.55, 0.62, 1.1, 3.2, 2.2, 120),
  p('petsupplies', 'Pet supplies', 'pet', 5.4, 17.5, 0.55, 0.55, 0.4, 0.8, 1.4, 0),
  p('cosmetics', 'Cosmetics', 'beauty', 7.8, 28.5, 0.68, 0.7, 0.5, 0.2, 0.4, 365),
  p('haircare', 'Hair care', 'beauty', 4.1, 14.2, 0.6, 0.6, 0.45, 0.5, 0.7, 365),
];

const byId = new Map(PRODUCTS.map((product) => [product.id, product]));

export function product(id: string): ProductDef | undefined {
  return byId.get(id);
}

export function productOrThrow(id: string): ProductDef {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown product: ${id}`);
  return found;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  groceries: 'Groceries',
  beverages: 'Beverages',
  prepared: 'Prepared food',
  electronics: 'Electronics',
  apparel: 'Apparel',
  home: 'Home',
  sports: 'Sports',
  pet: 'Pet',
  beauty: 'Beauty',
};
