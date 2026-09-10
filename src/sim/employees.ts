import type { GameState } from './state';
import { employeesOf, playerCompany } from './state';
import type { Business, Employee, EmployeeRoleId, EmployeeTrait } from './types';
import { FIRST_NAMES, LAST_NAMES, ROLES, TRAITS, role, trait } from '../data/roles';
import { businessTypeOrThrow } from '../data/businessTypes';
import { post } from './finance';
import { pushAlert } from './alerts';
import { clamp, makeId } from './util';
import { gameRng } from './rng';

export const APPLICANT_POOL = 14;
/** One-off recruitment cost, charged when an applicant is hired. */
export const RECRUITMENT_FEE = 420;
export const TRAINING_COST_PER_DAY = 180;
export const TRAINING_DAYS = 5;

export function dailyWage(employee: Employee): number {
  return employee.salary / 30;
}

function rollTraits(): EmployeeTrait[] {
  const count = gameRng.chance(0.35) ? 2 : 1;
  const picked = gameRng.sample(TRAITS, count);
  return picked.map((t) => t.id);
}

export function generateApplicant(state: GameState, forcedRole?: EmployeeRoleId): Employee {
  const roleDef = forcedRole ? role(forcedRole) : gameRng.pick(ROLES);
  const skill = Math.round(clamp(gameRng.around(52, 26), 8, 99));
  const experience = Math.round(clamp(gameRng.around(skill / 12, 4), 0, 30));
  const traits = rollTraits();
  const traitDefs = traits.map(trait);

  const productivityMod = traitDefs.reduce((acc, t) => acc * t.productivity, 1);
  const reliabilityMod = traitDefs.reduce((acc, t) => acc * t.reliability, 1);
  const salaryMod = traitDefs.reduce((acc, t) => acc * t.salaryExpectation, 1);

  // Scarce labour pushes wages up across the board.
  const marketPressure = 1 + clamp(0.08 - state.economy.unemployment, -0.05, 0.09) * 2.2;

  return {
    id: makeId('emp'),
    name: `${gameRng.pick(FIRST_NAMES)} ${gameRng.pick(LAST_NAMES)}`,
    age: Math.round(clamp(19 + experience + gameRng.range(0, 14), 18, 64)),
    role: roleDef.id,
    salary: Math.round(
      (roleDef.baseSalary * (0.72 + skill / 125) * salaryMod * marketPressure * state.economy.inflation) / 10,
    ) * 10,
    skill,
    experience,
    productivity: Math.round(clamp(gameRng.around(skill, 14) * productivityMod, 10, 100)),
    reliability: Math.round(clamp(gameRng.around(80, 16) * reliabilityMod, 25, 100)),
    morale: Math.round(clamp(gameRng.around(72, 12), 30, 100)),
    stress: Math.round(clamp(gameRng.around(24, 12), 0, 70)),
    loyalty: Math.round(clamp(gameRng.around(50, 20), 5, 100)),
    traits,
    businessId: null,
    companyId: null,
    hiredOnDay: 0,
    trainingDays: 0,
    trainingEndsOnDay: null,
  };
}

/**
 * Refreshes the applicant pool.
 *
 * Part of the pool is drawn from the roles the player's own businesses use, so
 * a shop is never stuck unable to hire a cashier because the dice said no.
 */
export function refreshApplicants(state: GameState): void {
  const needed: EmployeeRoleId[] = [];
  for (const business of state.businesses) {
    if (business.companyId !== state.playerCompanyId) continue;
    for (const roleId of businessTypeOrThrow(business.typeId).roles) {
      if (!needed.includes(roleId)) needed.push(roleId);
    }
  }

  const pool: Employee[] = [];
  for (const roleId of needed.slice(0, Math.floor(APPLICANT_POOL / 2))) {
    pool.push(generateApplicant(state, roleId));
  }
  while (pool.length < APPLICANT_POOL) pool.push(generateApplicant(state));
  state.applicants = pool;
}

/** Applicants whose role is useful to a given business type. */
export function applicantsFor(state: GameState, business: Business): Employee[] {
  const type = businessTypeOrThrow(business.typeId);
  const wanted = new Set<EmployeeRoleId>(type.roles);
  return state.applicants.filter((applicant) => wanted.has(applicant.role));
}

export function staffCapacityOf(business: Business): number {
  const type = businessTypeOrThrow(business.typeId);
  // Roughly one head per role slot, scaled by how busy the type is.
  return Math.max(2, type.roles.length * 3);
}

