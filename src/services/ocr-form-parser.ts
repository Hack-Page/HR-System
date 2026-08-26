/**
 * OCR Form Parser - đối soát dữ liệu OCR THẬT với cơ sở dữ liệu quẹt thẻ.
 *
 * Tách bạch 2 pha:
 *  - reconcileRows(): THUẦN TÍNH, chỉ tính toán trạng thái khớp/lệch, KHÔNG ghi DB
 *  - commitVerifiedRows(): chỉ chạy khi người dùng bấm xác nhận trên màn hình preview,
 *    ghi trong 1 transaction Dexie duy nhất.
 *
 * Không còn bất kỳ bộ dữ liệu mẫu (preset) nào - mọi dòng đều đến từ pipeline OCR thật
 * hoặc do người dùng nhập/sửa trực tiếp trên bảng preview.
 */
import { db } from '../db';
import { IOvertimeRecord, IOCREntry, IEmployee } from '../types';
import { normalizeEmployeeCode, normalizeDateString } from './ocr-table-engine';

export type MatchStatus = 'MATCHED' | 'MISMATCH' | 'NOT_FOUND';

export interface IExtractedFormRow {
  /** Định danh ổn định của dòng trong phiên làm việc (dùng làm React key) */
  rowId: string;
  stt: number;
  fullName: string;
  employeeId: string;
  department: string;
  otDate: string; // YYYY-MM-DD
  otDateRaw: string; // DD/MM/YYYY như trên phiếu
  fromTime: string;
  toTime: string;
  otHours: number | null;
  reason: string;
  matchStatus?: MatchStatus;
  dbHours?: number;
  details?: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Đối soát thuần tính - không tác động DB
// ---------------------------------------------------------------------------

export function reconcileRows(
  rows: IExtractedFormRow[],
  employees: IEmployee[],
  overtimeRecords: IOvertimeRecord[]
): IExtractedFormRow[] {
  return rows.map((row) => {
    const normEmp = normalizeEmployeeCode(row.employeeId, employees);
    const normDate = normalizeDateString(row.otDateRaw || row.otDate);

    let matchStatus: MatchStatus;
    let details = '';

    if (!normDate.valid || !normDate.normalizedDate) {
      matchStatus = 'NOT_FOUND';
      details = 'Ngày trên ô không đúng định dạng DD/MM/YYYY - cần sửa trước khi ghi nhận';
    } else if (!normEmp.matched) {
      matchStatus = 'MISMATCH';
      details = `Mã nhân viên [${row.employeeId}] không tồn tại trong danh mục nhân sự`;
    } else {
      const otKey = `${normEmp.normalizedId}_${normDate.normalizedDate}`;
      const existingOT = overtimeRecords.find(o => o.employeeId_date === otKey);

      if (!existingOT) {
        matchStatus = 'MISMATCH';
        details = `VẮNG MẶT: Không có bản ghi quẹt thẻ nào của ${normEmp.name} ngày ${normDate.normalizedDate}`;
      } else if (row.otHours === null) {
        matchStatus = 'NOT_FOUND';
        details = 'Số giờ tăng ca trống/không hợp lệ - cần nhập trước khi ghi nhận';
      } else if (Math.abs(existingOT.hours - row.otHours) < 0.001) {
        matchStatus = 'MATCHED';
        details = `Khớp: Quẹt thẻ ${existingOT.hours}h = Phiếu duyệt ${row.otHours}h`;
      } else {
        matchStatus = 'MISMATCH';
        details = `LỆCH GIỜ: Quẹt thẻ thực tế ${existingOT.hours}h khác Phiếu duyệt ${row.otHours}h (Chênh ${Math.abs(existingOT.hours - row.otHours).toFixed(1)}h)`;
      }
    }

    return {
      ...row,
      fullName: normEmp.matched ? normEmp.name : row.fullName,
      department: normEmp.dept || row.department,
      employeeId: normEmp.matched ? normEmp.normalizedId : row.employeeId,
      otDate: normDate.normalizedDate || row.otDate,
      matchStatus,
      dbHours: normEmp.matched && normDate.valid
        ? overtimeRecords.find(o => o.employeeId_date === `${normEmp.normalizedId}_${normDate.normalizedDate}`)?.hours
        : undefined,
      details
    };
  });
}

// ---------------------------------------------------------------------------
// Ghi DB - chỉ gọi khi người dùng xác nhận; 1 transaction cho toàn bộ lô
// ---------------------------------------------------------------------------

export interface CommitMeta {
  fileName: string;
  verifiedBy?: string;
}

export async function commitVerifiedRows(rows: IExtractedFormRow[], meta: CommitMeta): Promise<{ updated: number; scansWritten: number }> {
  const now = new Date().toISOString();
  let updated = 0;
  let scansWritten = 0;

  await db.transaction('rw', db.overtimeRecords, db.ocrScans, async () => {
    const scanBatch: IOCREntry[] = [];
    const stamp = Date.now();

    for (const [i, row] of rows.entries()) {
      if (!row.otDate || row.otHours === null || row.otHours === undefined) continue;

      const otKey = `${row.employeeId}_${row.otDate}`;
      const existing = await db.overtimeRecords.get(otKey);
      if (existing) {
        await db.overtimeRecords.update(otKey, {
          verificationStatus: row.matchStatus === 'MATCHED' ? 'MATCHED' : 'MISMATCH',
          ocrExtractedHours: row.otHours,
          ocrConfidence: row.confidence,
          mismatchReason: row.matchStatus === 'MISMATCH' ? row.details : undefined,
          verifiedBy: meta.verifiedBy,
          verifiedAt: now
        });
        updated++;
      }

      scanBatch.push({
        id: `ocr_${stamp}_${i}_${row.employeeId}`,
        fileName: meta.fileName,
        scanTimestamp: new Date().toLocaleString('vi-VN'),
        extractedEmployeeId: row.employeeId,
        extractedDate: row.otDate,
        extractedHours: row.otHours,
        rawText: `[BẢN THỎA THUẬN TĂNG CA]\nSTT: ${row.stt} | Mã: ${row.employeeId} | Tên: ${row.fullName}\nNgày: ${row.otDateRaw} | Giờ: ${row.fromTime}-${row.toTime} (${row.otHours}h)\nLý do: ${row.reason}`,
        confidence: row.confidence,
        matchStatus: row.matchStatus ?? 'NOT_FOUND',
        details: row.details
      });
      scansWritten++;
    }

    await db.ocrScans.bulkPut(scanBatch);
  });

  return { updated, scansWritten };
}
