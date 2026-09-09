import { describe, it, expect } from 'vitest';
import { computeEmployeeTimesheetSummary } from './formula-engine';
import { buildCountBag, FORMULA_DEFS } from './formula-defs';
import { IEmployee, IDailyTimesheetCell } from '../types';

const mockEmployee = (overrides: Partial<IEmployee> = {}): IEmployee => ({
  employeeId: 'LEP010',
  erpId: '1013789',
  fullName: 'Trịnh Đình Tâm',
  department: 'WH',
  position: 'Warehouse Lead',
  startDate: '01/03/2022',
  contractType: 'OFFICIAL',
  shiftClassId: 'SHIFT_1',
  customAllowances: {
    pcccAllowance: 0,
    hazardousAllowance: 0,
    diligenceBonus: 500000,
    productivityBonus: 0,
    tradeUnionFee: -40000,
    otherFees: 0
  },
  annualLeaveBalance: { initialQuota: 12, usedDays: 0, remainingDays: 12 },
  status: 'ACTIVE',
  ...overrides
});

const cell = (code: string, extra: Partial<IDailyTimesheetCell> = {}): IDailyTimesheetCell => ({
  employeeId_date: `LEP010_2026-08-${String(1).padStart(2,'0')}`,
  employeeId: 'LEP010',
  date: '2026-08-01',
  dayIndex: 1,
  statusCode: code as any,
  calculatedOvertime: 0,
  month: 8,
  year: 2026,
  ...extra
});

describe('FORMULA_DEFS single source', () => {
  it('actualWD formula matches JS compute (W + N + BT + half W/2)', () => {
    const cells = [cell('W'), cell('W'), cell('N'), cell('BT'), cell('W/2 AL/2')];
    const bag = buildCountBag(cells);
    const js = FORMULA_DEFS.actualWD.jsCompute(bag);
    expect(js).toBe(2 + 1 + 1 + 0.5); // 4.5
  });

  it('annualLeaveAL counts correctly with half days', () => {
    const cells = [cell('AL'), cell('W/2 AL/2'), cell('AL/2 UL/2')];
    const bag = buildCountBag(cells);
    expect(FORMULA_DEFS.annualLeaveAL.jsCompute(bag)).toBe(1 + 0.5 + 0.5);
  });

  it('unpaidLeaveUL is separated from unexcusedAbsenceOff', () => {
    const cells = [cell('UL'), cell('Off'), cell('W/2 UL/2'), cell('ML'), cell('BT')];
    const bag = buildCountBag(cells);
    // UL riêng (có phép): 1 + 0.5 = 1.5
    expect(FORMULA_DEFS.unpaidLeaveUL.jsCompute(bag)).toBe(1.5);
    // Off riêng (không phép): 1
    expect(FORMULA_DEFS.unexcusedAbsenceOff.jsCompute(bag)).toBe(1);
    // Thai sản riêng: 1
    expect(FORMULA_DEFS.maternityLeaveML.jsCompute(bag)).toBe(1);
    // Công tác riêng: 1
    expect(FORMULA_DEFS.businessTripBT.jsCompute(bag)).toBe(1);
  });

  it('nightShifts counts N correctly', () => {
    const cells = [cell('N'), cell('N'), cell('W')];
    const bag = buildCountBag(cells);
    expect(FORMULA_DEFS.nightShiftsCount.jsCompute(bag)).toBe(2);
  });

  it('excel formulas contain CALENDAR_RANGE I:AM', () => {
    expect(FORMULA_DEFS.actualWD.excelFormula(10).formula).toContain('I10:AM10');
    expect(FORMULA_DEFS.annualLeaveAL.excelFormula(8).formula).toContain('COUNTIF');
  });
});