export function hire(state: GameState, applicantId: string, businessId: string): { ok: boolean; message: string } {
  const applicant = state.applicants.find((a) => a.id === applicantId);
  if (!applicant) return { ok: false, message: 'That applicant is no longer available.' };
  const business = state.businesses.find((b) => b.id === businessId);
  if (!business) return { ok: false, message: 'Unknown business.' };
  if (business.companyId !== state.playerCompanyId) return { ok: false, message: 'That is not your business.' };
  if (employeesOf(state, businessId).length >= staffCapacityOf(business)) {
    return { ok: false, message: `${business.name} cannot take on more staff.` };
  }
  const company = playerCompany(state);
  const upfront = RECRUITMENT_FEE + dailyWage(applicant) * 7;
  if (company.cash < upfront) {
    return { ok: false, message: `You need €${Math.round(upfront)} in cash to take someone on.` };
  }

  applicant.businessId = businessId;
  applicant.companyId = company.id;
  applicant.hiredOnDay = state.day;
  state.employees.push(applicant);
  business.employeeIds.push(applicant.id);
  state.applicants = state.applicants.filter((a) => a.id !== applicantId);
  state.applicants.push(generateApplicant(state));
  post(state, company.id, 'wages', `Recruitment — ${applicant.name}`, -RECRUITMENT_FEE, businessId);
  return { ok: true, message: `${applicant.name} hired as ${role(applicant.role).name}.` };
}

export function fire(state: GameState, employeeId: string): { ok: boolean; message: string } {
  const employee = state.employees.find((e) => e.id === employeeId);
  if (!employee) return { ok: false, message: 'Employee not found.' };
  const company = playerCompany(state);
  // Statutory notice: one month per five years of service, minimum two weeks.
  const years = (state.day - employee.hiredOnDay) / 360;
  const severance = Math.round(employee.salary * clamp(0.5 + years * 0.2, 0.5, 3));
  if (company.cash < severance) {
    return { ok: false, message: `Severance of €${severance.toLocaleString('en-GB')} exceeds available cash.` };
  }
  removeEmployee(state, employeeId);
  post(state, company.id, 'severance', `Severance — ${employee.name}`, -severance, employee.businessId);
  // Firing people is noticed by the rest of the team.
  for (const colleague of state.employees.filter((e) => e.businessId === employee.businessId)) {
    colleague.morale = clamp(colleague.morale - 4, 0, 100);
  }
  return { ok: true, message: `${employee.name} left. Severance €${severance.toLocaleString('en-GB')}.` };
}

function removeEmployee(state: GameState, employeeId: string): void {
  const employee = state.employees.find((e) => e.id === employeeId);
  state.employees = state.employees.filter((e) => e.id !== employeeId);
  if (!employee?.businessId) return;
  const business = state.businesses.find((b) => b.id === employee.businessId);
  if (business) business.employeeIds = business.employeeIds.filter((id) => id !== employeeId);
}

export function setSalary(state: GameState, employeeId: string, salary: number): { ok: boolean; message: string } {
  const employee = state.employees.find((e) => e.id === employeeId);
  if (!employee) return { ok: false, message: 'Employee not found.' };
  const roleDef = role(employee.role);
  const next = Math.round(clamp(salary, roleDef.baseSalary * 0.5, roleDef.baseSalary * 4) / 10) * 10;
  const change = next - employee.salary;
  employee.salary = next;
  if (change > 0) {
    employee.morale = clamp(employee.morale + (change / roleDef.baseSalary) * 45, 0, 100);
    employee.loyalty = clamp(employee.loyalty + (change / roleDef.baseSalary) * 30, 0, 100);
    return { ok: true, message: `${employee.name} accepted the raise.` };
  }
  employee.morale = clamp(employee.morale + (change / roleDef.baseSalary) * 70, 0, 100);
  employee.loyalty = clamp(employee.loyalty + (change / roleDef.baseSalary) * 60, 0, 100);
  return { ok: true, message: `${employee.name} was not pleased about the pay cut.` };
}

export function startTraining(state: GameState, employeeId: string): { ok: boolean; message: string } {
  const employee = state.employees.find((e) => e.id === employeeId);
  if (!employee) return { ok: false, message: 'Employee not found.' };
  if (employee.trainingEndsOnDay !== null) return { ok: false, message: 'Already in training.' };
  const cost = TRAINING_COST_PER_DAY * TRAINING_DAYS;
  const company = playerCompany(state);
  if (company.cash < cost) return { ok: false, message: `Training costs €${cost}.` };
  employee.trainingEndsOnDay = state.day + TRAINING_DAYS;
  post(state, company.id, 'training', `Training — ${employee.name}`, -cost, employee.businessId);
  return { ok: true, message: `${employee.name} starts a ${TRAINING_DAYS}-day course.` };
}

