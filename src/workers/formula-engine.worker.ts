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

// Inline minimal FORMULA logic to keep worker self-contained (no import bundling issues)
function buildCountBag(cells: any[]) {
  const bag: any = {
    countW: 0, countN: 0, countBT: 0, countW_AL: 0, countW_UL: 0,
    countAL: 0, countUL: 0, countAL_UL: 0, countPH: 0, countSL: 0, countPL: 0, countOff: 0
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
    else if (code === 'Off') bag.countOff++;
    else if (code === 'AL/2 UL/2') bag.countAL_UL++;
    else if (code === 'PH') bag.countPH++;
    else if (code === 'SL') bag.countSL++;
    else if (code === 'PL') bag.countPL++;
  }
  bag.countUL += bag.countOff;
  return bag;
}

function computeSummary(employee: any, cells: any[], customRules?: any) {
  let standardWD = 23;
  if (employee.shiftClassId === 'OFFICE_M_S' || employee.shiftClassId === 'SHIFT_1' || employee.shiftClassId === 'SHIFT_2') {
    standardWD = 27;
  }
  const bag = buildCountBag(cells);

  let lateEarlyMins = 0;
  let lateEarlyCnt = 0;
  let missingPunchCnt = 0;
  for (const c of cells) {
    if (c.lateMinutes && c.lateMinutes > 0) { lateEarlyMins += c.lateMinutes; lateEarlyCnt++; }
    if (c.earlyMinutes && c.earlyMinutes > 0) { lateEarlyMins += c.earlyMinutes; lateEarlyCnt++; }
    if (c.statusCode === 'Off' || (c.checkIn && !c.checkOut) || (!c.checkIn && c.checkOut)) missingPunchCnt++;
  }

  const actualWD = bag.countW + (bag.countW_AL * 0.5) + bag.countBT + bag.countN + (bag.countW_UL * 0.5);
  const annualLeaveAL = bag.countAL + (bag.countW_AL * 0.5) + (bag.countAL_UL * 0.5);
  const unpaidLeaveUL = bag.countUL + (bag.countW_UL * 0.5) + (bag.countAL_UL * 0.5);
  const publicHolidayPH = bag.countPH;
  const sickLeaveSL = bag.countSL;
  const specialPaidLeavePL = bag.countPL;
  const nightShiftsCount = bag.countN;

  const baseDiligence = employee.customAllowances?.diligenceBonus ?? 500000;
  let diligenceMultiplier = 1;
  const p2 = customRules?.twoDaysULPenaltyPct ?? 50;
  const p3 = customRules?.threeDaysULPenaltyPct ?? 100;
  if (unpaidLeaveUL >= 3) diligenceMultiplier = Math.max(0, 1 - (p3 / 100));
  else if (unpaidLeaveUL >= 2) diligenceMultiplier = Math.max(0, 1 - (p2 / 100));
  const diligenceBonus = Math.round(baseDiligence * diligenceMultiplier);

  return {
    standardWD, actualWD, annualLeaveAL, unpaidLeaveUL, publicHolidayPH,
    sickLeaveSL, specialPaidLeavePL, nightShiftsCount,
    lateEarlyMinutes: lateEarlyMins, lateEarlyCount: lateEarlyCnt, missingPunchCount: missingPunchCnt,
    diligenceBonus,
    productivityBonus: employee.customAllowances?.productivityBonus || 0,
    hazardousAllowance: employee.customAllowances?.hazardousAllowance || 0,
    pcccAllowance: employee.customAllowances?.pcccAllowance || 0,
    otherFees: employee.customAllowances?.otherFees || 0,
    tradeUnionFee: employee.customAllowances?.tradeUnionFee || -40000
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
