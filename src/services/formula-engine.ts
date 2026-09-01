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
  // Thống kê chi tiết vi phạm mới
  lateArrivalCount: number;   // LA
  earlyDepartureCount: number; // ED
  missingClockOutCount: number; // MCO
  missingClockInCount: number; // MCI
  diligenceBonus: number;
  productivityBonus: number;
  hazardousAllowance: number;
  pcccAllowance: number;
  otherFees: number;
  tradeUnionFee: number;
}

export interface ComputeSummaryOptions {
  diligenceRules?: { twoDaysULPenaltyPct: number; threeDaysULPenaltyPct: number };
  diligenceBaseAmount?: number;
  productivityBaseRate?: number;
  productivityConfig?: { defaultBaseRate: number; formula: string };
}

export function computeEmployeeTimesheetSummary(
  employee: IEmployee,
  cells: IDailyTimesheetCell[],
  customDiligenceRules?: { twoDaysULPenaltyPct: number; threeDaysULPenaltyPct: number } | ComputeSummaryOptions,
  diligenceBaseOverride?: number,
  productivityBaseOverride?: number
): ITimesheetSummary {
  // Standard WD
  let standardWD = 23;
  if (employee.shiftClassId === 'OFFICE_M_S' || employee.shiftClassId === 'SHIFT_1' || employee.shiftClassId === 'SHIFT_2') {
    standardWD = 27;
  }

  const bag = buildCountBag(cells);

  let lateEarlyMins = 0;
  let lateEarlyCnt = 0;
  let lateArrivalCount = 0;
  let earlyDepartureCount = 0;
  let missingClockOutCount = 0;
  let missingClockInCount = 0;
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
    if (code === 'LA') {
      lateArrivalCount++;
    } else if (code === 'ED') {
      earlyDepartureCount++;
    } else if (code === 'MCO') {
      missingClockOutCount++;
      missingPunchCnt++;
    } else if (code === 'MCI') {
      missingClockInCount++;
      missingPunchCnt++;
    } else if (code === 'Off') {
      missingPunchCnt++;
    } else {
      // Fallback thiếu quẹt không có mã chuẩn nhưng có 1 bên quẹt
      if (cell.checkIn && !cell.checkOut) {
        missingClockOutCount++;
        missingPunchCnt++;
      } else if (!cell.checkIn && cell.checkOut) {
        missingClockInCount++;
        missingPunchCnt++;
      }
    }
  }
  // Đồng bộ với bag (đảm bảo không lệch nếu cell mới thêm sau khi buildCountBag)
  lateArrivalCount = Math.max(lateArrivalCount, bag.countLA);
  earlyDepartureCount = Math.max(earlyDepartureCount, bag.countED);
  // MCO/MCI từ bag có thể lớn hơn đã đếm nếu có cell Off/missing chưa qua loop MCO/MCI chuẩn
  // Nếu bag có MCO/MCI nhiều hơn, bổ sung vào tổng missingPunchCnt
  if (bag.countMCO > missingClockOutCount) {
    const diff = bag.countMCO - missingClockOutCount;
    missingClockOutCount = bag.countMCO;
    missingPunchCnt += diff;
  }
  if (bag.countMCI > missingClockInCount) {
    const diff = bag.countMCI - missingClockInCount;
    missingClockInCount = bag.countMCI;
    missingPunchCnt += diff;
  }
  // Off từ bag cũng cần đảm bảo missingPunchCnt không thấp hơn Off count (trường hợp Off không qua loop trên? nhưng đã qua)
  if (bag.countOff > 0) {
    // đếm lại Off chính xác từ bag nếu loop chưa đủ (ví dụ cell Off bị bỏ vì code !== Off? nhưng đã đếm)
    // Đảm bảo tổng missingPunch không nhỏ hơn countOff + MCO+MCI
    const expectedMin = bag.countOff + bag.countMCO + bag.countMCI;
    // Nhưng loop đã đếm Off cho từng cell, nên nếu thiếu thì bù
    let countedOff = 0;
    for (const c of cells) if ((c.statusCode || '').trim() === 'Off') countedOff++;
    if (countedOff < bag.countOff) missingPunchCnt += (bag.countOff - countedOff);
  }

  // Single source of truth via FORMULA_DEFS
  const actualWD = FORMULA_DEFS.actualWD.jsCompute(bag);
  const annualLeaveAL = FORMULA_DEFS.annualLeaveAL.jsCompute(bag);
  const unpaidLeaveUL = FORMULA_DEFS.unpaidLeaveUL.jsCompute(bag);
  const publicHolidayPH = FORMULA_DEFS.publicHolidayPH.jsCompute(bag);
  const sickLeaveSL = FORMULA_DEFS.sickLeaveSL.jsCompute(bag);
  const specialPaidLeavePL = FORMULA_DEFS.specialPaidLeavePL.jsCompute(bag);
  const nightShiftsCount = FORMULA_DEFS.nightShiftsCount.jsCompute(bag);

  // Resolve options compat (legacy 3rd param was {p2,p3} directly)
  let opts: ComputeSummaryOptions = {};
  if (customDiligenceRules && typeof (customDiligenceRules as any).twoDaysULPenaltyPct === 'number' && !('diligenceRules' in (customDiligenceRules as any))) {
    opts.diligenceRules = customDiligenceRules as any;
    if (typeof diligenceBaseOverride === 'number') opts.diligenceBaseAmount = diligenceBaseOverride;
    if (typeof productivityBaseOverride === 'number') opts.productivityBaseRate = productivityBaseOverride;
  } else if (customDiligenceRules && typeof customDiligenceRules === 'object') {
    opts = customDiligenceRules as ComputeSummaryOptions;
  }

  // Calculate Diligence Bonus with UL deductions — hệ thống hoá để custom ở Settings
  // Excel gốc: =500000*(1-IF(COUNTIF(J13:AM13,"UL")>=2,IF(COUNTIF(J13:AM13,"UL")>=3,1,0.5),0))
  // BaseAmount lấy từ Settings.diligenceBonusConfig.baseAmount hoặc per-employee customAllowances.diligenceBonus
  const baseDiligence = opts.diligenceBaseAmount ?? employee.customAllowances?.diligenceBonus ?? 500000;
  let diligenceMultiplier = 1;
  const p2 = opts.diligenceRules?.twoDaysULPenaltyPct ?? 50;
  const p3 = opts.diligenceRules?.threeDaysULPenaltyPct ?? 100;

  if (unpaidLeaveUL >= 3) {
    diligenceMultiplier = Math.max(0, 1 - (p3 / 100));
  } else if (unpaidLeaveUL >= 2) {
    diligenceMultiplier = Math.max(0, 1 - (p2 / 100));
  }

  const diligenceBonus = Math.round(baseDiligence * diligenceMultiplier);

  // Tính tiền năng suất AW = (AO+AP)*BF/AN — hệ thống hoá, không khóa cứng
  // BF = productivityBaseRate: lấy per-employee productivityBonus làm baseRate, fallback Settings.defaultBaseRate
  const baseRate = opts.productivityBaseRate ?? employee.customAllowances?.productivityBonus ?? opts.productivityConfig?.defaultBaseRate ?? 1000000;
  // Nếu baseRate=0 (NV không có thưởng năng suất) thì AW=0, không chia
  const productivityBonus = standardWD > 0 && baseRate > 0
    ? Math.round((actualWD + annualLeaveAL) * baseRate / standardWD)
    : 0;

  const hazardousAllowance = employee.customAllowances?.hazardousAllowance || 0;
  const pcccAllowance = employee.customAllowances?.pcccAllowance || 0;
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
    lateArrivalCount,
    earlyDepartureCount,
    missingClockOutCount,
    missingClockInCount,
    diligenceBonus,
    productivityBonus,
    hazardousAllowance,
    pcccAllowance,
    otherFees,
    tradeUnionFee
  };
}
