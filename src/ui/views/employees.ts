import type { Ctx, View } from '../app';
import type { Business, Employee } from '../../sim/types';
import { businessById, employeesOf, playerBusinesses } from '../../sim/state';
import { businessTypeOrThrow } from '../../data/businessTypes';
import { ROLES, role, trait } from '../../data/roles';
import {
  RECRUITMENT_FEE,
  TRAINING_COST_PER_DAY,
  TRAINING_DAYS,
  applicantsFor,
  dailyWage,
  fire,
  hire,
  setSalary,
  staffCapacityOf,
  startTraining,
  transfer,
} from '../../sim/employees';
import { money } from '../../sim/format';
import { sum } from '../../sim/util';
import { bar, button, confirmDialog, empty, h, modal, numberInput, section, select, stat, table, toast } from '../dom';

export function employeesView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const state = ctx.state;
  const businesses = playerBusinesses(state);

  el.appendChild(
    h(
      'div',
      { class: 'view-head' },
      h('h1', { text: 'Employees' }),
      h('p', {
        text: `${state.employees.length} on the payroll · ${money(sum(state.employees, (e) => e.salary))}/month`,
      }),
    ),
  );

  if (businesses.length === 0) {
    el.appendChild(section('No businesses', empty('Create a business before hiring anyone.')));
    return { el };
  }

  const selectedId = ctx.params.business ?? businesses[0].id;
  const business = businessById(state, selectedId) ?? businesses[0];
  const staff = employeesOf(state, business.id);
  const capacity = staffCapacityOf(business);

  el.appendChild(
    section(
      'Location',
      select(
        businesses.map((b) => ({ value: b.id, label: b.name })),
        business.id,
        (value) => ctx.go('employees', { business: value }),
      ),
      h(
        'div',
        { class: 'grid cols-3', style: 'margin-top:12px' },
        stat('Team size', `${staff.length} / ${capacity}`),
        stat('Wage bill', `${money(sum(staff, (e) => e.salary))}/mo`),
        stat('Average morale', staff.length ? `${Math.round(sum(staff, (e) => e.morale) / staff.length)}/100` : '—'),
      ),
    ),
  );

  // ------------------------------------------------------------ the team
  const teamPanel = section('Your team');
  if (staff.length === 0) {
    teamPanel.appendChild(
      empty('Nobody works here. Without staff you can serve about four customers an hour yourself, which is not a business.'),
    );
  } else {
    teamPanel.appendChild(
      table(
        ['Name', 'Role', 'Skill', 'Morale', 'Stress', 'Salary', ''],
        staff.map((employee) => [
          h(
            'div',
            {},
            h('div', { text: employee.name }),
            h('div', {
              class: 'tiny muted',
              text: employee.traits.map((t) => trait(t).name).join(', ') || 'No notable traits',
            }),
          ),
          role(employee.role).name,
          `${Math.round(employee.skill)}`,
          h('span', {
            class: employee.morale < 40 ? 'bad' : employee.morale > 70 ? 'good' : '',
            text: `${Math.round(employee.morale)}`,
          }),
          h('span', { class: employee.stress > 65 ? 'bad' : '', text: `${Math.round(employee.stress)}` }),
          h(
            'div',
            {},
            h('div', { text: money(employee.salary) }),
            h('div', { class: 'tiny muted', text: `${money(dailyWage(employee))}/day` }),
          ),
          button('Manage', () => openEmployeeDialog(ctx, employee), 'btn small'),
        ]),
      ),
    );
    teamPanel.appendChild(
      h('p', {
        class: 'tiny muted',
        text: 'Morale falls when pay is below the market rate or the team is stretched. Below 38 people start looking elsewhere.',
      }),
    );
  }
  el.appendChild(teamPanel);

  // ---------------------------------------------------------- applicants
  const applicants = applicantsFor(state, business);
  const applicantPanel = section('Applicants');
  applicantPanel.appendChild(
    h('p', {
      class: 'tiny muted',
      text: `${businessTypeOrThrow(business.typeId).name} uses these roles: ${businessTypeOrThrow(business.typeId)
        .roles.map((r) => role(r).name)
        .join(', ')}. Recruitment costs ${money(RECRUITMENT_FEE)} plus a week of wages up front.`,
    }),
  );

  if (applicants.length === 0) {
    applicantPanel.appendChild(empty('Nobody suitable applied today. The pool refreshes each day.'));
  } else {
    applicantPanel.appendChild(
      table(
        ['Name', 'Role', 'Skill', 'Reliability', 'Traits', 'Asking salary', ''],
        applicants.map((applicant) => [
          h('div', {}, h('div', { text: applicant.name }), h('div', { class: 'tiny muted', text: `${applicant.age} years old` })),
          role(applicant.role).name,
          skillCell(applicant.skill),
          skillCell(applicant.reliability),
          h('div', { class: 'tiny muted', text: applicant.traits.map((t) => trait(t).name).join(', ') }),
          money(applicant.salary),
          button(
            'Hire',
            () => {
              const result = hire(state, applicant.id, business.id);
              toast(result.message, result.ok ? 'good' : 'bad');
              if (result.ok) ctx.refresh();
            },
            'btn small primary',
          ),
        ]),
      ),
    );
  }
  el.appendChild(applicantPanel);

  // -------------------------------------------------------- whole company
  if (state.employees.length > 0) {
    const byRole = ROLES.map((roleDef) => ({
      label: roleDef.name,
      value: state.employees.filter((e) => e.role === roleDef.id).length,
    })).filter((row) => row.value > 0);

    el.appendChild(
      section(
        'Across the company',
        table(
          ['Role', 'People', 'Average skill', 'Average morale', 'Monthly cost'],
          byRole.map((row) => {
            const people = state.employees.filter((e) => role(e.role).name === row.label);
            return [
              row.label,
              String(people.length),
              `${Math.round(sum(people, (e) => e.skill) / people.length)}`,
              `${Math.round(sum(people, (e) => e.morale) / people.length)}`,
              money(sum(people, (e) => e.salary)),
            ];
          }),
        ),
      ),
    );
  }

  return { el };
}

