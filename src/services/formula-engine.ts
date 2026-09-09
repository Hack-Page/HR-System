import { IEmployee, IDailyTimesheetCell } from '../types';
import { FORMULA_DEFS, buildCountBag } from './formula-defs';

export interface ITimesheetSummary {
  standardWD: number;
  actualWD: number;
  annualLeaveAL: number;
  unpaidLeaveUL: number;
  unexcusedAbsenceOff: number; // Nghỉ không phép / từ chối phép
  maternityLeaveML: number;    // Thai sản
  businessTripBT: number;      // Công tác
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
  extraBonus: number;         // Thưởng thêm
}

export interface ComputeSummaryOptions {
  diligenceRules?: { twoDaysULPenaltyPct: number; threeDaysULPenaltyPct: number };
  diligenceBaseAmount?: number;
  countOffAsUL?: boolean;     // Có tính gộp Off vào ngày xét trừ chuyên cần
  productivityBaseRate?: number;
  productivityConfig?: {
    defaultBaseRate: number;
    formula?: string;
    formulaGroup2?: string;
    probationGetsBonusGroup2?: boolean;
    deductULGroup2Rule?: 'zero' | 'same_as_diligence';
    applyLineRatesToGroup2?: boolean;
  };
  tradeUnionFee?: number;     // Mức trừ đoàn phí cấu hình
  extraBonus?: number;        // Thưởng thêm override nếu có
  lineProductivityRate?: number; // % tỷ lệ NS của chuyền
  lineQualityRate?: number;      // % tỷ lệ CL của chuyền
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
    } else if (code === 'Off' || code === 'OFF') {
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
  // Off từ bag cũng cần đảm bảo missingPunchCnt không thấp hơn Off count
  if (bag.countOff > 0) {
    let countedOff = 0;
    for (const c of cells) {
      const cd = (c.statusCode || '').trim();
      if (cd === 'Off' || cd === 'OFF') countedOff++;
    }
    if (countedOff < bag.countOff) missingPunchCnt += (bag.countOff - countedOff);
  }

  // Single source of truth via FORMULA_DEFS
  const actualWD = FORMULA_DEFS.actualWD.jsCompute(bag);
  const annualLeaveAL = FORMULA_DEFS.annualLeaveAL.jsCompute(bag);
  const unpaidLeaveUL = FORMULA_DEFS.unpaidLeaveUL.jsCompute(bag);
  const unexcusedAbsenceOff = FORMULA_DEFS.unexcusedAbsenceOff.jsCompute(bag);
  const publicHolidayPH = FORMULA_DEFS.publicHolidayPH.jsCompute(bag);
  const sickLeaveSL = FORMULA_DEFS.sickLeaveSL.jsCompute(bag);
  const specialPaidLeavePL = FORMULA_DEFS.specialPaidLeavePL.jsCompute(bag);
  const maternityLeaveML = FORMULA_DEFS.maternityLeaveML.jsCompute(bag);
  const businessTripBT = FORMULA_DEFS.businessTripBT.jsCompute(bag);
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

  // Calculate Diligence Bonus with UL & Off deductions — hệ thống hoá để custom ở Settings
  // Người dùng chốt: Off không phép và UL được cộng dồn (countOffAsUL: true mặc định)
  // Nghỉ từ 2 ngày trừ 50%, từ 3 ngày mất hoàn toàn (= 0). Các phép khác không trừ.
  const countOffAsUL = opts.countOffAsUL ?? true;
  const penalizedDays = countOffAsUL ? (unpaidLeaveUL + unexcusedAbsenceOff) : unpaidLeaveUL;

  const baseDiligence = opts.diligenceBaseAmount ?? employee.customAllowances?.diligenceBonus ?? 500000;
  let diligenceMultiplier = 1;
  const p2 = opts.diligenceRules?.twoDaysULPenaltyPct ?? 50;
  const p3 = opts.diligenceRules?.threeDaysULPenaltyPct ?? 100;

  if (penalizedDays >= 3) {
    diligenceMultiplier = Math.max(0, 1 - (p3 / 100));
  } else if (penalizedDays >= 2) {
    diligenceMultiplier = Math.max(0, 1 - (p2 / 100));
  }

  const diligenceBonus = Math.round(baseDiligence * diligenceMultiplier);

  // Tính tiền năng suất — hệ thống hoá, không khóa cứng
  // BF = productivityBaseRate: với Nhóm 2 mặc định là 1.000.000đ (hoặc defaultBaseRate/opts) nếu customAllowances chưa gắn riêng (>0)
  const baseRate = employee.productivityGroup === 2
    ? (opts.productivityBaseRate ?? (employee.customAllowances?.productivityBonus && employee.customAllowances.productivityBonus > 0 ? employee.customAllowances.productivityBonus : (opts.productivityConfig?.defaultBaseRate ?? 1000000)))
    : (opts.productivityBaseRate ?? employee.customAllowances?.productivityBonus ?? opts.productivityConfig?.defaultBaseRate ?? 1000000);
  let productivityBonus = 0;

  if (employee.productivityGroup === 2) {
    // Nhóm năng suất 2: (actualWD + annualLeaveAL) * 1.000.000 / standardWD
    // Thử việc không nhận tiền năng suất
    const isProbation = (() => {
      if (employee.probationEndDate) {
        const parts = employee.probationEndDate.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts.map(Number);
          const probEnd = new Date(y, m - 1, d, 23, 59, 59);
          return new Date() <= probEnd;
        }
      }
      return false;
    })();

    const allowProbation = opts.productivityConfig?.probationGetsBonusGroup2 ?? false;
    if (isProbation && !allowProbation) {
      productivityBonus = 0;
    } else {
      const ulRule = opts.productivityConfig?.deductULGroup2Rule ?? 'same_as_diligence';
      let ulMultiplier = 1;
      const totalUnpaid = unpaidLeaveUL + unexcusedAbsenceOff;
      if (ulRule === 'zero' && totalUnpaid > 0) {
        ulMultiplier = 0;
      } else if (ulRule === 'same_as_diligence') {
        if (totalUnpaid >= 3) ulMultiplier = 0;
        else if (totalUnpaid >= 2) ulMultiplier = Math.max(0, 1 - (p2 / 100));
      }

      if (standardWD > 0 && baseRate > 0 && ulMultiplier > 0) {
        let baseGroup2 = Math.round((actualWD + annualLeaveAL) * baseRate / standardWD);
        // Nếu có cấu hình nhân tỷ lệ % Năng suất & % Chất lượng của Line
        if (opts.productivityConfig?.applyLineRatesToGroup2) {
          const lineNS = opts.lineProductivityRate != null ? opts.lineProductivityRate / 100 : 1;
          const lineCL = opts.lineQualityRate != null ? opts.lineQualityRate / 100 : 1;
          baseGroup2 = Math.round(baseGroup2 * lineNS * lineCL);
        }
        productivityBonus = Math.round(baseGroup2 * ulMultiplier);
      } else {
        productivityBonus = 0;
      }
    }
  } else {
    // Nhóm 1 / Mặc định: AW = (AO+AP)*BF/AN
    productivityBonus = standardWD > 0 && baseRate > 0
      ? Math.round((actualWD + annualLeaveAL) * baseRate / standardWD)
      : 0;
  }

  const hazardousAllowance = employee.customAllowances?.hazardousAllowance || 0;
  const pcccAllowance = employee.customAllowances?.pcccAllowance || 0;
  const otherFees = employee.customAllowances?.otherFees || 0;

  // Đoàn phí: không khóa cứng 40.000đ, lấy từ settings hoặc customAllowances
  const defaultUnionFee = opts.tradeUnionFee ?? 40000;
  const rawUnion = employee.customAllowances?.tradeUnionFee != null
    ? employee.customAllowances.tradeUnionFee
    : -defaultUnionFee;
  const tradeUnionFee = rawUnion > 0 ? -rawUnion : rawUnion;

  const extraBonus = opts.extraBonus ?? employee.customAllowances?.extraBonus ?? 0;

  return {
    standardWD,
    actualWD,
    annualLeaveAL,
    unpaidLeaveUL,
    unexcusedAbsenceOff,
    maternityLeaveML,
    businessTripBT,
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
    tradeUnionFee,
    extraBonus
  };
}
