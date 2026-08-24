import { IEmployee, IDailyTimesheetCell } from '../types';

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

  let countW = 0;
  let countN = 0;
  let countBT = 0;
  let countW_AL = 0;
  let countW_UL = 0;
  let countAL = 0;
  let countUL = 0;
  let countAL_UL = 0;
  let countPH = 0;
  let countSL = 0;
  let countPL = 0;
  let lateEarlyMins = 0;
  let lateEarlyCnt = 0;
  let missingPunchCnt = 0;

  for (const cell of cells) {
    const code = cell.statusCode?.trim() || '';

    if (code === 'W') countW++;
    else if (code === 'N') countN++;
    else if (code === 'BT') countBT++;
    else if (code === 'W/2 AL/2') countW_AL++;
    else if (code === 'W/2 UL/2') countW_UL++;
    else if (code === 'AL') countAL++;
    else if (code === 'UL' || code === 'Off') countUL++;
    else if (code === 'AL/2 UL/2') countAL_UL++;
    else if (code === 'PH') countPH++;
    else if (code === 'SL') countSL++;
    else if (code === 'PL') countPL++;

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

  // Formula chốt công:
  // Total WD = COUNTIF("W") + COUNTIF("W/2 AL/2")*0.5 + COUNTIF("BT") + COUNTIF("N") + COUNTIF("W/2 UL/2")*0.5
  const actualWD = countW + (countW_AL * 0.5) + countBT + countN + (countW_UL * 0.5);

  // Total AL = COUNTIF("AL") + COUNTIF("W/2 AL/2")*0.5 + COUNTIF("AL/2 UL/2")*0.5
  const annualLeaveAL = countAL + (countW_AL * 0.5) + (countAL_UL * 0.5);

  // Total UL = COUNTIF("UL") + COUNTIF("W/2 UL/2")*0.5 + COUNTIF("AL/2 UL/2")*0.5
  const unpaidLeaveUL = countUL + (countW_UL * 0.5) + (countAL_UL * 0.5);

  const publicHolidayPH = countPH;
  const sickLeaveSL = countSL;
  const specialPaidLeavePL = countPL;
  const nightShiftsCount = countN;

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
