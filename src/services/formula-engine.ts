import { IEmployee, IDailyTimesheetCell } from '../types';
import { FORMULA_DEFS, buildCountBag } from './formula-defs';

export interface ITimesheetSummary {
  standardWD: number;
  actualWD: number;
  annualLeaveAL: number;
  unpaidLeaveUL: number;
  publicHolidayPH: number;
  sickLeaveSL: number;
  specialPaidLeavePL: number;
  nightShiftsCount: number;
  lateEarlyMinutes: number;
  lateEarlyCount: number;
  missingPunchCount: number;
  diligenceBonus: number;
  productivityBonus: number;
  hazardousAllowance: number;
  pcccAllowance: number;
  otherFees: number;
  tradeUnionFee: number;
}

export function computeEmployeeTimesheetSummary(
  employee: IEmployee,
  cells: IDailyTimesheetCell[],
  customDiligenceRules?: { twoDaysULPenaltyPct: number; threeDaysULPenaltyPct: number }
): ITimesheetSummary {
  // Standard WD
  let standardWD = 23;
  if (employee.shiftClassId === 'OFFICE_M_S' || employee.shiftClassId === 'SHIFT_1' || employee.shiftClassId === 'SHIFT_2') {
    standardWD = 27;
  }

  const bag = buildCountBag(cells);

  let lateEarlyMins = 0;
  let lateEarlyCnt = 0;
  let missingPunchCnt = 0;

  for (const cell of cells) {
    const code = cell.statusCode?.trim() || '';
    if (cell.lateMinutes && cell.lateMinutes > 0) {
      lateEarlyMins += cell.lateMinutes;
      lateEarlyCnt++;
    }
    if (cell.earlyMinutes && cell.earlyMinutes > 0) {
      lateEarlyMins += cell.earlyMinutes;
      lateEarlyCnt++;
    }
    if (code === 'Off' || (cell.checkIn && !cell.checkOut) || (!cell.checkIn && cell.checkOut)) {
      missingPunchCnt++;
    }
  }

  // Single source of truth via FORMULA_DEFS
  const actualWD = FORMULA_DEFS.actualWD.jsCompute(bag);
  const annualLeaveAL = FORMULA_DEFS.annualLeaveAL.jsCompute(bag);
  const unpaidLeaveUL = FORMULA_DEFS.unpaidLeaveUL.jsCompute(bag);
  const publicHolidayPH = FORMULA_DEFS.publicHolidayPH.jsCompute(bag);
  const sickLeaveSL = FORMULA_DEFS.sickLeaveSL.jsCompute(bag);
  const specialPaidLeavePL = FORMULA_DEFS.specialPaidLeavePL.jsCompute(bag);
  const nightShiftsCount = FORMULA_DEFS.nightShiftsCount.jsCompute(bag);

  // Calculate Diligence Bonus with UL deductions
  // Ground truth formula from sheet Thai san:
  // =(AO+AP)*(500000*(1-IF(COUNTIF("UL")>=2, IF(COUNTIF("UL")>=3, 1, 0.5), 0))) / StandardWD
  const baseDiligence = employee.customAllowances?.diligenceBonus ?? 500000;
  let diligenceMultiplier = 1;
  const p2 = customDiligenceRules?.twoDaysULPenaltyPct ?? 50;
  const p3 = customDiligenceRules?.threeDaysULPenaltyPct ?? 100;

  if (unpaidLeaveUL >= 3) {
    diligenceMultiplier = Math.max(0, 1 - (p3 / 100));
  } else if (unpaidLeaveUL >= 2) {
    diligenceMultiplier = Math.max(0, 1 - (p2 / 100));
  }

  // Prorated by actual work days if applicable
  const diligenceBonus = Math.round(baseDiligence * diligenceMultiplier);

  const hazardousAllowance = employee.customAllowances?.hazardousAllowance || 0;
  const pcccAllowance = employee.customAllowances?.pcccAllowance || 0;
  const productivityBonus = employee.customAllowances?.productivityBonus || 0;
  const otherFees = employee.customAllowances?.otherFees || 0;
  const tradeUnionFee = employee.customAllowances?.tradeUnionFee || -40000;

  return {
    standardWD,
    actualWD,
    annualLeaveAL,
    unpaidLeaveUL,
    publicHolidayPH,
    sickLeaveSL,
    specialPaidLeavePL,
    nightShiftsCount,
    lateEarlyMinutes: lateEarlyMins,
    lateEarlyCount: lateEarlyCnt,
    missingPunchCount: missingPunchCnt,
    diligenceBonus,
    productivityBonus,
    hazardousAllowance,
    pcccAllowance,
    otherFees,
    tradeUnionFee
  };
}
