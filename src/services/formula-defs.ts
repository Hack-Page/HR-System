import { AttendanceStatusCode } from '../types';

/**
 * FORMULA_DEFS – Single Source of Truth cho mọi công thức chốt công
 * Đồng bộ giữa JS runtime (formula-engine) và Excel COUNTIF formulas (excel-exporter)
 * Đối chiếu 100% file KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx (58 cột)
 */

export type FormulaKey = 
  | 'actualWD'      // Total WD - Cột 41
  | 'annualLeaveAL' // Total AL - Cột 42
  | 'unpaidLeaveUL' // Total UL - Cột 43
  | 'publicHolidayPH' // Total PH - Cột 44
  | 'sickLeaveSL'   // Total SL - Cột 45
  | 'specialPaidLeavePL' // Total PL - Cột 46
  | 'nightShiftsCount' // Cột 47
  | 'lateEarly';

export interface FormulaDef {
  key: FormulaKey;
  label: string;        // Tiếng Việt
  labelEn: string;      // English
  excelHeader: string;  // Header bilingual cho Excel
  colIndex: number;     // 40-based index trong Excel (40=StandardWD, 41=ActualWD...)
  jsCompute: (counts: CountBag) => number;
  excelFormula: (rowNum: number) => { formula: string; columnLetterRange: string };
  description: string;
}

export interface CountBag {
  countW: number;
  countN: number;
  countBT: number;
  countW_AL: number;
  countW_UL: number;
  countAL: number;
  countUL: number;
  countAL_UL: number;
  countPH: number;
  countSL: number;
  countPL: number;
  countOff: number;
  // Mã vi phạm chấm công mới (chỉ đếm để thống kê, không ảnh hưởng công thức cũ)
  countLA: number;   // Late Arrival - Đi trễ <30p (tính vẫn là W nhưng tách riêng để theo dõi)
  countED: number;   // Early Departure - Về sớm <30p
  countMCO: number;  // Missing Clock-Out
  countMCI: number;  // Missing Clock-In
}

// Helper: Tính CountBag từ cells
export function buildCountBag(cells: { statusCode: AttendanceStatusCode }[]): CountBag {
  const bag: CountBag = {
    countW: 0, countN: 0, countBT: 0, countW_AL: 0, countW_UL: 0,
    countAL: 0, countUL: 0, countAL_UL: 0, countPH: 0, countSL: 0, countPL: 0, countOff: 0,
    countLA: 0, countED: 0, countMCO: 0, countMCI: 0
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
    else if (code === 'LA') bag.countLA++;
    else if (code === 'ED') bag.countED++;
    else if (code === 'MCO') bag.countMCO++;
    else if (code === 'MCI') bag.countMCI++;
  }
  // Off được tính như UL trong công thức chốt công
  bag.countUL += bag.countOff;
  // LA/ED vẫn tính như W trong công thực tế? Giữ nguyên logic cũ: LA/ED = W về mặt công, nhưng tách riêng để theo dõi trễ/sớm
  // Để không làm vỡ công thức 58 cột, LA/ED không cộng vào actualWD mặc định, nhưng sẽ thống kê riêng ở dashboard vi phạm.
  // Nếu muốn LA/ED tính như W, có thể cộng: bag.countW += bag.countLA + bag.countED (bỏ comment dòng dưới nếu yêu cầu)
  return bag;
}

// Excel column letters: I=9 .. AM=39  (31 ngày: I:AM)
export const CALENDAR_RANGE = 'I:AM';
export const CALENDAR_START_COL = 'I';
export const CALENDAR_END_COL = 'AM';