describe('computeEmployeeTimesheetSummary', () => {
  it('standardWD = 23 for OFFICE_M_F, 27 otherwise', () => {
    const cells: IDailyTimesheetCell[] = [];
    expect(computeEmployeeTimesheetSummary(mockEmployee({ shiftClassId: 'OFFICE_M_F' }), cells).standardWD).toBe(23);
    expect(computeEmployeeTimesheetSummary(mockEmployee({ shiftClassId: 'OFFICE_M_S' }), cells).standardWD).toBe(27);
    expect(computeEmployeeTimesheetSummary(mockEmployee({ shiftClassId: 'SHIFT_1' }), cells).standardWD).toBe(27);
    expect(computeEmployeeTimesheetSummary(mockEmployee({ shiftClassId: 'SHIFT_2' }), cells).standardWD).toBe(27);
  });

  it('diligence bonus: Off và UL được cộng dồn — 1 UL + 1 Off = 2 ngày -> trừ 50%', () => {
    const cells = [cell('UL'), cell('Off')]; // 1 UL + 1 Off
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.unpaidLeaveUL).toBe(1);
    expect(res.unexcusedAbsenceOff).toBe(1);
    expect(res.diligenceBonus).toBe(250000); // 500k * 0.5
  });

  it('diligence bonus: 3 ngày nghỉ (2 UL + 1 Off) -> mất hoàn toàn chuyên cần (= 0)', () => {
    const cells = [cell('UL'), cell('UL'), cell('Off')];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.diligenceBonus).toBe(0);
  });

  it('diligence bonus: các phép khác (AL, SL, PL, PH, ML, BT) KHÔNG bị trừ chuyên cần', () => {
    const cells = [cell('AL'), cell('AL'), cell('SL'), cell('PL'), cell('PH'), cell('ML'), cell('BT')];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.diligenceBonus).toBe(500000); // Đầy đủ 500k
  });

  it('custom diligence rules per department', () => {
    const cells = [cell('UL'), cell('UL')];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells, { twoDaysULPenaltyPct: 30, threeDaysULPenaltyPct: 80 });
    expect(res.diligenceBonus).toBe(350000); // 500k * 0.7
  });

  it('productivityGroup 2: tính đúng công thức (actualWD + annualLeaveAL) * 1.000.000 / standardWD', () => {
    const emp = mockEmployee({
      shiftClassId: 'OFFICE_M_F', // standardWD = 23
      productivityGroup: 2
    });
    // 20 ngày đi làm (W) + 3 ngày phép năm (AL) = 23 ngày
    const cells: IDailyTimesheetCell[] = [
      ...Array(20).fill(0).map((_, i) => cell('W', { dayIndex: i + 1 })),
      ...Array(3).fill(0).map((_, i) => cell('AL', { dayIndex: i + 21 }))
    ];
    const res = computeEmployeeTimesheetSummary(emp, cells);
    // (20 + 3) * 1,000,000 / 23 = 1,000,000
    expect(res.actualWD).toBe(20);
    expect(res.annualLeaveAL).toBe(3);
    expect(res.productivityBonus).toBe(1000000);
  });

  it('productivityGroup 2: nhân viên đang thử việc -> KHÔNG nhận tiền năng suất (= 0)', () => {
    const futureYear = new Date().getFullYear() + 1;
    const emp = mockEmployee({
      shiftClassId: 'OFFICE_M_F',
      productivityGroup: 2,
      probationEndDate: `31/12/${futureYear}` // đang trong thời gian thử việc
    });
    const cells: IDailyTimesheetCell[] = Array(23).fill(0).map((_, i) => cell('W', { dayIndex: i + 1 }));
    const res = computeEmployeeTimesheetSummary(emp, cells);
    expect(res.productivityBonus).toBe(0);
  });

  it('productivityGroup 2: nghỉ UL/Off từ 2 ngày -> trừ 50% tiền năng suất', () => {
    const emp = mockEmployee({
      shiftClassId: 'OFFICE_M_F', // 23 công
      productivityGroup: 2
    });
    // 21 ngày làm việc, 2 ngày UL
    const cells: IDailyTimesheetCell[] = [
      ...Array(21).fill(0).map((_, i) => cell('W', { dayIndex: i + 1 })),
      cell('UL', { dayIndex: 22 }),
      cell('UL', { dayIndex: 23 })
    ];
    const res = computeEmployeeTimesheetSummary(emp, cells);
    // base = Math.round(21 * 1000000 / 23) = 913043. Trừ 50% => Math.round(913043 * 0.5) = 456522
    expect(res.productivityBonus).toBe(456522);
  });

  it('đoàn phí động từ settings và thưởng thêm extraBonus', () => {
    const emp = mockEmployee({
      customAllowances: {
        pcccAllowance: 0,
        hazardousAllowance: 0,
        diligenceBonus: 500000,
        productivityBonus: 0,
        tradeUnionFee: -50000, // custom fee 50k
        otherFees: 0,
        extraBonus: 200000 // thưởng thêm 200k
      }
    });
    const res = computeEmployeeTimesheetSummary(emp, []);
    expect(res.tradeUnionFee).toBe(-50000);
    expect(res.extraBonus).toBe(200000);
  });

  it('lateEarlyMinutes and missingPunchCount aggregated', () => {
    const cells = [
      cell('W', { lateMinutes: 18 }),
      cell('W', { earlyMinutes: 10 }),
      cell('Off'),
      cell('W', { checkIn: '07:30', checkOut: '' } as any)
    ];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.lateEarlyMinutes).toBe(28);
    expect(res.lateEarlyCount).toBe(2);
    expect(res.missingPunchCount).toBe(2); // Off + missing checkOut
  });
});
