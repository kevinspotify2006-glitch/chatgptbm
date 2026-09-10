import type { Ctx, View } from '../app';
import type { LedgerCategory } from '../../sim/types';
import { playerBusinesses, playerCompany } from '../../sim/state';
import {
  LEDGER_LABELS,
  TAX_RATE,
  borrowingHeadroom,
  debtTotal,
  goodwillValue,
  inventoryValue,
  isRevenue,
  loanOffers,
  monthlyPayment,
  netWorth,
  propertyValue,
  repayLoan,
  takeLoan,
} from '../../sim/finance';
import { clockLabel, money, moneySigned, pct } from '../../sim/format';
import { sum } from '../../sim/util';
import { button, empty, h, numberInput, section, stat, table, toast } from '../dom';
import { lineChart } from '../chart';

export function financeView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const company = playerCompany(state);

  el.appendChild(
    h('div', { class: 'view-head' }, h('h1', { text: 'Finance' }), h('p', { text: 'Profit and loss, balance sheet, borrowing' })),
  );

  const periods: { label: string; days: number }[] = [
    { label: 'Yesterday', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
  ];

  el.appendChild(
    section(
      'Profit and loss',
      table(
        ['Period', 'Revenue', 'Costs', 'Profit', 'Margin'],
        periods.map((period) => {
          const slice = state.dayHistory.slice(-period.days);
          const revenue = sum(slice, (d) => d.revenue);
          const costs = sum(slice, (d) => d.costs);
          const profit = revenue - costs;
          return [
            period.label,
            money(revenue),
            money(costs),
            h('span', { class: profit >= 0 ? 'good' : 'bad', text: moneySigned(profit) }),
            revenue > 0 ? pct((profit / revenue) * 100, 1) : '—',
          ];
        }),
      ),
      state.dayHistory.length === 0 ? empty('No days have been settled yet.') : null,
    ),
  );

  el.appendChild(
    section(
      'Cash flow',
      lineChart(state.dayHistory.slice(-60).map((d) => d.cash), { showZero: true }),
      h('p', { class: 'tiny muted', text: 'Closing cash balance per day.' }),
    ),
  );

  // ------------------------------------------------------ cost breakdown
  const breakdown = new Map<LedgerCategory, number>();
  const recentDay = state.day - 7;
  for (const entry of state.ledger) {
    if (entry.day < recentDay) continue;
    breakdown.set(entry.category, (breakdown.get(entry.category) ?? 0) + entry.amount);
  }
  const rows = [...breakdown.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  el.appendChild(
    h(
      'div',
      { class: 'grid cols-2' },
      section(
        'Where the money went (last 7 days)',
        rows.length === 0
          ? empty('Nothing has moved yet.')
          : table(
              ['Category', 'Amount'],
              rows.map(([category, amount]) => [
                LEDGER_LABELS[category],
                h('span', { class: isRevenue(category) ? 'good' : 'bad', text: moneySigned(amount) }),
              ]),
            ),
      ),
      section(
        'Balance sheet',
        stat('Cash', money(company.cash), company.cash < 0 ? 'bad' : undefined),
        stat('Stock at cost', money(inventoryValue(state))),
        stat('Property', money(propertyValue(state))),
        stat('Business goodwill', money(goodwillValue(state)), 'muted'),
        stat('Debt', money(-debtTotal(state)), debtTotal(state) > 0 ? 'bad' : 'muted'),
        stat('Net worth', money(netWorth(state)), netWorth(state) >= 0 ? 'good' : 'bad'),
        stat('Credit rating', `${Math.round(company.creditRating)}/100`),
        h('p', {
          class: 'tiny muted',
          text: `Corporation tax is ${Math.round(TAX_RATE * 100)}% of monthly profit, charged on the first of the month. Losses are not refunded.`,
        }),
      ),
    ),
  );

  // -------------------------------------------------------------- loans
  const loanPanel = section('Borrowing');
  loanPanel.appendChild(
    h('p', {
      class: 'tiny muted',
      text: `The bank will lend up to about ${money(borrowingHeadroom(state))} more against what you own. Missing a payment damages your credit rating badly.`,
    }),
  );

  if (state.loans.length > 0) {
    loanPanel.appendChild(
      table(
        ['Lender', 'Outstanding', 'Rate', 'Monthly', 'Missed', ''],
        state.loans.map((loan) => [
          loan.lender,
          money(loan.outstanding),
          pct(loan.annualRate * 100, 2),
          money(loan.monthlyPayment),
          loan.missedPayments > 0 ? h('span', { class: 'bad', text: String(loan.missedPayments) }) : '0',
          button(
            'Repay 25%',
            () => {
              const result = repayLoan(state, loan.id, loan.outstanding * 0.25);
              toast(result.message, result.ok ? 'good' : 'bad');
              ctx.refresh();
            },
            'btn small',
          ),
        ]),
      ),
    );
  }

  for (const offer of loanOffers(state)) {
    const eligible = company.creditRating >= offer.minimumCreditRating;
    const amountInput = numberInput(Math.min(offer.maxPrincipal, Math.round(borrowingHeadroom(state))), () => {}, {
      min: '1000',
      max: String(offer.maxPrincipal),
      step: '1000',
    });
    loanPanel.appendChild(
      h(
        'div',
        { class: 'card', style: 'margin-top:8px' },
        h(
          'div',
          { class: 'card-head' },
          h(
            'div',
            {},
            h('div', { class: 'card-title', text: offer.lender }),
            h('div', {
              class: 'card-sub',
              text: `Up to ${money(offer.maxPrincipal)} · ${pct(offer.annualRate * 100, 2)} over ${offer.termMonths} months · needs credit ${offer.minimumCreditRating}`,
            }),
          ),
          h('span', { class: `tag ${eligible ? 'good' : 'bad'}`, text: eligible ? 'Eligible' : 'Not eligible' }),
        ),
        h(
          'div',
          { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap' },
          h('label', { class: 'field', style: 'flex:1;min-width:150px;margin:0' }, h('span', { text: 'Amount' }), amountInput),
          button(
            'Borrow',
            () => {
              const amount = Number(amountInput.value);
              const result = takeLoan(state, offer.id, amount);
              toast(result.message, result.ok ? 'good' : 'bad');
              if (result.ok) ctx.refresh();
            },
            'btn primary',
          ),
        ),
        h('p', {
          class: 'tiny muted',
          text: `A ${money(Number(amountInput.value) || 0)} loan would cost about ${money(
            monthlyPayment(Number(amountInput.value) || 0, offer.annualRate, offer.termMonths),
          )} a month.`,
        }),
      ),
    );
  }
  el.appendChild(loanPanel);

  // ------------------------------------------------------------- ledger
  const ledger = [...state.ledger].reverse().slice(0, 60);
  el.appendChild(
    section(
      'Recent transactions',
      ledger.length === 0
        ? empty('The ledger is empty.')
        : table(
            ['Day', 'Time', 'Category', 'Detail', 'Amount'],
            ledger.map((entry) => [
              String(entry.day),
              clockLabel(entry.hour),
              LEDGER_LABELS[entry.category],
              entry.label,
              h('span', { class: entry.amount >= 0 ? 'good' : 'bad', text: moneySigned(entry.amount) }),
            ]),
          ),
      h('p', {
        class: 'tiny muted',
        text: `Every euro the company moves is recorded here. ${playerBusinesses(state).length} businesses contribute to these figures.`,
      }),
    ),
  );

  return { el };
}
