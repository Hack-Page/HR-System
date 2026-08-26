import { describe, it, expect } from 'vitest';
import { generateCalendarDays, getDaysInMonth, isDateInEmployeeCycle } from './calendar-utils';

describe('generateCalendarDays - SEASONAL', () => {
  it('sinh đủ 31 cột cho tháng 31 ngày', () => {
    const days = generateCalendarDays(7, 2026, 'SEASONAL');
    expect(days).toHaveLength(31);
    expect(days[0].dateStr).toBe('2026-07-01');
    expect(days[30].dateStr).toBe('2026-07-31');
  });

  it('tháng 2 năm thường: phần dư lăn sang đầu tháng 3', () => {
    const days = generateCalendarDays(2, 2026, 'SEASONAL'); // 2026 không nhuận
    expect(days).toHaveLength(31);
    expect(days[0].dateStr).toBe('2026-02-01');
    expect(days[27].dateStr).toBe('2026-02-28');
    expect(days[28].dateStr).toBe('2026-03-01');
    expect(days[30].dateStr).toBe('2026-03-03');
  });

  it('mỗi ngày đều có thứ trong tuần đúng với lịch thật', () => {
    // 2026-08-01 là thứ Bảy
    const days = generateCalendarDays(8, 2026, 'SEASONAL');
    expect(days[0].dayVi).toBe('T7');
    expect(days[0].isWeekend).toBe(true);
  });
});

describe('generateCalendarDays - OFFICIAL (chu kỳ 21->20)', () => {
  it('tháng 3/2026: bắt đầu 21/02 và KHÔNG sinh ngày 29-31/02 không tồn tại', () => {
    const days = generateCalendarDays(3, 2026, 'OFFICIAL');
    expect(days).toHaveLength(31);

    const dateStrs = days.map(d => d.dateStr);
    // Không còn các ngày ma từng bị sinh sai trước đây
    expect(dateStrs).not.toContain('2026-02-29');
    expect(dateStrs).not.toContain('2026-02-30');
    expect(dateStrs).not.toContain('2026-02-31');

    // Đầu chu kỳ 21/02 -> hết 28/02 rồi sang 01/03
    expect(dateStrs[0]).toBe('2026-02-21');
    expect(dateStrs[1]).toBe('2026-02-22');
    expect(dateStrs[7]).toBe('2026-02-28');
    expect(dateStrs[8]).toBe('2026-03-01');

    // Kết thúc chu kỳ 20/03
    expect(dateStrs).toContain('2026-03-20');
  });

  it('tháng sau tháng 31 ngày: 11 cột tháng trước + 20 cột tháng này', () => {
    const days = generateCalendarDays(8, 2026, 'OFFICIAL'); // tháng 7 có 31 ngày
    expect(days[0].dateStr).toBe('2026-07-21');
    expect(days[10].dateStr).toBe('2026-07-31');
    expect(days[11].dateStr).toBe('2026-08-01');
    expect(days[30].dateStr).toBe('2026-08-20');
  });

  it('weekday khớp ngày thật ở ranh giới tháng (không lệch do Date roll-over)', () => {
    const days = generateCalendarDays(3, 2026, 'OFFICIAL');
    // 2026-02-21 theo lịch thật là thứ Bảy
    const feb21 = days.find(d => d.dateStr === '2026-02-21')!;
    expect(feb21.dayVi).toBe('T7');
    expect(feb21.isWeekend).toBe(true);
    // 2026-03-01 là Chủ Nhật
    const mar1 = days.find(d => d.dateStr === '2026-03-01')!;
    expect(mar1.dayVi).toBe('CN');
    expect(mar1.isSunday).toBe(true);
  });

  it('chu kỳ tháng 1 quay về tháng 12 năm trước', () => {
    const days = generateCalendarDays(1, 2027, 'OFFICIAL');
    expect(days[0].dateStr).toBe('2026-12-21');
    expect(days.some(d => d.dateStr === '2027-01-20')).toBe(true);
  });
});

describe('getDaysInMonth', () => {
  it('tính đúng độ dài tháng', () => {
    expect(getDaysInMonth(2, 2026)).toBe(28);
    expect(getDaysInMonth(2, 2028)).toBe(29); // nhuận
    expect(getDaysInMonth(4, 2026)).toBe(30);
    expect(getDaysInMonth(7, 2026)).toBe(31);
  });
});

describe('isDateInEmployeeCycle - khớp tuyệt đối với bộ sinh lịch', () => {
  it('ngày lăn sang tháng sau của SEASONAL vẫn tính thuộc kỳ', () => {
    expect(isDateInEmployeeCycle('2026-03-01', 'SEASONAL', 2, 2026)).toBe(true);
    expect(isDateInEmployeeCycle('2026-03-05', 'SEASONAL', 2, 2026)).toBe(false);
  });

  it('OFFICIAL chấp nhận 21 tháng trước và 20 tháng này', () => {
    expect(isDateInEmployeeCycle('2026-02-21', 'OFFICIAL', 3, 2026)).toBe(true);
    expect(isDateInEmployeeCycle('2026-03-15', 'OFFICIAL', 3, 2026)).toBe(true);
    expect(isDateInEmployeeCycle('2026-02-15', 'OFFICIAL', 3, 2026)).toBe(false);
  });
});
