/**
 * Pay-period helpers: chuẩn 21-20 cho OFFICIAL, 1-31 cho SEASONAL
 * Ví dụ: 27/08/2026 OFFICIAL -> Tháng 9 (21/08-20/09), SEASONAL -> Tháng 8
 */

export type ContractTypeLoose = 'OFFICIAL' | 'SEASONAL' | string;

export function parseDateLoose(s?: string): Date | null {
  if (!s) return null;
  if (s.includes('/')) {
    const [d,m,y] = s.split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m-1, d);
  }
  if (s.includes('-')) {
    const [y,m,d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }
  return null;
}

export interface PayPeriod {
  payMonth: number; // 1..12
  payYear: number;
}

/**
 * Map a real calendar date to its pay period month.
 * OFFICIAL: 21 (>=21) counts to next month. 20 and before counts to current month.
 * SEASONAL: calendar month.
 */
export function getPayPeriod(date: Date, contractType: ContractTypeLoose): PayPeriod {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  if (contractType === 'OFFICIAL') {
    if (d >= 21) {
      // belongs to next month's pay period
      if (m === 12) return { payMonth: 1, payYear: y + 1 };
      return { payMonth: m + 1, payYear: y };
    } else {
      return { payMonth: m, payYear: y };
    }
  }
  // SEASONAL or others: calendar
  return { payMonth: m, payYear: y };
}

export function getPayPeriodFromStr(dateStr: string, contractType: ContractTypeLoose): PayPeriod | null {
  const d = parseDateLoose(dateStr);
  if (!d) return null;
  return getPayPeriod(d, contractType);
}

/**
 * Current pay period for given now and contract type
 */
export function getCurrentPayPeriod(now: Date, contractType: ContractTypeLoose): PayPeriod {
  return getPayPeriod(now, contractType);
}

/**
 * Check if dateStr belongs to target pay period (payMonth/payYear) for given contract type
 */
export function isInPayPeriod(dateStr: string, contractType: ContractTypeLoose, targetMonth: number, targetYear: number): boolean {
  const pp = getPayPeriodFromStr(dateStr, contractType);
  if (!pp) return false;
  return pp.payMonth === targetMonth && pp.payYear === targetYear;
}

/**
 * For dashboard unified view: check if record belongs to current pay period.
 * For generic records without contractType context, use OFFICIAL logic as default
 * (since most employees are OFFICIAL). For per-employee checks, pass employee contractType.
 */
export function isInCurrentPayPeriod(dateStr: string, contractType: ContractTypeLoose, now: Date): boolean {
  const cur = getCurrentPayPeriod(now, contractType);
  return isInPayPeriod(dateStr, contractType, cur.payMonth, cur.payYear);
}

/**
 * Format pay period label for UI: e.g., OFFICIAL Tháng 9: "21/08/2026 - 20/09/2026"
 */
export function formatPayPeriodLabel(payMonth: number, payYear: number, contractType: ContractTypeLoose): string {
  if (contractType === 'OFFICIAL') {
    // payMonth determines 21 of previous month to 20 of payMonth
    let prevMonth = payMonth - 1;
    let prevYear = payYear;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
    const prevDays = new Date(prevYear, prevMonth, 0).getDate(); // not needed for label
    const start = `21/${String(prevMonth).padStart(2,'0')}/${prevYear}`;
    const end = `20/${String(payMonth).padStart(2,'0')}/${payYear}`;
    return `${start} - ${end}`;
  }
  // SEASONAL: 01 - last day
  const days = new Date(payYear, payMonth, 0).getDate();
  return `01/${String(payMonth).padStart(2,'0')}/${payYear} - ${String(days).padStart(2,'0')}/${String(payMonth).padStart(2,'0')}/${payYear}`;
}

/**
 * Days until contract end (for notification)
 */
export function daysUntil(dateStr: string, now: Date = new Date()): number | null {
  const d = parseDateLoose(dateStr);
  if (!d) return null;
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000*60*60*24));
  return diff;
}
