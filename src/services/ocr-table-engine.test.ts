import { describe, it, expect } from 'vitest';
import {
  normalizeEmployeeCode,
  normalizeDateString,
  parseOvertimeHours,
  mapGridToTableRows,
} from './ocr-table-engine';
import { IEmployee } from '../types';
import { OcrTextLine } from '../types/ocr-worker-protocol';

const catalog: IEmployee[] = [
  {
    employeeId: 'LEP010',
    erpId: '1013789',
    fullName: 'Trịnh Đình Tâm',
    department: 'WH',
    position: 'Lead',
    startDate: '01/01/2022',
    contractType: 'OFFICIAL',
    shiftClassId: 'SHIFT_1',
    customAllowances: { pcccAllowance: 0, hazardousAllowance: 0, diligenceBonus: 500000, productivityBonus: 0, tradeUnionFee: -40000, otherFees: 0 },
    annualLeaveBalance: { initialQuota: 12, usedDays: 0, remainingDays: 12 },
    status: 'ACTIVE'
  },
  {
    employeeId: 'LEP026',
    erpId: '1013790',
    fullName: 'Nguyễn Bá Trình',
    department: 'WH',
    position: 'Operator',
    startDate: '01/01/2022',
    contractType: 'SEASONAL',
    shiftClassId: 'SHIFT_2',
    customAllowances: { pcccAllowance: 0, hazardousAllowance: 0, diligenceBonus: 500000, productivityBonus: 0, tradeUnionFee: -40000, otherFees: 0 },
    annualLeaveBalance: { initialQuota: 12, usedDays: 0, remainingDays: 12 },
    status: 'ACTIVE'
  }
];

describe('normalizeEmployeeCode', () => {
  it('direct match LEP026', () => {
    const res = normalizeEmployeeCode('LEP026', catalog);
    expect(res.normalizedId).toBe('LEP026');
    expect(res.matched).toBe(true);
  });
  it('pads LEP10 -> LEP010 via fuzzy', () => {
    const res = normalizeEmployeeCode('LEP10', catalog);
    expect(res.normalizedId).toBe('LEP010');
    expect(res.matched).toBe(true);
  });
  it('handles LP variant', () => {
    const res = normalizeEmployeeCode('LP026', catalog);
    expect(res.normalizedId).toBe('LEP026');
  });
  it('handles O->0 typo chỉ trong phần số sau tiền tố (LEPO26)', () => {
    const res = normalizeEmployeeCode('LEP O26', catalog);
    expect(res.normalizedId).toBe('LEP026');
    expect(res.matched).toBe(true);
  });
  it('không phá mã chứa chữ O thật ngoài phần số', () => {
    // "LEP" + "O26" vẫn phải khớp nhờ thay O trong segment số,
    // nhưng mã như "MON26" không được biến thành "M0N26" rồi ghép bừa
    const res = normalizeEmployeeCode('MON26', catalog);
    expect(res.matched).toBe(false);
  });
  it('digits only 26 -> LEP026 (chỉ khi khớp danh mục)', () => {
    const res = normalizeEmployeeCode('26', catalog);
    expect(res.normalizedId).toBe('LEP026');
    expect(res.matched).toBe(true);
  });
  it('unknown code returns not matched, không bịa tên', () => {
    const res = normalizeEmployeeCode('LEP999', catalog);
    expect(res.matched).toBe(false);
    expect(res.name).toBe('');
  });
});

describe('normalizeDateString', () => {
  it('DD/MM/YYYY', () => {
    expect(normalizeDateString('26/07/2026').normalizedDate).toBe('2026-07-26');
    expect(normalizeDateString('26/07/2026').valid).toBe(true);
  });
  it('DD-MM-YYYY', () => {
    expect(normalizeDateString('26-07-2026').normalizedDate).toBe('2026-07-26');
  });
  it('DD.MM.YYYY', () => {
    expect(normalizeDateString('26.07.2026').normalizedDate).toBe('2026-07-26');
  });
  it('ISO YYYY-MM-DD ưu tiên trước', () => {
    expect(normalizeDateString('2026-07-26').normalizedDate).toBe('2026-07-26');
    expect(normalizeDateString('2026-07-26').valid).toBe(true);
  });
  it('invalid returns empty với valid=false - không bịa ngày mặc định', () => {
    const res = normalizeDateString('invalid');
    expect(res.valid).toBe(false);
    expect(res.normalizedDate).toBe('');
  });
  it('ngày không tồn tại (31/02/2026) -> valid=false', () => {
    expect(normalizeDateString('31/02/2026').valid).toBe(false);
  });
});

