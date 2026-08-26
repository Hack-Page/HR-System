/**
 * OCR Table Engine - chuẩn hoá dữ liệu nhận dạng được từ pipeline ONNX thật
 *
 * Nguyên tắc: KHÔNG bịa giá trị mặc định. Nếu không parse được thì trả về
 * valid=false / hours=null và để người dùng sửa trên bảng preview.
 */
import { IEmployee } from '../types';
import type { OcrTableGrid } from '../types/ocr-worker-protocol';

export interface IOCRBbox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// 1. Chuẩn hoá mã nhân viên (LEP/LP, thiếu số 0, nhầm O với 0)
// ---------------------------------------------------------------------------

export function normalizeEmployeeCode(rawText: string, catalog: IEmployee[]): {
  normalizedId: string;
  name: string;
  dept: string;
  matched: boolean;
} {
  const cleaned = rawText.toUpperCase().replace(/\s+/g, '');

  const tryCatalog = (candidate: string) =>
    catalog.find(e => e.employeeId.toUpperCase() === candidate || e.erpId?.toUpperCase() === candidate);

  // Đối chiếu trực tiếp trước
  const direct = tryCatalog(cleaned);
  if (direct) {
    return { normalizedId: direct.employeeId, name: direct.fullName, dept: direct.department, matched: true };
  }

  // Nhóm tiền tố LEP/LP + phần số. Chỉ thay O->0 TRONG phần số phía sau tiền tố
  // (tránh phá hỏng mã chứa chữ O thật ở vị trí khác)
  const lepMatch = cleaned.match(/^(LEP|LP)([A-Z0-9]+)$/);
  if (lepMatch) {
    const digits = lepMatch[2].replace(/O/g, '0').replace(/\D/g, '');
    if (digits) {
      const num = parseInt(digits, 10);
      const padded1 = `LEP${String(num).padStart(3, '0')}`;
      const padded2 = `LP${String(num).padStart(3, '0')}`;
      const found = catalog.find(e => e.employeeId === padded1 || e.employeeId === padded2 || e.erpId === padded1);
      if (found) {
        return { normalizedId: found.employeeId, name: found.fullName, dept: found.department, matched: true };
      }
    }
  }

  // Phương án cuối: chỉ có số -> thử ghép LEP{num}. Chỉ chấp nhận khi khớp danh mục,
  // không bao giờ tự sáng tạo ra một mã mới
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly && cleaned.length <= 4) {
    const num = parseInt(digitsOnly, 10);
    const candidate = `LEP${String(num).padStart(3, '0')}`;
    const found = catalog.find(e => e.employeeId === candidate || e.erpId === candidate);
    if (found) {
      return { normalizedId: found.employeeId, name: found.fullName, dept: found.department, matched: true };
    }
  }

  return { normalizedId: cleaned || rawText.trim(), name: '', dept: '', matched: false };
}

// ---------------------------------------------------------------------------
// 2. Chuẩn hoá chuỗi ngày (26/07/2026, 26-07-2026, 2026-07-26 -> 2026-07-26)
// ---------------------------------------------------------------------------

export function normalizeDateString(rawDate: string): { normalizedDate: string; valid: boolean } {
  const input = (rawDate || '').trim();
  if (!input) return { normalizedDate: '', valid: false };

  // ISO YYYY-MM-DD ưu tiên tránh nhầm với DD/MM/YYYY
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return buildDate(iso[1], iso[2], iso[3]);
  }

  const match = input.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})$/);
  if (match) {
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    return buildDate(year, match[2], match[1]);
  }

  return { normalizedDate: '', valid: false };
}

function buildDate(y: string, m: string, d: string): { normalizedDate: string; valid: boolean } {
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { normalizedDate: '', valid: false };
  // Kiểm tra ngày tồn tại thật trong tháng
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return { normalizedDate: '', valid: false };
  return {
    normalizedDate: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    valid: true
  };
}

// ---------------------------------------------------------------------------
// 3. Số giờ tăng ca: parse chuỗi HOẶC tính từ khung giờ - không bịa mặc định
// ---------------------------------------------------------------------------

