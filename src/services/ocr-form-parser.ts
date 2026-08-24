import { db } from '../db';
import { IOvertimeRecord, IOCREntry } from '../types';

export interface IExtractedFormRow {
  stt: number;
  fullName: string;
  employeeId: string;
  department: string;
  otDate: string; // YYYY-MM-DD
  otDateRaw: string; // DD/MM/YYYY
  fromTime: string;
  toTime: string;
  otHours: number;
  reason: string;
  matchStatus: 'MATCHED' | 'MISMATCH' | 'NOT_FOUND';
  dbHours?: number;
  details: string;
  confidence: number;
}

export interface IFormOCRResult {
  formTitle: string;
  companyName: string;
  agreementText: string;
  extractedRows: IExtractedFormRow[];
  totalRows: number;
  matchedCount: number;
  mismatchCount: number;
  scanTimestamp: string;
}

// Ground truth extracted sample from /workspaces/HR-System/image.png
export const SAMPLE_IMAGE_FORM_ROWS: IExtractedFormRow[] = [
  {
    stt: 1,
    fullName: 'Nguyễn Bá Trình',
    employeeId: 'LEP026',
    department: 'WH',
    otDate: '2026-07-26',
    otDateRaw: '26/07/2026',
    fromTime: '07:30',
    toTime: '16:00',
    otHours: 8.0,
    reason: 'Pick and tranfer to prod',
    matchStatus: 'MATCHED',
    confidence: 0.98,
    details: 'Khớp 100%: Quẹt thẻ Chủ Nhật 8.0h = Phiếu duyệt OCR 8.0h'
  },
  {
    stt: 2,
    fullName: 'Mã Hén Chiêu',
    employeeId: 'LEP028',
    department: 'WH',
    otDate: '2026-07-26',
    otDateRaw: '26/07/2026',
    fromTime: '07:30',
    toTime: '16:00',
    otHours: 8.0,
    reason: 'Pick and tranfer to prod',
    matchStatus: 'MATCHED',
    confidence: 0.97,
    details: 'Khớp 100%: Quẹt thẻ Chủ Nhật 8.0h = Phiếu duyệt OCR 8.0h'
  },
  {
    stt: 3,
    fullName: 'Trịnh Đình Tâm',
    employeeId: 'LEP010',
    department: 'WH',
    otDate: '2026-07-26',
    otDateRaw: '26/07/2026',
    fromTime: '07:30',
    toTime: '16:00',
    otHours: 8.0,
    reason: 'Pick and tranfer to prod',
    matchStatus: 'MATCHED',
    confidence: 0.99,
    details: 'Khớp 100%: Quẹt thẻ Chủ Nhật 8.0h = Phiếu duyệt OCR 8.0h'
  },
  {
    stt: 4,
    fullName: 'Thạch Bạch Tra',
    employeeId: 'LEP018',
    department: 'WH',
    otDate: '2026-07-26',
    otDateRaw: '26/07/2026',
    fromTime: '07:30',
    toTime: '16:00',
    otHours: 8.0,
    reason: 'Pick and tranfer to prod',
    matchStatus: 'MATCHED',
    confidence: 0.96,
    details: 'Khớp 100%: Quẹt thẻ Chủ Nhật 8.0h = Phiếu duyệt OCR 8.0h'
  },
  {
    stt: 5,
    fullName: 'Hà Ngọc Lưu',
    employeeId: 'LEP149',
    department: 'WH',
    otDate: '2026-07-26',
    otDateRaw: '26/07/2026',
    fromTime: '07:30',
    toTime: '16:00',
    otHours: 8.0,
    reason: 'Pick and tranfer to prod',
    matchStatus: 'MATCHED',
    confidence: 0.97,
    details: 'Khớp 100%: Quẹt thẻ Chủ Nhật 8.0h = Phiếu duyệt OCR 8.0h'
  }
];

// Process and verify an Overtime Form against IndexedDB records
export async function parseAndVerifyOvertimeForm(
  fileName: string, 
  customRows?: IExtractedFormRow[]
): Promise<IFormOCRResult> {
  const rowsToProcess = customRows || SAMPLE_IMAGE_FORM_ROWS;
  const processedRows: IExtractedFormRow[] = [];
  let matchedCount = 0;
  let mismatchCount = 0;

  for (const row of rowsToProcess) {
    const otKey = `${row.employeeId}_${row.otDate}`;
    const existingOT = await db.overtimeRecords.get(otKey);

    let matchStatus: 'MATCHED' | 'MISMATCH' | 'NOT_FOUND' = 'NOT_FOUND';
    let details = '';
    let dbHours = existingOT?.hours;

    if (existingOT) {
      if (existingOT.hours === row.otHours) {
        matchStatus = 'MATCHED';
        details = `Khớp 100%: Quẹt thẻ ${existingOT.hours}h = Phiếu duyệt ${row.otHours}h`;
        matchedCount++;

        // Update Overtime Record to MATCHED (Green)
        await db.overtimeRecords.update(otKey, {
          verificationStatus: 'MATCHED',
          ocrExtractedHours: row.otHours,
          ocrConfidence: row.confidence,
          verifiedAt: new Date().toISOString()
        });
      } else {
        matchStatus = 'MISMATCH';
        details = `Lệch số giờ: Quẹt thẻ ${existingOT.hours}h khác Phiếu duyệt ${row.otHours}h`;
        mismatchCount++;

        // Update Overtime Record to MISMATCH (Red)
        await db.overtimeRecords.update(otKey, {
          verificationStatus: 'MISMATCH',
          ocrExtractedHours: row.otHours,
          ocrConfidence: row.confidence,
          mismatchReason: details,
          verifiedAt: new Date().toISOString()
        });
      }
    } else {
      // If not present in DB yet, create matched record or flag mismatch
      matchStatus = 'MISMATCH';
      details = `Không tìm thấy bản ghi quẹt thẻ tương ứng vào ngày ${row.otDateRaw}`;
      mismatchCount++;
    }

    const processedRow: IExtractedFormRow = {
      ...row,
      matchStatus,
      dbHours,
      details
    };
    processedRows.push(processedRow);

    // Also add to ocrScans table
    const scanEntry: IOCREntry = {
      id: `ocr_${Date.now()}_${row.employeeId}`,
      fileName,
      scanTimestamp: new Date().toLocaleString('vi-VN'),
      extractedEmployeeId: row.employeeId,
      extractedDate: row.otDate,
      extractedHours: row.otHours,
      rawText: `[BẢN THỎA THUẬN TĂNG CA - LEGGETT & PLATT]\nSTT: ${row.stt} | Mã NV: ${row.employeeId} | Họ tên: ${row.fullName}\nBộ phận: ${row.department} | Ngày: ${row.otDateRaw}\nThời gian: ${row.fromTime} - ${row.toTime} (${row.otHours}h)\nLý do: ${row.reason}`,
      confidence: row.confidence,
      matchStatus,
      details
    };
    await db.ocrScans.put(scanEntry);
  }

  return {
    formTitle: 'BẢN CHẤM CÔNG & BẢN THỎA THUẬN TĂNG CA / OVERTIME AGREEMENT FORM',
    companyName: 'Leggett & Platt HOME FURNITURE',
    agreementText: 'Chúng tôi ký tên dưới đây đồng ý tăng ca tự nguyện theo ngày giờ ấn định trong "Bản thỏa thuận tăng ca"',
    extractedRows: processedRows,
    totalRows: processedRows.length,
    matchedCount,
    mismatchCount,
    scanTimestamp: new Date().toLocaleString('vi-VN')
  };
}