export function transfer(state: GameState, employeeId: string, businessId: string): { ok: boolean; message: string } {
  const employee = state.employees.find((e) => e.id === employeeId);
  const target = state.businesses.find((b) => b.id === businessId);
  if (!employee || !target) return { ok: false, message: 'Unknown employee or business.' };
  if (target.companyId !== state.playerCompanyId) return { ok: false, message: 'That is not your business.' };
  if (employeesOf(state, businessId).length >= staffCapacityOf(target)) {
    return { ok: false, message: `${target.name} is fully staffed.` };
  }
  const previous = state.businesses.find((b) => b.id === employee.businessId);
  if (previous) previous.employeeIds = previous.employeeIds.filter((id) => id !== employeeId);
  employee.businessId = businessId;
  target.employeeIds.push(employeeId);
  employee.morale = clamp(employee.morale - 3, 0, 100);
  return { ok: true, message: `${employee.name} moved to ${target.name}.` };
}

// ------------------------------------------------------------ derived power

/** Capacity and service weight per role. Managers multiply instead of adding. */
const ROLE_WEIGHTS: Record<EmployeeRoleId, { capacity: number; service: number; manager?: boolean }> = {
  cashier: { capacity: 1.15, service: 0.08 },
  sales: { capacity: 0.85, service: 0.45 },
  server: { capacity: 1.0, service: 0.55 },
  cook: { capacity: 1.1, service: 0.5 },
  technician: { capacity: 0.95, service: 0.5 },
  cleaner: { capacity: 0.75, service: 0.6 },
  warehouse: { capacity: 0.5, service: 0.05 },
  driver: { capacity: 0.75, service: 0.05 },
  marketer: { capacity: 0.1, service: 0.15 },
  accountant: { capacity: 0.1, service: 0.1 },
  manager: { capacity: 0.15, service: 0.4, manager: true },
};

export interface StaffPower {
  /** Customers the team can serve per hour. */
  capacityPerHour: number;
  /** 0..1.4 multiplier on service quality. */
  service: number;
  /** How many people actually turned up. */
  present: number;
  /** Total headcount. */
  headcount: number;
  /** 0..1 average morale. */
  morale: number;
}

/**
 * Converts the team into the two numbers the simulation needs: how many
 * customers can be served, and how good the experience is.
 */
export function staffPower(state: GameState, business: Business): StaffPower {
  const type = businessTypeOrThrow(business.typeId);
  const staff = employeesOf(state, business.id);
  const result: StaffPower = {
    capacityPerHour: 0,
    service: 0.55,
    present: 0,
    headcount: staff.length,
    morale: 0,
  };
  if (staff.length === 0) return result;

  let capacity = 0;
  let service = 0;
  let managers = 0;
  let moraleTotal = 0;

  for (const employee of staff) {
    moraleTotal += employee.morale;
    if (employee.trainingEndsOnDay !== null) continue; // away on a course
    // Attendance depends on reliability and how stressed they are.
    const attendance = clamp((employee.reliability - employee.stress * 0.35) / 100, 0.3, 0.99);
    if (!gameRng.chance(attendance)) continue;
    result.present += 1;

    const moraleFactor = clamp(0.55 + employee.morale / 130, 0.5, 1.3);
    const power = (employee.productivity * 0.6 + employee.skill * 0.4) / 100;
    const contribution = power * moraleFactor;

    // Every role contributes something to throughput and something to the
    // quality of the experience; the split is what makes a team of cashiers
    // different from a team of cleaners.
    const weights = ROLE_WEIGHTS[employee.role];
    if (weights.manager) managers += contribution;
    capacity += contribution * weights.capacity;
    service += contribution * weights.service;

    for (const t of employee.traits) {
      if (t === 'friendly' || t === 'perfectionist') service += contribution * 0.18;
    }
  }

  // A manager lifts everyone, with diminishing returns past the second one.
  const managerBoost = 1 + clamp(managers, 0, 2.5) * 0.16;
  result.capacityPerHour = capacity * type.customersPerStaffHour * managerBoost;
  result.service = clamp(0.55 + service * 0.32 * managerBoost, 0.35, 1.45);
  result.morale = moraleTotal / staff.length / 100;
  return result;
}