function skillCell(value: number): HTMLElement {
  return h(
    'div',
    { style: 'min-width:70px' },
    h('div', { class: 'tiny', text: String(Math.round(value)) }),
    bar(value / 100, value > 70 ? 'good' : value < 40 ? 'bad' : ''),
  );
}

function openEmployeeDialog(ctx: Ctx, employee: Employee): void {
  const state = ctx.state;
  const { body, footer, close } = modal({ title: employee.name, width: 520 });
  const roleDef = role(employee.role);
  const businesses = playerBusinesses(state);

  body.appendChild(
    h(
      'div',
      { class: 'panel' },
      stat('Role', roleDef.name),
      stat('Age', String(employee.age)),
      stat('Skill', `${Math.round(employee.skill)}/100`),
      stat('Productivity', `${Math.round(employee.productivity)}/100`),
      stat('Reliability', `${Math.round(employee.reliability)}/100`),
      stat('Morale', `${Math.round(employee.morale)}/100`, employee.morale < 40 ? 'bad' : undefined),
      stat('Stress', `${Math.round(employee.stress)}/100`, employee.stress > 65 ? 'bad' : undefined),
      stat('Loyalty', `${Math.round(employee.loyalty)}/100`),
      stat('Courses completed', String(employee.trainingDays)),
    ),
  );

  if (employee.traits.length > 0) {
    const traits = h('div', { class: 'panel' }, h('h3', { class: 'panel-title', text: 'Traits' }));
    for (const id of employee.traits) {
      const def = trait(id);
      traits.appendChild(
        h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: def.name }), h('span', { class: 'stat-value muted', text: def.effect })),
      );
    }
    body.appendChild(traits);
  }

  const marketRate = Math.round(roleDef.baseSalary * state.economy.inflation);
  body.appendChild(
    h(
      'label',
      { class: 'field' },
      h('span', { text: `Monthly salary (market rate for this role: ${money(marketRate)})` }),
      numberInput(
        employee.salary,
        (value) => {
          const result = setSalary(state, employee.id, value);
          toast(result.message, result.ok ? 'good' : 'bad');
          ctx.refresh();
        },
        { step: '50', min: '0' },
      ),
    ),
  );

  if (businesses.length > 1) {
    body.appendChild(
      h(
        'label',
        { class: 'field' },
        h('span', { text: 'Assigned to' }),
        select(
          businesses.map((b) => ({ value: b.id, label: b.name })),
          employee.businessId ?? businesses[0].id,
          (value) => {
            const result = transfer(state, employee.id, value);
            toast(result.message, result.ok ? 'good' : 'bad');
            close();
            ctx.refresh();
          },
        ),
      ),
    );
  }

  if (employee.trainingEndsOnDay !== null) {
    body.appendChild(h('p', { class: 'tiny muted', text: `In training until day ${employee.trainingEndsOnDay}.` }));
  } else {
    body.appendChild(
      h('p', {
        class: 'tiny muted',
        text: `A ${TRAINING_DAYS}-day course costs ${money(TRAINING_COST_PER_DAY * TRAINING_DAYS)} and raises skill. Each additional course does less than the one before.`,
      }),
    );
    footer.appendChild(
      button('Send on a course', () => {
        const result = startTraining(state, employee.id);
        toast(result.message, result.ok ? 'good' : 'bad');
        close();
        ctx.refresh();
      }),
    );
  }

  footer.appendChild(
    button(
      'Dismiss',
      async () => {
        const ok = await confirmDialog(
          `Dismiss ${employee.name}?`,
          'Severance is based on length of service, and the rest of the team will notice.',
          'Dismiss',
        );
        if (!ok) return;
        const result = fire(state, employee.id);
        toast(result.message, result.ok ? 'good' : 'bad');
        close();
        ctx.refresh();
      },
      'btn danger',
    ),
  );
}

/** Utilisation of a team, used by the reports view. */
export function teamUtilisation(ctx: Ctx, business: Business): number {
  const staff = employeesOf(ctx.state, business.id);
  if (staff.length === 0) return 0;
  const type = businessTypeOrThrow(business.typeId);
  const capacity = staff.length * type.customersPerStaffHour;
  const served = business.yesterday.customers;
  return capacity > 0 ? served / (capacity * Math.max(1, business.openTo - business.openFrom)) : 0;
}
