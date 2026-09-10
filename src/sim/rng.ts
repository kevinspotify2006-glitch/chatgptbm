/**
 * Deterministic PRNG (mulberry32). The city is generated from a fixed seed so
 * its layout is identical in every playthrough, while gameplay randomness uses
 * a separate generator seeded per save.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  /** Picks `count` distinct items, or fewer if the list is short. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Normal-ish value via the mean of three samples; keeps outliers rare. */
  around(centre: number, spread: number): number {
    const roll = (this.next() + this.next() + this.next()) / 3;
    return centre + (roll - 0.5) * 2 * spread;
  }
}

/** Fixed seed for the city layout — the map must be the same for everyone. */
export const CITY_SEED = 0x4e6f7274;

/** Gameplay randomness; reseeded when a new game starts. */
export let gameRng = new Rng(Date.now() >>> 0);

export function reseedGameRng(seed: number): void {
  gameRng = new Rng(seed);
}