describe('parseOvertimeHours', () => {
  it('parses direct hours 8.0', () => {
    expect(parseOvertimeHours('8.0', '07:30', '16:00').hours).toBe(8.0);
  });
  it('computes from interval 07:30-16:00 = 8.0 sau trừ 30 phút trưa', () => {
    const res = parseOvertimeHours('', '07:30', '16:00');
    expect(res.computedFromTime).toBe(8.0);
    // Không có số trên phiếu -> dùng số giờ tính từ khung giờ (dữ liệu phái sinh, không phải bịa)
    expect(res.hours).toBe(8.0);
  });
  it('short interval 16:00-18:30 = 2.5', () => {
    const res = parseOvertimeHours('2.5', '16:00', '18:30');
    expect(res.hours).toBe(2.5);
    expect(res.computedFromTime).toBe(2.5);
  });
  it('comma decimal 2,5 -> 2.5', () => {
    expect(parseOvertimeHours('2,5').hours).toBe(2.5);
  });
  it('ca qua đêm 22:00->06:00 = 8h, không âm', () => {
    const res = parseOvertimeHours('', '22:00', '06:00');
    expect(res.computedFromTime).toBe(8);
  });
  it('không có gì parse được -> hours=null tuyệt đối không trả 8h mặc định', () => {
    const res = parseOvertimeHours('', '', '');
    expect(res.hours).toBeNull();
    expect(res.computedFromTime).toBeUndefined();
  });
  it('khung giờ dài 11.5h không bị ép về 8.0', () => {
    const res = parseOvertimeHours('', '06:00', '17:30'); // 690ph - 30 nghi = 660ph
    expect(res.computedFromTime).toBeCloseTo(11, 1);
  });
});

// ---------------------------------------------------------------------------
// mapGridToTableRows - tái tạo bảng theo bố cục ảnh scan
// ---------------------------------------------------------------------------

function line(text: string, x0: number, x1: number, y0: number, y1: number): OcrTextLine {
  return { text, confidence: 0.95, box: { x0, y0, x1, y1 } };
}

describe('mapGridToTableRows', () => {
  it('tìm header bằng từ khoá và gán ô vào đúng cột', () => {
    // Header: STT | Mã NV | Họ tên | Ngày | Thời gian | Số giờ
    const lines: OcrTextLine[] = [
      line('STT', 10, 40, 100, 120),
      line('Mã NV', 60, 140, 100, 120),
      line('Họ và Tên', 160, 300, 100, 120),
      line('Ngày tăng ca', 320, 430, 100, 120),
      line('Thời gian', 450, 570, 100, 120),
      line('Số giờ', 590, 680, 100, 120),

      line('1', 15, 35, 130, 150),
      line('LEP026', 70, 130, 130, 150),
      line('Nguyễn Bá Trình', 170, 290, 130, 150),
      line('26/07/2026', 330, 420, 130, 150),
      line('07:30 - 16:00', 460, 560, 130, 150),
      line('8.0', 600, 650, 130, 150),

      line('2', 15, 35, 160, 180),
      line('LEP010', 70, 130, 160, 180),
      line('Trịnh Đình Tâm', 170, 290, 160, 180),
      line('26/07/2026', 330, 420, 160, 180),
      line('16:00 - 18:30', 460, 560, 160, 180),
      line('2.5', 600, 650, 160, 180),
    ];

    const grid = {
      imageWidth: 700,
      imageHeight: 200,
      rows: [
        { yCenter: 110, height: 20, cells: [0, 1, 2, 3, 4, 5].map(i => ({ text: lines[i].text, confidence: 0.95, x0: lines[i].box.x0, x1: lines[i].box.x1 })) },
        { yCenter: 140, height: 20, cells: [6, 7, 8, 9, 10, 11].map(i => ({ text: lines[i].text, confidence: 0.95, x0: lines[i].box.x0, x1: lines[i].box.x1 })) },
        { yCenter: 170, height: 20, cells: [12, 13, 14, 15, 16, 17].map(i => ({ text: lines[i].text, confidence: 0.95, x0: lines[i].box.x0, x1: lines[i].box.x1 })) },
      ],
      columnBoundaries: [],
    };

    const rows = mapGridToTableRows(grid);
    expect(rows).toHaveLength(2);

    expect(rows[0].employeeCode).toBe('LEP026');
    expect(rows[0].fullName).toBe('Nguyễn Bá Trình');
    expect(rows[0].rawDate).toBe('26/07/2026');
    expect(rows[0].fromTime).toBe('07:30');
    expect(rows[0].toTime).toBe('16:00');
    expect(rows[0].hoursText).toBe('8.0');

    expect(rows[1].employeeCode).toBe('LEP010');
    expect(rows[1].fromTime).toBe('16:00');
    expect(rows[1].toTime).toBe('18:30');
    expect(rows[1].hoursText).toBe('2.5');
  });

  it('bảng không header: phân loại theo nội dung ô', () => {
    const grid = {
      imageWidth: 500,
      imageHeight: 120,
      rows: [
        {
          yCenter: 30,
          height: 18,
          cells: [
            { text: 'LEP026', confidence: 0.9, x0: 10, x1: 90 },
            { text: 'Nguyễn Văn A', confidence: 0.9, x0: 110, x1: 240 },
            { text: '26/07/2026', confidence: 0.9, x0: 260, x1: 360 },
            { text: '8.0', confidence: 0.9, x0: 380, x1: 420 },
          ],
        },
      ],
      columnBoundaries: [],
    };

    const rows = mapGridToTableRows(grid);
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeCode).toBe('LEP026');
    expect(rows[0].fullName).toBe('Nguyễn Văn A');
    expect(rows[0].rawDate).toBe('26/07/2026');
    expect(rows[0].hoursText).toBe('8.0');
  });

  it('grid rỗng trả về mảng rỗng - không bịa dòng', () => {
    expect(mapGridToTableRows({ imageWidth: 0, imageHeight: 0, rows: [], columnBoundaries: [] })).toEqual([]);
  });
});
