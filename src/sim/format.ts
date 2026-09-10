const int = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? '-' : ''}€${int.format(Math.abs(Math.round(safe)))}`;
}

export function moneyCents(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? '-' : ''}€${dec.format(Math.abs(safe))}`;
}

export function moneySigned(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.round(safe) === 0) return '€0';
  return `${safe > 0 ? '+' : '-'}€${int.format(Math.abs(Math.round(safe)))}`;
}

/** Short form for tight spaces: €1.2M, €845k, €320. */
export function moneyShort(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${sign}€${int.format(Math.round(abs / 1000))}k`;
  return money(safe);
}

export function count(value: number): string {
  return int.format(Number.isFinite(value) ? Math.round(value) : 0);
}

export function pct(value: number, digits = 0): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
}

export function pctSigned(value: number, digits = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? '+' : ''}${safe.toFixed(digits)}%`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The calendar is a simple 30-day month, 12-month year. */
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

export function calendar(day: number): {
  dayOfMonth: number;
  month: number;
  year: number;
  monthName: string;
  weekday: string;
  label: string;
} {
  const index = Math.max(0, Math.floor(day) - 1);
  const dayOfMonth = (index % DAYS_PER_MONTH) + 1;
  const monthIndex = Math.floor(index / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
  const year = 2026 + Math.floor(index / (DAYS_PER_MONTH * MONTHS_PER_YEAR));
  const weekday = WEEKDAYS[index % 7];
  return {
    dayOfMonth,
    month: monthIndex + 1,
    year,
    monthName: MONTHS[monthIndex],
    weekday,
    label: `${weekday} ${dayOfMonth} ${MONTHS[monthIndex]} ${year}`,
  };
}

export function clockLabel(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function hoursLabel(hours: number): string {
  const total = Math.max(0, Math.round(hours));
  if (total < 24) return `${total}h`;
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}
