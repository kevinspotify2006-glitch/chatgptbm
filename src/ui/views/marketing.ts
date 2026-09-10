import type { Ctx, View } from '../app';
import { businessById, playerBusinesses, playerCompany } from '../../sim/state';
import { MARKETING_CHANNELS, marketingChannel } from '../../data/marketing';
import { district } from '../../data/districts';
import { audienceMatch, expectedDailyAwareness, startCampaign, stopCampaign } from '../../sim/marketing';
import { setMarketingBudget } from '../../sim/business';
import { money, pct } from '../../sim/format';
import { sum } from '../../sim/util';
import { bar, button, empty, h, numberInput, section, select, stat, table, toast } from '../dom';

export function marketingView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const company = playerCompany(state);
  const businesses = playerBusinesses(state);

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: 'Marketing' }),
      h('p', { text: `Brand awareness ${pct(company.brandAwareness)} across Northgate` }),
    ),
  );

  if (businesses.length === 0) {
    el.appendChild(section('No businesses', empty('There is nothing to advertise yet.')));
    return { el };
  }

  const selectedId = ctx.params.business ?? businesses[0].id;
  const business = businessById(state, selectedId) ?? businesses[0];
  const building = state.buildings.find((b) => b.id === business.buildingId);
  const districtDef = building ? district(building.district) : null;

  el.appendChild(
    section(
      'Business',
      select(
        businesses.map((b) => ({ value: b.id, label: b.name })),
        business.id,
        (value) => ctx.go('marketing', { business: value }),
      ),
      h(
        'div',
        { style: 'margin-top:12px' },
        stat('Awareness in the district', pct(business.awareness)),
        bar(business.awareness / 100, business.awareness > 55 ? 'good' : ''),
        stat('Reputation', `${Math.round(business.reputation)}/100`),
        stat('Reviews', `${business.reviewScore.toFixed(1)}★`),
      ),
      h(
        'label',
        { class: 'field', style: 'margin-top:12px' },
        h('span', { text: 'Baseline marketing spend per day (always-on)' }),
        numberInput(business.marketingBudget, (value) => {
          setMarketingBudget(state, business.id, value);
          ctx.refresh();
        }, { min: '0', step: '10' }),
      ),
      districtDef
        ? h('p', {
            class: 'tiny muted',
            text: `${districtDef.name}: ${Math.round(districtDef.ageMix.young * 100)}% under 30, ${Math.round(
              districtDef.ageMix.adult * 100,
            )}% 30–60, ${Math.round(districtDef.ageMix.senior * 100)}% over 60. Pick channels that reach those people.`,
          })
        : null,
    ),
  );

  // ------------------------------------------------------ live campaigns
  const running = state.campaigns.filter((campaign) => campaign.businessId === business.id);
  const runningPanel = section('Running campaigns');
  if (running.length === 0) {
    runningPanel.appendChild(empty('No campaigns are running for this business.'));
  } else {
    runningPanel.appendChild(
      table(
        ['Channel', 'Cost/day', 'Days left', 'Awareness/day', ''],
        running.map((campaign) => {
          const channel = marketingChannel(campaign.channelId);
          return [
            channel?.name ?? campaign.channelId,
            money(campaign.dailyCost),
            String(campaign.daysLeft),
            `+${expectedDailyAwareness(state, campaign.channelId, business.id).toFixed(1)}%`,
            button(
              'Stop',
              () => {
                stopCampaign(state, campaign.id);
                toast('Campaign stopped.');
                ctx.refresh();
              },
              'btn small danger',
            ),
          ];
        }),
      ),
    );
  }
  el.appendChild(runningPanel);

  // --------------------------------------------------------- book a channel
  const channelPanel = section('Available channels');
  channelPanel.appendChild(
    h('p', {
      class: 'tiny muted',
      text: 'Effectiveness depends on whether the channel reaches the people who live and work near this business. The percentage is how well it matches this district.',
    }),
  );

  for (const channel of MARKETING_CHANNELS) {
    const match = building ? audienceMatch(channel.id, building.district) : 0;
    const daily = expectedDailyAwareness(state, channel.id, business.id);
    const days = numberInput(channel.minimumDays, () => {}, {
      min: String(channel.minimumDays),
      max: '60',
      step: '1',
      style: 'max-width:100px',
    });
    channelPanel.appendChild(
      h(
        'div',
        { class: 'card', style: 'margin-top:8px' },
        h(
          'div',
          { class: 'card-head' },
          h(
            'div',
            {},
            h('div', { class: 'card-title', text: channel.name }),
            h('div', { class: 'card-sub', text: channel.description }),
          ),
          h('span', {
            class: `tag ${match > 0.6 ? 'good' : match < 0.35 ? 'bad' : ''}`,
            text: `${pct(match * 100)} match`,
          }),
        ),
        h(
          'div',
          { class: 'grid cols-3' },
          stat('Cost', `${money(channel.dailyCost)}/day`),
          stat('Reach', pct(channel.reach * 100)),
          stat('Awareness gain', `+${daily.toFixed(1)}%/day`, daily > 1.2 ? 'good' : daily < 0.35 ? 'bad' : undefined),
        ),
        h(
          'div',
          { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px' },
          h('label', { class: 'field', style: 'margin:0' }, h('span', { text: `Days (min ${channel.minimumDays})` }), days),
          button(
            'Book campaign',
            () => {
              const result = startCampaign(state, channel.id, business.id, Number(days.value));
              toast(result.message, result.ok ? 'good' : 'bad');
              if (result.ok) ctx.refresh();
            },
            'btn primary',
          ),
        ),
      ),
    );
  }
  el.appendChild(channelPanel);

  el.appendChild(
    section(
      'Total marketing spend',
      stat('Campaigns', `${money(sum(state.campaigns, (c) => c.dailyCost))}/day`),
      stat('Baseline budgets', `${money(sum(businesses, (b) => b.marketingBudget))}/day`),
      h('p', {
        class: 'tiny muted',
        text: 'Awareness decays by about 2.5% a day when you stop spending, so short bursts fade quickly.',
      }),
    ),
  );

  return { el };
}
