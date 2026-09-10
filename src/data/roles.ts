import type { EmployeeRoleDef, EmployeeRoleId, EmployeeTrait } from '../sim/types';

export const ROLES: EmployeeRoleDef[] = [
  { id: 'cashier', name: 'Cashier', baseSalary: 2050, description: 'Handles the queue. Directly limits how many customers you can serve.' },
  { id: 'sales', name: 'Sales Employee', baseSalary: 2250, description: 'Converts browsers into buyers and lifts the average basket.' },
  { id: 'manager', name: 'Store Manager', baseSalary: 3600, description: 'Lifts everyone else and keeps service quality from sliding.' },
  { id: 'warehouse', name: 'Warehouse Worker', baseSalary: 2200, description: 'Keeps the shelves filled from the back room.' },
  { id: 'driver', name: 'Delivery Driver', baseSalary: 2400, description: 'Required for logistics work and own-fleet deliveries.' },
  { id: 'cook', name: 'Cook', baseSalary: 2650, description: 'Sets both the throughput and the food quality of a kitchen.' },
  { id: 'server', name: 'Server', baseSalary: 2000, description: 'Front of house. Drives service quality and review scores.' },
  { id: 'technician', name: 'Technician', baseSalary: 3100, description: 'Skilled work: repairs, installations, treatments.' },
  { id: 'cleaner', name: 'Cleaner', baseSalary: 1850, description: 'Cleanliness feeds directly into reviews.' },
  { id: 'accountant', name: 'Accountant', baseSalary: 3300, description: 'Trims overheads and reduces the tax bill.' },
  { id: 'marketer', name: 'Marketing Employee', baseSalary: 2950, description: 'Makes every euro of marketing spend go further.' },
];

const byId = new Map(ROLES.map((role) => [role.id, role]));

export function role(id: EmployeeRoleId): EmployeeRoleDef {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown role: ${id}`);
  return found;
}

export interface TraitDef {
  id: EmployeeTrait;
  name: string;
  effect: string;
  /** Multipliers applied to the employee's derived stats. */
  productivity: number;
  reliability: number;
  moraleDrift: number;
  learning: number;
  salaryExpectation: number;
}

export const TRAITS: TraitDef[] = [
  { id: 'hardworker', name: 'Hard worker', effect: '+15% productivity', productivity: 1.15, reliability: 1.04, moraleDrift: 0, learning: 1, salaryExpectation: 1.02 },
  { id: 'lazy', name: 'Lazy', effect: '−18% productivity', productivity: 0.82, reliability: 0.94, moraleDrift: 0.4, learning: 0.8, salaryExpectation: 0.94 },
  { id: 'ambitious', name: 'Ambitious', effect: 'Learns fast, expects raises', productivity: 1.07, reliability: 1, moraleDrift: -0.6, learning: 1.3, salaryExpectation: 1.14 },
  { id: 'loyal', name: 'Loyal', effect: 'Rarely resigns', productivity: 1, reliability: 1.06, moraleDrift: 0.5, learning: 1, salaryExpectation: 0.95 },
  { id: 'unreliable', name: 'Unreliable', effect: 'Often absent', productivity: 0.95, reliability: 0.74, moraleDrift: -0.2, learning: 0.95, salaryExpectation: 0.9 },
  { id: 'fastlearner', name: 'Fast learner', effect: 'Training pays off twice as fast', productivity: 1, reliability: 1, moraleDrift: 0, learning: 1.9, salaryExpectation: 1.05 },
  { id: 'perfectionist', name: 'Perfectionist', effect: '+ service quality, − speed', productivity: 0.92, reliability: 1.05, moraleDrift: -0.3, learning: 1.1, salaryExpectation: 1.06 },
  { id: 'teamplayer', name: 'Team player', effect: 'Lifts colleagues’ morale', productivity: 1.02, reliability: 1.02, moraleDrift: 0.3, learning: 1, salaryExpectation: 1 },
  { id: 'difficult', name: 'Difficult', effect: 'Drags colleagues’ morale down', productivity: 1.03, reliability: 0.98, moraleDrift: -0.5, learning: 1, salaryExpectation: 1.03 },
  { id: 'friendly', name: 'Customer-friendly', effect: '+ service quality', productivity: 1.01, reliability: 1.01, moraleDrift: 0.2, learning: 1, salaryExpectation: 1.04 },
];

const traitById = new Map(TRAITS.map((trait) => [trait.id, trait]));

export function trait(id: EmployeeTrait): TraitDef {
  const found = traitById.get(id);
  if (!found) throw new Error(`Unknown trait: ${id}`);
  return found;
}

export const FIRST_NAMES = [
  'Aisha', 'Mateo', 'Nora', 'Elias', 'Priya', 'Tomas', 'Lena', 'Youssef', 'Sofia', 'Kenji',
  'Marta', 'Dmitri', 'Chloe', 'Andre', 'Ingrid', 'Hassan', 'Lucia', 'Bram', 'Zoe', 'Otto',
  'Amara', 'Felix', 'Rina', 'Viktor', 'Talia', 'Jonas', 'Mei', 'Rafael', 'Sanne', 'Idris',
  'Clara', 'Nikolai', 'Yara', 'Pieter', 'Esme', 'Omar', 'Freya', 'Diego', 'Hana', 'Lars',
];

export const LAST_NAMES = [
  'Okafor', 'Lindqvist', 'Moreau', 'Hartmann', 'Silva', 'Novak', 'Bergman', 'Halim', 'Costa',
  'Tanaka', 'Kovac', 'Duarte', 'Ferreira', 'Ivanov', 'Nakamura', 'Brandt', 'Rossi', 'Vos',
  'Adeyemi', 'Larsen', 'Mendez', 'Weiss', 'Petrov', 'Dubois', 'Haddad', 'Sorensen', 'Marino',
  'Pereira', 'Farkas', 'Nowak', 'Reyes', 'Aalto', 'Bianchi', 'Steiner', 'Okonkwo', 'Vidal',
];