export const FORMULA_DEFS: Record<FormulaKey, FormulaDef> = {
  actualWD: {
    key: 'actualWD',
    label: 'Công thực tế',
    labelEn: 'Actual Working Days',
    excelHeader: 'Total WD\nCông thực tế',
    colIndex: 41,
    jsCompute: (c) => c.countW + (c.countW_AL * 0.5) + c.countBT + c.countN + (c.countW_UL * 0.5),
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"W")+COUNTIF(I${r}:AM${r},"W/2 AL/2")*0.5+COUNTIF(I${r}:AM${r},"BT")+COUNTIF(I${r}:AM${r},"N")+COUNTIF(I${r}:AM${r},"W/2 UL/2")*0.5`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"W") + COUNTIF(I:AM,"W/2 AL/2")*0.5 + COUNTIF(I:AM,"BT") + COUNTIF(I:AM,"N") + COUNTIF(I:AM,"W/2 UL/2")*0.5'
  },
  annualLeaveAL: {
    key: 'annualLeaveAL',
    label: 'Phép năm (AL)',
    labelEn: 'Annual Leave',
    excelHeader: 'Total AL\nPhép năm',
    colIndex: 42,
    jsCompute: (c) => c.countAL + (c.countW_AL * 0.5) + (c.countAL_UL * 0.5),
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"AL")+COUNTIF(I${r}:AM${r},"W/2 AL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"AL") + COUNTIF(I:AM,"W/2 AL/2")*0.5 + COUNTIF(I:AM,"AL/2 UL/2")*0.5'
  },
  unpaidLeaveUL: {
    key: 'unpaidLeaveUL',
    label: 'Không lương (UL)',
    labelEn: 'Unpaid Leave',
    excelHeader: 'Total UL\nKhông lương',
    colIndex: 43,
    // Lưu ý: UL bao gồm cả Off (vắng không quẹt thẻ) đã merge ở buildCountBag
    jsCompute: (c) => c.countUL + (c.countW_UL * 0.5) + (c.countAL_UL * 0.5),
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"UL")+COUNTIF(I${r}:AM${r},"Off")+COUNTIF(I${r}:AM${r},"W/2 UL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"UL") + COUNTIF(I:AM,"Off") + COUNTIF(I:AM,"W/2 UL/2")*0.5 + COUNTIF(I:AM,"AL/2 UL/2")*0.5'
  },
  publicHolidayPH: {
    key: 'publicHolidayPH',
    label: 'Nghỉ lễ (PH)',
    labelEn: 'Public Holiday',
    excelHeader: 'Total PH\nNghỉ lễ',
    colIndex: 44,
    jsCompute: (c) => c.countPH,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"PH")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"PH")'
  },
  sickLeaveSL: {
    key: 'sickLeaveSL',
    label: 'Nghỉ ốm (SL)',
    labelEn: 'Sick Leave',
    excelHeader: 'Total SL\nNghỉ ốm',
    colIndex: 45,
    jsCompute: (c) => c.countSL,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"SL")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"SL")'
  },
  specialPaidLeavePL: {
    key: 'specialPaidLeavePL',
    label: 'Phép chế độ (PL)',
    labelEn: 'Special Paid Leave',
    excelHeader: 'Total PL\nPhép chế độ',
    colIndex: 46,
    jsCompute: (c) => c.countPL,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"PL")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"PL")'
  },
  nightShiftsCount: {
    key: 'nightShiftsCount',
    label: 'Ca đêm (N)',
    labelEn: 'Night Shifts',
    excelHeader: 'Số ngày làm ban đêm\nNight Shifts',
    colIndex: 47,
    jsCompute: (c) => c.countN,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"N")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"N")'
  },
  lateEarly: {
    key: 'lateEarly',
    label: 'Đi trễ về sớm',
    labelEn: 'Late/Early',
    excelHeader: 'Đi trễ về sớm\nLate/Early',
    colIndex: 48,
    jsCompute: () => 0, // Tính riêng từ lateMinutes/earlyMinutes, không từ COUNTIF
    excelFormula: () => ({ formula: '', columnLetterRange: '' }),
    description: 'Tổng phút đi trễ + về sớm'
  }
};

// Diligence formula metadata (không phải COUNTIF mà là logic JS)
export const DILIGENCE_FORMULA = {
  description: 'baseDiligence * (1 - penalty%) với penalty 50% nếu UL>=2, 100% nếu UL>=3',
  excelFormulaExample: '=500000*(1-IF(COUNTIF(I:AM,"UL")+COUNTIF(I:AM,"Off")>=3,1,IF(COUNTIF(I:AM,"UL")+COUNTIF(I:AM,"Off")>=2,0.5,0)))',
  appliesTo: 'diligenceBonus'
} as const;
