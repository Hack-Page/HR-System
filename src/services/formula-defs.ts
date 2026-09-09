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
  | 'unexcusedAbsenceOff' // Total Off - Nghỉ không phép / từ chối phép
  | 'publicHolidayPH' // Total PH - Cột 44
  | 'sickLeaveSL'   // Total SL - Cột 45
  | 'specialPaidLeavePL' // Total PL - Cột 46
  | 'maternityLeaveML'   // Thai sản (ML/TS)
  | 'businessTripBT'     // Công tác (BT/CT)
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
  countML: number;   // Nghỉ thai sản
  // Mã vi phạm chấm công mới (chỉ đếm để thống kê, không ảnh hưởng công thức cũ)
  countLA: number;   // Late Arrival - Đi trễ 2p đến <60p
  countED: number;   // Early Departure - Về sớm 2p đến <60p
  countMCO: number;  // Missing Clock-Out
  countMCI: number;  // Missing Clock-In
  // Phân bổ công/phép theo số giờ lẻ (VD: W6/AL2, W4/UL4, W7/SL1, W5/PL3)
  fractionalW: number;
  fractionalAL: number;
  fractionalUL: number;
  fractionalSL: number;
  fractionalPL: number;
}

// Helper: Tính CountBag từ cells
export function buildCountBag(cells: { statusCode: AttendanceStatusCode }[]): CountBag {
  const bag: CountBag = {
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
    else if (code === 'ML' || code === 'MATERNITY LEAVE' || code === 'TS') {
      bag.countML++;
    } else {
      // Nhận diện mã công lẻ theo giờ: W6/AL2, W4/UL4, W7/SL1, W5/PL3...
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
  // Lưu ý: Tách riêng Off và UL theo yêu cầu: UL là có phép không lương, Off là không phép
  // Không gộp bag.countOff vào bag.countUL nữa
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
    jsCompute: (c) => c.countW + (c.countW_AL * 0.5) + c.countBT + c.countN + (c.countW_UL * 0.5) + (c.fractionalW || 0),
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
    jsCompute: (c) => c.countAL + (c.countW_AL * 0.5) + (c.countAL_UL * 0.5) + (c.fractionalAL || 0),
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"AL")+COUNTIF(I${r}:AM${r},"W/2 AL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"AL") + COUNTIF(I:AM,"W/2 AL/2")*0.5 + COUNTIF(I:AM,"AL/2 UL/2")*0.5'
  },
  unpaidLeaveUL: {
    key: 'unpaidLeaveUL',
    label: 'Không lương (UL)',
    labelEn: 'Unpaid Leave (UL)',
    excelHeader: 'Total UL\nKhông lương (có phép)',
    colIndex: 43,
    // UL có xin phép nhưng không tính lương
    jsCompute: (c) => c.countUL + (c.countW_UL * 0.5) + (c.countAL_UL * 0.5) + (c.fractionalUL || 0),
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"UL")+COUNTIF(I${r}:AM${r},"W/2 UL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"UL") + COUNTIF(I:AM,"W/2 UL/2")*0.5 + COUNTIF(I:AM,"AL/2 UL/2")*0.5'
  },
  unexcusedAbsenceOff: {
    key: 'unexcusedAbsenceOff',
    label: 'Không phép (Off)',
    labelEn: 'Unexcused Absence (Off)',
    excelHeader: 'Total Off\nKhông phép / Từ chối',
    colIndex: 43.5,
    // Off là không xin phép hoặc bị HR từ chối phép
    jsCompute: (c) => c.countOff,
    excelFormula: (r) => ({
      formula: `COUNTIF(I${r}:AM${r},"Off")`,
      columnLetterRange: CALENDAR_RANGE
    }),
    description: 'COUNTIF(I:AM,"Off")'
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
    jsCompute: (c) => c.countSL + (c.fractionalSL || 0),
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"SL")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"SL")'
  },
  specialPaidLeavePL: {
    key: 'specialPaidLeavePL',
    label: 'Phép chế độ (PL)',
    labelEn: 'Special Paid Leave',
    excelHeader: 'Total PL\nPhép chế độ',
    colIndex: 46,
    jsCompute: (c) => c.countPL + (c.fractionalPL || 0),
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
  maternityLeaveML: {
    key: 'maternityLeaveML',
    label: 'Thai sản (TS)',
    labelEn: 'Maternity Leave (ML)',
    excelHeader: 'Total TS\nThai sản',
    colIndex: 47.2,
    jsCompute: (c) => c.countML,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"ML")+COUNTIF(I${r}:AM${r},"TS")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"ML") + COUNTIF(I:AM,"TS")'
  },
  businessTripBT: {
    key: 'businessTripBT',
    label: 'Công tác (CT)',
    labelEn: 'Business Trip (BT)',
    excelHeader: 'Total CT\nCông tác',
    colIndex: 47.5,
    jsCompute: (c) => c.countBT,
    excelFormula: (r) => ({ formula: `COUNTIF(I${r}:AM${r},"BT")+COUNTIF(I${r}:AM${r},"CT")`, columnLetterRange: CALENDAR_RANGE }),
    description: 'COUNTIF(I:AM,"BT") + COUNTIF(I:AM,"CT")'
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

// Diligence & Productivity formula metadata — hệ thống hoá để Settings custom, không khóa cứng
export const DILIGENCE_FORMULA = {
  description: 'baseAmount * (1 - penalty%) với penalty 50% nếu UL>=2, 100% nếu UL>=3 — phạm vi COUNTIF custom (J:AM khớp file gốc)',
  excelFormulaExample: '=500000*(1-IF(COUNTIF(J13:AM13,"UL")>=2,IF(COUNTIF(J13:AM13,"UL")>=3,1,0.5),0))',
  appliesTo: 'diligenceBonus',
  buildExcelFormula: (row: number, baseAmount: number, countRange: string) => {
    const range = countRange || 'J:AM';
    // range dạng "J:AM" -> thành "J13:AM13"
    const [startCol, endCol] = range.split(':');
    return `=${baseAmount}*(1-IF(COUNTIF(${startCol}${row}:${endCol}${row},"UL")>=2,IF(COUNTIF(${startCol}${row}:${endCol}${row},"UL")>=3,1,0.5),0))`;
  }
} as const;

export const PRODUCTIVITY_FORMULA = {
  description: 'Tiền năng suất AW = (TotalWD + TotalAL) * BaseRate / StandardWD  →  (AO+AP)*BF/AN',
  excelFormulaExample: '=(AO13+AP13)*BF13/AN13',
  buildExcelFormula: (row: number) => `=(AO${row}+AP${row})*BF${row}/AN${row}`,
  appliesTo: 'productivityBonus'
} as const;
