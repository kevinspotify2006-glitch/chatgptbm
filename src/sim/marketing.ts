import type { GameState } from './state';
import { businessById, playerCompany } from './state';
import type { Campaign } from './types';
import { MARKETING_CHANNELS, marketingChannel } from '../data/marketing';
import { district } from '../data/districts';
import { post } from './finance';
import { pushAlert } from './alerts';
import { clamp, makeId, sum } from './util';

/**
 * Marketing campaigns.
 *
 * A channel's value depends on whether its audience matches the district: an
 * influencer campaign in a student district is excellent, the same campaign in
 * a retirement suburb is money on fire.
 */

export function audienceMatch(channelId: string, districtId: string): number {
  const channel = marketingChannel(channelId);
  if (!channel) return 0;
  const def = district(districtId as never);
  let match = 0;
  for (const target of channel.targets) match += def.ageMix[target];
  return clamp(match, 0.05, 1);
}

/** Expected awareness gain per day for a campaign, in percentage points. */
export function expectedDailyAwareness(state: GameState, channelId: string, businessId: string): number {
  const channel = marketingChannel(channelId);
  const business = businessById(state, businessId);
  if (!channel || !business) return 0;
  const building = state.buildings.find((b) => b.id === business.buildingId);
  if (!building) return 0;
  const match = audienceMatch(channelId, building.district);
  // Awareness saturates: the closer to fully known, the less each euro buys.
  const headroom = clamp(1 - business.awareness / 100, 0.05, 1);
  return channel.reach * channel.conversion * match * headroom * 100 * 0.42;
}

export function startCampaign(
  state: GameState,
  channelId: string,
  businessId: string,
  days: number,
): { ok: boolean; message: string } {
  const channel = marketingChannel(channelId);
  const business = businessById(state, businessId);
  if (!channel || !business) return { ok: false, message: 'Unknown campaign.' };
  if (business.companyId !== state.playerCompanyId) return { ok: false, message: 'That is not your business.' };
  const length = Math.max(channel.minimumDays, Math.round(days));
  const total = channel.dailyCost * length;
  const company = playerCompany(state);
  if (company.cash < total) {
    return { ok: false, message: `That campaign costs ${total.toLocaleString('en-GB')} euro in total.` };
  }
  if (state.campaigns.some((c) => c.businessId === businessId && c.channelId === channelId)) {
    return { ok: false, message: 'That campaign is already running for this business.' };
  }

  const campaign: Campaign = {
    id: makeId('camp'),
    companyId: company.id,
    businessId,
    channelId,
    daysLeft: length,
    dailyCost: channel.dailyCost,
  };
  state.campaigns.push(campaign);
  return { ok: true, message: `${channel.name} campaign booked for ${length} days.` };
}

export function stopCampaign(state: GameState, campaignId: string): void {
  state.campaigns = state.campaigns.filter((campaign) => campaign.id !== campaignId);
}

/** Charged and applied once a day. */
export function campaignsDaily(state: GameState): void {
  for (const campaign of [...state.campaigns]) {
    const business = businessById(state, campaign.businessId);
    const channel = marketingChannel(campaign.channelId);
    if (!business || !channel) {
      state.campaigns = state.campaigns.filter((c) => c.id !== campaign.id);
      continue;
    }
    const company = playerCompany(state);
    if (company.cash < campaign.dailyCost) {
      state.campaigns = state.campaigns.filter((c) => c.id !== campaign.id);
      pushAlert(
        state,
        'warning',
        'Campaign cancelled',
        `${channel.name} for ${business.name} stopped because there was not enough cash to pay for it.`,
        business.id,
      );
      continue;
    }

    post(state, company.id, 'marketing', `${channel.name} — ${business.name}`, -campaign.dailyCost, business.id);
    business.today.marketing += campaign.dailyCost;
    business.awareness = clamp(
      business.awareness + expectedDailyAwareness(state, campaign.channelId, business.id),
      0,
      100,
    );
    company.brandAwareness = clamp(company.brandAwareness + 0.05, 0, 100);

    campaign.daysLeft -= 1;
    if (campaign.daysLeft <= 0) {
      state.campaigns = state.campaigns.filter((c) => c.id !== campaign.id);
      pushAlert(
        state,
        'info',
        'Campaign finished',
        `${channel.name} for ${business.name} has ended. Awareness is now ${Math.round(business.awareness)}%.`,
        business.id,
      );
    }
  }
}

export function campaignSpendPerDay(state: GameState): number {
  return sum(state.campaigns, (campaign) => campaign.dailyCost);
}

export const CHANNELS = MARKETING_CHANNELS;
