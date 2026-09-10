import type { MarketingChannelDef } from '../sim/types';

/**
 * Channels differ in who they reach, not just in how much they cost. Targeting
 * a student district with billboards wastes money; targeting it with social
 * media does not.
 */
export const MARKETING_CHANNELS: MarketingChannelDef[] = [
  {
    id: 'flyers',
    name: 'Flyers',
    dailyCost: 45,
    reach: 0.06,
    conversion: 0.35,
    targets: ['adult', 'senior'],
    minimumDays: 3,
    description: 'Cheap, local and unglamorous. Works surprisingly well in residential areas.',
  },
  {
    id: 'local-ads',
    name: 'Local advertising',
    dailyCost: 120,
    reach: 0.14,
    conversion: 0.4,
    targets: ['adult', 'senior'],
    minimumDays: 7,
    description: 'Local press and neighbourhood boards. Slow, steady awareness.',
  },
  {
    id: 'social',
    name: 'Social media',
    dailyCost: 95,
    reach: 0.22,
    conversion: 0.5,
    targets: ['young', 'adult'],
    minimumDays: 5,
    description: 'Best reach per euro under 35. Almost invisible to older customers.',
  },
  {
    id: 'search',
    name: 'Search advertising',
    dailyCost: 160,
    reach: 0.12,
    conversion: 0.72,
    targets: ['young', 'adult', 'senior'],
    minimumDays: 5,
    description: 'Small reach, but it catches people who are already looking to buy.',
  },
  {
    id: 'influencer',
    name: 'Influencer campaign',
    dailyCost: 340,
    reach: 0.31,
    conversion: 0.44,
    targets: ['young'],
    minimumDays: 7,
    description: 'Large young audience. Expensive and hit-or-miss.',
  },
  {
    id: 'billboards',
    name: 'Billboards',
    dailyCost: 260,
    reach: 0.34,
    conversion: 0.22,
    targets: ['adult', 'senior'],
    minimumDays: 14,
    description: 'Blunt city-wide reach. Builds brand rather than sales.',
  },
  {
    id: 'radio',
    name: 'Radio',
    dailyCost: 180,
    reach: 0.26,
    conversion: 0.28,
    targets: ['adult', 'senior'],
    minimumDays: 10,
    description: 'Reaches commuters. Good for anything near a main road.',
  },
];

const byId = new Map(MARKETING_CHANNELS.map((channel) => [channel.id, channel]));

export function marketingChannel(id: string): MarketingChannelDef | undefined {
  return byId.get(id);
}
