/**
 * Calendar utilities for dynamic 31-day matrix generation
 * Supports both contract cycles:
 *  - SEASONAL (1-31): 1 -> 31 cùng tháng
 *  - OFFICIAL (21-20): 21 tháng trước -> 20 tháng hiện tại
 */

export interface CalendarDay {
  dayIndex: number;   // 1..31 (cột trong ma trận)
  dayNum: number;     // 1..31 (ngày thực trong tháng)
  monthNum: number;   // 1..12 (tháng thực)
  yearNum: number;    // năm thực
  dateStr: string;    // YYYY-MM-DD
  dayEn: string;      // Mon, Tue ...
  dayVi: string;      // T2, T3 ... CN
  isSunday: boolean;
  isSaturday: boolean;
  isWeekend: boolean;
  weekdayNum: number; // 0=CN, 1=T2 ... 6=T7
}

const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Generate 31-day calendar for a given month/year
 * @param month 1..12
 * @param year e.g. 2026
 * @param cycle 'SEASONAL' | 'OFFICIAL' | 'AUTO' (if AUTO, generate seasonal view; caller handles per-employee filtering)
 */
export function generateCalendarDays(
  month: number,
  year: number,
  cycle: 'SEASONAL' | 'OFFICIAL' = 'SEASONAL'
): CalendarDay[] {
  const days: CalendarDay[] = [];

  for (let i = 1; i <= 31; i++) {
    let dayNum: number;
    let monthNum: number;
    let yearNum: number;

    if (cycle === 'OFFICIAL') {
      // Official: 21/tháng trước .. 20/tháng này
      // Clamp theo độ dài tháng trước - không sinh ngày 29/30/31 cho tháng ngắn
      const prevYearN = month === 1 ? year - 1 : year;
      const prevMonthN = month === 1 ? 12 : month - 1;
      const daysInPrevMonth = new Date(prevYearN, prevMonthN, 0).getDate();
      const prevDaysCount = Math.max(0, daysInPrevMonth - 20); // số ngày 21..cuối tháng trước

      if (i <= prevDaysCount) {
        dayNum = 20 + i;
        monthNum = prevMonthN;
        yearNum = prevYearN;
      } else if (i <= prevDaysCount + 20) {
        dayNum = i - prevDaysCount; // 1..20 tháng hiện tại
        monthNum = month;
        yearNum = year;
      } else {
        // Cột dư (tháng trước ngắn): lăn sang đầu tháng kế tiếp như nhánh SEASONAL
        const rem = i - (prevDaysCount + 20);
        dayNum = rem;
        monthNum = month === 12 ? 1 : month + 1;
        yearNum = month === 12 ? year + 1 : year;
      }
    } else {
      // Seasonal: 1..31 of current month
      // Handle months with <31 days: if day overflows, roll to next month (still show 31 columns for matrix consistency)
      const daysInMonth = new Date(year, month, 0).getDate();
      if (i <= daysInMonth) {
        dayNum = i;
        monthNum = month;
        yearNum = year;
      } else {
        // Overflow: show next month days (e.g., Feb 28 -> show 1/3, 2/3)
        dayNum = i - daysInMonth;
        monthNum = month === 12 ? 1 : month + 1;
        yearNum = month === 12 ? year + 1 : year;
      }
    }

    const dateObj = new Date(yearNum, monthNum - 1, dayNum);
    const weekdayNum = dateObj.getDay(); // 0 Sun
    const dayEn = DAY_EN[weekdayNum];
    const dayVi = DAY_VI[weekdayNum];
    const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    days.push({
      dayIndex: i,
      dayNum,
      monthNum,
      yearNum,
      dateStr,
      dayEn,
      dayVi,
      isSunday: weekdayNum === 0,
      isSaturday: weekdayNum === 6,
      isWeekend: weekdayNum === 0 || weekdayNum === 6,
      weekdayNum
    });
  }

  return days;
}

// Days in month helper
export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// Check if employee's cycle matches current view
// Định nghĩa bằng chính bộ sinh lịch để đảm bảo luôn khớp với những gì được render
export function isDateInEmployeeCycle(
  dateStr: string,
  employeeContractType: 'OFFICIAL' | 'SEASONAL',
  viewMonth: number,
  viewYear: number
): boolean {
  const days = generateCalendarDays(viewMonth, viewYear, employeeContractType);
  return days.some(d => d.dateStr === dateStr);
}