export function parseOvertimeHours(
  rawHoursText: string,
  fromTime?: string,
  toTime?: string
): { hours: number | null; computedFromTime?: number } {
  const numMatch = rawHoursText?.match(/(\d+(?:[\.,]\d+)?)/);
  const parsed = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : null;

  let computedHours: number | undefined;
  if (
    fromTime && toTime &&
    /^\d{1,2}:\d{2}$/.test(fromTime.trim()) &&
    /^\d{1,2}:\d{2}$/.test(toTime.trim())
  ) {
    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = toTime.split(':').map(Number);
    let diffMins = (th * 60 + tm) - (fh * 60 + fm);
    let startMin = fh * 60 + fm;
    if (diffMins < 0) {
      diffMins += 24 * 60; // ca qua đêm (22:00 -> 06:00)
      // startMin giữ nguyên để kiểm tra cửa sổ nghỉ trưa theo ngày đầu
    }
    if (diffMins > 0) {
      // Quy ước biểu mẫu công ty: khung giờ >= 8 tiếng QUÉT QUA buổi trưa đã gồm
      // 30 phút nghỉ trưa. Ca đêm không chạm buổi trưa thì không trừ.
      const endMin = startMin + diffMins;
      const overlapsNoonLunch = startMin < 13 * 60 && endMin > 12 * 60;
      const mins = diffMins >= 480 && overlapsNoonLunch ? diffMins - 30 : diffMins;
      computedHours = Math.round((mins / 60) * 100) / 100;
    }
  }

  const hours = parsed !== null && parsed > 0 ? parsed : (computedHours ?? null);
  return { hours, computedFromTime: computedHours };
}

// ---------------------------------------------------------------------------
// 4. Map lưới OCR (theo bố cục ảnh scan) -> các dòng bảng đã phân cột
// ---------------------------------------------------------------------------

type CanonicalField =
  | 'stt' | 'fullName' | 'employeeCode' | 'department'
  | 'date' | 'timeRange' | 'fromTime' | 'toTime'
  | 'hours' | 'reason' | 'unknown';

const COLUMN_PATTERNS: { field: CanonicalField; pattern: RegExp }[] = [
  { field: 'stt', pattern: /^(stt|số\s*tt|no\.?|seq)$/i },
  { field: 'employeeCode', pattern: /(mã\s*(số|nv|nhân viên|empl)|empl.*code|employee\s*code|^code)/i },
  { field: 'fullName', pattern: /(họ|tên|full\s*name|^name)/i },
  { field: 'department', pattern: /(bộ phận|đơn vị|phòng|dept|department)/i },
  { field: 'date', pattern: /(ngày|^date|ot\s*date)/i },
  { field: 'timeRange', pattern: /(thời gian|giờ làm|^time$|from\s*-\s*to)/i },
  { field: 'fromTime', pattern: /(từ|^from)/i },
  { field: 'toTime', pattern: /(đến|^to$)/i },
  { field: 'hours', pattern: /(số giờ|ot hours|^hours|giờ tăng ca)/i },
  { field: 'reason', pattern: /(lý do|reason|nội dung)/i },
];

function classifyHeaderText(text: string): CanonicalField {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'unknown';
  for (const { field, pattern } of COLUMN_PATTERNS) {
    if (pattern.test(t)) return field;
  }
  return 'unknown';
}

/** Phân loại ô theo nội dung khi không tìm thấy dòng header */
function classifyByContent(text: string): CanonicalField {
  const t = text.trim();
  if (/^\d{1,2}$/.test(t)) return 'stt';
  if (/^(LEP|LP)\s*\d+/i.test(t)) return 'employeeCode';
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(t)) return 'date';
  if (/^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/.test(t)) return 'timeRange';
  if (/^\d{1,2}:\d{2}$/.test(t)) return 'unknown'; // không đủ căn cứ tách từ/đến
  if (/^\d+(\.\d+)?$/.test(t)) return 'hours';
  if (/[\p{L}]/u.test(t) && t.length >= 3) return 'fullName';
  return 'unknown';
}

export interface IMappedTableRow {
  stt?: number;
  fullName?: string;
  employeeCode?: string;
  department?: string;
  /** Ngày thô trên phiếu, ví dụ 26/07/2026 */
  rawDate?: string;
  fromTime?: string;
  toTime?: string;
  hoursText?: string;
  reason?: string;
  confidence: number;
}

interface GridCellRef {
  text: string;
  confidence: number;
  x0: number;
  x1: number;
}

/**
 * Tái tạo cấu trúc bảng từ lưới OCR phản chiếu đúng bố cục ảnh scan:
 *  - Tìm dòng header bằng từ khoá (STT, Họ tên, Mã NV, Bộ phận, Ngày, Thời gian, Số giờ, Lý do)
 *  - Gán từng ô của các dòng sau vào cột theo khoảng x của header
 *  - Không có header thì phân loại theo nội dung từng ô (heuristic, người dùng kiểm tra lại)
 */
