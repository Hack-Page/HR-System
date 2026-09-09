/**
 * Formula Engine Worker - Chạy tính toán 31-day matrix off main thread
 * Đảm bảo UI 60fps khi xử lý hàng nghìn ô công thức
 * Sử dụng FORMULA_DEFS single source (inline để worker độc lập)
 */

export interface FormulaWorkerRequest {
  type: 'COMPUTE_SUMMARIES';
  payload: {
    employees: any[];
    timesheets: any[];
    diligenceRules?: { twoDaysULPenaltyPct: number; threeDaysULPenaltyPct: number };
  };
}

export interface FormulaWorkerProgress {
  type: 'PROGRESS';
  progress: number;
  message: string;
}

export interface FormulaWorkerResult {
  type: 'COMPLETE';
  summaries: Record<string, any>; // employeeId -> summary
  totalProcessed: number;
}

export interface FormulaWorkerError {
  type: 'ERROR';
  error: string;
}

// Inline FORMULA logic đồng bộ 100% với formula-defs.ts & formula-engine.ts
function buildCountBag(cells: any[]) {
  const bag: any = {
    countW: 0, countN: 0, countBT: 0, countW_AL: 0, countW_UL: 0,
    countAL: 0, countUL: 0, countAL_UL: 0, countPH: 0, countSL: 0, countPL: 0, countOff: 0,
    countML: 0, countLA: 0, countED: 0, countMCO: 0, countMCI: 0,
    fractionalW: 0, fractionalAL: 0, fractionalUL: 0, fractionalSL: 0, fractionalPL: 0
  };
  for (const cell of cells) {
    const code = cell.statusCode?.trim() || '';
    if (code === 'W') bag.countW++;
    else if (code === 'N') bag.countN++;
    else if (code === 'BT') bag.countBT++;
    else if (code === 'W/2 AL/2') bag.countW_AL++;
    else if (code === 'W/2 UL/2') bag.countW_UL++;
    else if (code === 'AL') bag.countAL++;
    else if (code === 'UL') bag.countUL++;
    else if (code === 'Off' || code === 'OFF') bag.countOff++;
    else if (code === 'AL/2 UL/2') bag.countAL_UL++;
    else if (code === 'PH') bag.countPH++;
    else if (code === 'SL') bag.countSL++;
    else if (code === 'PL') bag.countPL++;
    else if (code === 'LA') bag.countLA++;
    else if (code === 'ED') bag.countED++;
    else if (code === 'MCO') bag.countMCO++;
    else if (code === 'MCI') bag.countMCI++;
    else if (code === 'ML' || code === 'MATERNITY LEAVE' || code === 'TS') bag.countML++;
    else {
      const customMatch = code.match(/^W(\d+)\/([A-Z]+)(\d+)$/i);
      if (customMatch) {
        const wH = parseFloat(customMatch[1]);
        const lType = customMatch[2].toUpperCase();
        const lH = parseFloat(customMatch[3]);
        const totalH = (wH + lH) > 0 ? (wH + lH) : 8;
        bag.fractionalW += wH / totalH;
        if (lType === 'AL') bag.fractionalAL += lH / totalH;
        else if (lType === 'UL') bag.fractionalUL += lH / totalH;
        else if (lType === 'SL') bag.fractionalSL += lH / totalH;
        else if (lType === 'PL') bag.fractionalPL += lH / totalH;
      }
    }
  }
  return bag;
}