// --------------------------------------------------------------- daily tick

export function employeesDaily(state: GameState): void {
  for (const employee of [...state.employees]) {
    const roleDef = role(employee.role);
    const traitDefs = employee.traits.map(trait);
    const business = state.businesses.find((b) => b.id === employee.businessId);

    if (employee.trainingEndsOnDay !== null && state.day >= employee.trainingEndsOnDay) {
      // Diminishing returns: the tenth course is worth far less than the first.
      const learning = traitDefs.reduce((acc, t) => acc * t.learning, 1);
      const gain = (9 * learning) / (1 + employee.trainingDays * 0.45);
      employee.skill = clamp(employee.skill + gain, 0, 100);
      employee.productivity = clamp(employee.productivity + gain * 0.8, 0, 100);
      employee.trainingDays += 1;
      employee.trainingEndsOnDay = null;
      employee.morale = clamp(employee.morale + 5, 0, 100);
      pushAlert(state, 'info', `${employee.name} finished training`, `Skill is now ${Math.round(employee.skill)}.`, employee.businessId);
    }

    // Pay relative to the market is the main driver of morale.
    const payRatio = employee.salary / (roleDef.baseSalary * state.economy.inflation);
    const payEffect = clamp((payRatio - 1) * 30, -16, 14);
    const moraleDrift = traitDefs.reduce((acc, t) => acc + t.moraleDrift, 0);

    // Stress follows how hard the team was actually worked yesterday, not how
    // many role slots the business has: a quiet shop with one person on the
    // till is not a pressure cooker.
    let workload = -3;
    if (business && business.status === 'open') {
      const type = businessTypeOrThrow(business.typeId);
      const colleagues = Math.max(1, business.employeeIds.length);
      const openHours = Math.max(1, business.openTo - business.openFrom);
      const capacity = colleagues * type.customersPerStaffHour * openHours;
      const served = business.yesterday.customers + business.yesterday.lostCustomers;
      const utilisation = capacity > 0 ? served / capacity : 0;
      workload = clamp((utilisation - 0.7) * 26, -5, 14);
    }
    employee.stress = clamp(employee.stress + workload * 0.5 - 2 + gameRng.range(-2, 2), 0, 100);
    employee.morale = clamp(
      employee.morale + payEffect * 0.35 + moraleDrift - employee.stress * 0.06 + gameRng.range(-2, 2),
      0,
      100,
    );
    employee.loyalty = clamp(employee.loyalty + (employee.morale - 55) * 0.05, 0, 100);
    employee.experience += 1 / 360;

    // Resignations: unhappy, disloyal people leave.
    const risk = clamp((35 - employee.morale) / 260 + (30 - employee.loyalty) / 900, 0, 0.22);
    if (employee.morale < 38 && gameRng.chance(risk)) {
      removeEmployee(state, employee.id);
      pushAlert(
        state,
        'warning',
        `${employee.name} resigned`,
        `Morale had fallen to ${Math.round(employee.morale)}. Pay, workload or management is the usual cause.`,
        employee.businessId,
      );
    }
  }

  // Refresh a slice of the applicant pool every day, keeping the mix useful.
  const replace = Math.min(4, state.applicants.length);
  state.applicants.splice(0, replace);
  refreshTail(state, replace);
}

/** Wages are paid daily so cash flow is visible day by day. */
export function payWages(state: GameState): number {
  let total = 0;
  for (const business of state.businesses) {
    if (business.companyId !== state.playerCompanyId) continue;
    const staff = employeesOf(state, business.id);
    const amount = staff.reduce((acc, e) => acc + dailyWage(e), 0);
    if (amount <= 0) continue;
    business.today.wages += amount;
    post(state, business.companyId, 'wages', `Wages — ${business.name}`, -amount, business.id);
    total += amount;
  }
  return total;
}

/** Tops the pool back up, favouring roles the player's businesses can use. */
function refreshTail(state: GameState, count: number): void {
  const needed: EmployeeRoleId[] = [];
  for (const business of state.businesses) {
    if (business.companyId !== state.playerCompanyId) continue;
    for (const roleId of businessTypeOrThrow(business.typeId).roles) {
      if (!needed.includes(roleId)) needed.push(roleId);
    }
  }
  for (let i = 0; i < count; i += 1) {
    const forced = needed.length > 0 && gameRng.chance(0.55) ? gameRng.pick(needed) : undefined;
    state.applicants.push(generateApplicant(state, forced));
  }
}