export function mapGridToTableRows(grid: OcrTableGrid): IMappedTableRow[] {
  if (grid.rows.length === 0) return [];

  // 1. Tìm dòng header: hàng nhiều từ khoá cột nhất
  let headerIdx = -1;
  let headerScore = 0;
  let headerFields: CanonicalField[] = [];

  grid.rows.forEach((row, idx) => {
    const fields = row.cells.map(c => classifyHeaderText(c.text));
    const score = fields.filter(f => f !== 'unknown').length;
    if (score >= 2 && score > headerScore) {
      headerScore = score;
      headerIdx = idx;
      headerFields = fields;
    }
  });

  const dataRows = grid.rows
    .map((r, i) => ({ row: r, idx: i }))
    .filter(({ idx }) => idx !== headerIdx);

  // Bỏ các dòng trang trí/ký hiệu trống
  const meaningful = dataRows.filter(({ row }) => row.cells.some(c => c.text.trim().length > 0));

  const mapped: IMappedTableRow[] = [];

  if (headerIdx >= 0) {
    // Gán ô vào cột theo khoảng x của header
    const headerRow = grid.rows[headerIdx];
    const colRanges = headerRow.cells.map((c, i) => ({ x0: c.x0, x1: c.x1, field: headerFields[i] }));

    for (const { row } of meaningful) {
      const acc: Record<string, GridCellRef[]> = {};
      for (const cell of row.cells) {
        if (!cell.text.trim()) continue;
        const centerX = (cell.x0 + cell.x1) / 2;
        // Tìm cột header phủ tâm ô; không thấy thì chọn cột gần nhất có field rõ
        let best = colRanges.findIndex(cr => centerX >= cr.x0 - 20 && centerX <= cr.x1 + 20);
        if (best < 0) {
          let bestDist = Infinity;
          colRanges.forEach((cr, ci) => {
            const dist = Math.abs(centerX - (cr.x0 + cr.x1) / 2);
            if (dist < bestDist && cr.field !== 'unknown') { bestDist = dist; best = ci; }
          });
        }
        const field = best >= 0 ? colRanges[best].field : 'unknown';
        if (field === 'unknown') continue;
        (acc[field] ||= []).push(cell);
      }
      mapped.push(accumulateToRow(acc));
    }
  } else {
    // Không tìm thấy header: xếp hạng theo nội dung
    for (const { row } of meaningful) {
      const acc: Record<string, GridCellRef[]> = {};
      for (const cell of [...row.cells].sort((a, b) => a.x0 - b.x0)) {
        if (!cell.text.trim()) continue;
        const field = classifyByContent(cell.text);
        if (field === 'unknown') continue;
        (acc[field] ||= []).push(cell);
      }
      const r = accumulateToRow(acc);
      if (Object.keys(r).length > 1) mapped.push(r);
    }
  }

  return mapped;
}

function accumulateToRow(acc: Record<string, GridCellRef[]>): IMappedTableRow {
  const joinCells = (cells?: GridCellRef[]) => cells?.map(c => c.text.trim()).filter(Boolean).join(' ');
  const avgConf = (cells?: GridCellRef[]) =>
    cells && cells.length ? cells.reduce((s, c) => s + c.confidence, 0) / cells.length : 0;

  const sttRaw = joinCells(acc['stt']);
  const timeRange = joinCells(acc['timeRange']);
  let fromTime = joinCells(acc['fromTime']);
  let toTime = joinCells(acc['toTime']);
  if (timeRange && (!fromTime || !toTime)) {
    const parts = timeRange.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (parts) {
      fromTime ||= parts[1];
      toTime ||= parts[2];
    }
  }

  const confidences = Object.values(acc).map(avgConf).filter(c => c > 0);

  return {
    stt: sttRaw ? parseInt(sttRaw, 10) || undefined : undefined,
    fullName: joinCells(acc['fullName']),
    employeeCode: joinCells(acc['employeeCode']),
    department: joinCells(acc['department']),
    rawDate: joinCells(acc['date']),
    fromTime,
    toTime,
    hoursText: joinCells(acc['hours']),
    reason: joinCells(acc['reason']),
    confidence: confidences.length ? confidences.reduce((s, c) => s + c, 0) / confidences.length : 0,
  };
}
