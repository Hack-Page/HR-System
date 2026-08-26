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

  it('unpaidLeaveUL includes Off and half days', () => {
    const cells = [cell('UL'), cell('Off'), cell('W/2 UL/2')];
    const bag = buildCountBag(cells);
    // Off merged into UL => 2 + 0.5
    expect(FORMULA_DEFS.unpaidLeaveUL.jsCompute(bag)).toBe(2.5);
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

  it('diligence bonus 50% penalty when UL >=2', () => {
    const cells = [cell('UL'), cell('UL')]; // 2 UL
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.diligenceBonus).toBe(250000); // 500k *0.5
    expect(res.unpaidLeaveUL).toBe(2);
  });

  it('diligence bonus 100% penalty when UL >=3', () => {
    const cells = [cell('UL'), cell('UL'), cell('UL')];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells);
    expect(res.diligenceBonus).toBe(0);
  });

  it('custom diligence rules per department', () => {
    const cells = [cell('UL'), cell('UL')];
    const res = computeEmployeeTimesheetSummary(mockEmployee(), cells, { twoDaysULPenaltyPct: 30, threeDaysULPenaltyPct: 80 });
    expect(res.diligenceBonus).toBe(350000); // 500k *0.7
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