function computeSummary(employee: any, cells: any[], customRules?: any, options?: any) {
  let standardWD = 23;
  if (employee.shiftClassId === 'OFFICE_M_S' || employee.shiftClassId === 'SHIFT_1' || employee.shiftClassId === 'SHIFT_2') {
    standardWD = 27;
  }
  const bag = buildCountBag(cells);

  let lateEarlyMins = 0;
  let lateEarlyCnt = 0;
  let missingPunchCnt = 0;
  let lateArrivalCount = 0;
  let earlyDepartureCount = 0;
  let missingClockOutCount = 0;
  let missingClockInCount = 0;

  for (const c of cells) {
    const code = c.statusCode?.trim() || '';
    if (c.lateMinutes && c.lateMinutes > 0) { lateEarlyMins += c.lateMinutes; lateEarlyCnt++; }
    if (c.earlyMinutes && c.earlyMinutes > 0) { lateEarlyMins += c.earlyMinutes; lateEarlyCnt++; }
    if (code === 'LA') lateArrivalCount++;
    else if (code === 'ED') earlyDepartureCount++;
    else if (code === 'MCO') { missingClockOutCount++; missingPunchCnt++; }
    else if (code === 'MCI') { missingClockInCount++; missingPunchCnt++; }
    else if (code === 'Off' || code === 'OFF') missingPunchCnt++;
    else {
      if (c.checkIn && !c.checkOut) { missingClockOutCount++; missingPunchCnt++; }
      else if (!c.checkIn && c.checkOut) { missingClockInCount++; missingPunchCnt++; }
    }
  }

  const actualWD = bag.countW + (bag.countW_AL * 0.5) + bag.countBT + bag.countN + (bag.countW_UL * 0.5) + (bag.fractionalW || 0);
  const annualLeaveAL = bag.countAL + (bag.countW_AL * 0.5) + (bag.countAL_UL * 0.5) + (bag.fractionalAL || 0);
  const unpaidLeaveUL = bag.countUL + (bag.countW_UL * 0.5) + (bag.countAL_UL * 0.5) + (bag.fractionalUL || 0);
  const unexcusedAbsenceOff = bag.countOff;
  const publicHolidayPH = bag.countPH;
  const sickLeaveSL = bag.countSL + (bag.fractionalSL || 0);
  const specialPaidLeavePL = bag.countPL + (bag.fractionalPL || 0);
  const nightShiftsCount = bag.countN;
  const maternityLeaveML = bag.countML;
  const businessTripBT = bag.countBT;

  // Diligence: xét trừ cộng dồn Off & UL
  const penalizedDays = unpaidLeaveUL + unexcusedAbsenceOff;
  const baseDiligence = employee.customAllowances?.diligenceBonus ?? 500000;
  let diligenceMultiplier = 1;
  const p2 = customRules?.twoDaysULPenaltyPct ?? 50;
  const p3 = customRules?.threeDaysULPenaltyPct ?? 100;
  if (penalizedDays >= 3) diligenceMultiplier = Math.max(0, 1 - (p3 / 100));
  else if (penalizedDays >= 2) diligenceMultiplier = Math.max(0, 1 - (p2 / 100));
  const diligenceBonus = Math.round(baseDiligence * diligenceMultiplier);

  // Productivity bonus
  const baseRate = employee.productivityGroup === 2
    ? (employee.customAllowances?.productivityBonus && employee.customAllowances.productivityBonus > 0 ? employee.customAllowances.productivityBonus : 1000000)
    : (employee.customAllowances?.productivityBonus ?? 1000000);
  let productivityBonus = 0;
  if (employee.productivityGroup === 2) {
    const isProbation = (() => {
      if (employee.probationEndDate) {
        const s = employee.probationEndDate;
        const clean = s.split('T')[0].split(' ')[0].trim();
        let probEnd: Date | null = null;
        if (clean.includes('/')) {
          const [d, m, y] = clean.split('/').map(Number);
          if (d && m && y) probEnd = new Date(y, m - 1, d, 23, 59, 59);
        } else if (clean.includes('-')) {
          const parts = clean.split('-').map(Number);
          if (parts.length === 3) {
            if (parts[0] > 1000) probEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
            else probEnd = new Date(parts[2], parts[1] - 1, parts[0], 23, 59, 59);
          }
        }
        if (probEnd) return new Date() <= probEnd;
      }
      return false;
    })();

    if (standardWD > 0 && baseRate > 0 && !isProbation) {
      let ulMul = 1;
      if (penalizedDays >= 3) ulMul = 0;
      else if (penalizedDays >= 2) ulMul = Math.max(0, 1 - (p2 / 100));
      productivityBonus = Math.round(((actualWD + annualLeaveAL) * baseRate / standardWD) * ulMul);
    }
  } else {
    productivityBonus = standardWD > 0 && baseRate > 0
      ? Math.round((actualWD + annualLeaveAL) * baseRate / standardWD)
      : 0;
  }

  const rawUnion = employee.customAllowances?.tradeUnionFee != null
    ? employee.customAllowances.tradeUnionFee
    : -40000;
  const tradeUnionFee = rawUnion > 0 ? -rawUnion : rawUnion;

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
    hazardousAllowance: employee.customAllowances?.hazardousAllowance || 0,
    pcccAllowance: employee.customAllowances?.pcccAllowance || 0,
    otherFees: employee.customAllowances?.otherFees || 0,
    tradeUnionFee,
    extraBonus: employee.customAllowances?.extraBonus || 0
  };
}

self.onmessage = async (e: MessageEvent<FormulaWorkerRequest>) => {
  try {
    const { type, payload } = e.data;
    if (type !== 'COMPUTE_SUMMARIES') return;

    const { employees, timesheets, diligenceRules } = payload;
    const total = employees.length;

    (self as any).postMessage({
      type: 'PROGRESS',
      progress: 10,
      message: `Đang tính toán ${total} nhân viên x 31 ngày...`
    } as FormulaWorkerProgress);

    // Build map: employeeId -> cells
    const map = new Map<string, any[]>();
    for (const ts of timesheets) {
      if (!map.has(ts.employeeId)) map.set(ts.employeeId, []);
      map.get(ts.employeeId)!.push(ts);
    }

    const summaries: Record<string, any> = {};
    const chunkSize = 20;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const cells = map.get(emp.employeeId) || [];
      summaries[emp.employeeId] = computeSummary(emp, cells, diligenceRules);

      if (i % chunkSize === 0 || i === total - 1) {
        const pct = Math.round(10 + (i / total) * 85);
        (self as any).postMessage({
          type: 'PROGRESS',
          progress: pct,
          message: `Đã xử lý ${i + 1}/${total} nhân viên...`
        } as FormulaWorkerProgress);
      }
    }

    (self as any).postMessage({
      type: 'COMPLETE',
      summaries,
      totalProcessed: total
    } as FormulaWorkerResult);

  } catch (err: any) {
    (self as any).postMessage({
      type: 'ERROR',
      error: err.message || 'Lỗi formula engine worker'
    } as FormulaWorkerError);
  }
};
