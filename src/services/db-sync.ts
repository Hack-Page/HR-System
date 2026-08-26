/**
 * Đồng bộ DB qua Snapshot JSON (OneDrive workflow)
 *
 * Nguyên tắc an toàn:
 *  - Import luôn chạy trong MỘT transaction Dexie: hỏng giữa chừng thì rollback,
 *    không bao giờ rơi vào trạng thái mất một nửa dữ liệu
 *  - Validate cấu trúc + phiên bản snapshot trước khi đụng tới dữ liệu hiện có
 *  - Bảng không có trong snapshot vẫn được xoá sạch (đúng nghĩa "thay thế"),
 *    trừ bảng accounts (tài khoản đăng nhập là dữ liệu cục bộ của từng máy)
 */
import { db } from '../db';
import { IEmployee, IDailyTimesheetCell, IOvertimeRecord, ILeaveRequest, IShiftRosterEntry, IOCREntry, ISystemSettings } from '../types';
import { DEFAULT_SETTINGS } from '../db';

export const SNAPSHOT_VERSION = '2.0.0';

export interface IDatabaseSnapshot {
  version: string;
  exportedAt: string;
  exportedBy: string;
  employees: IEmployee[];
  dailyTimesheets: IDailyTimesheetCell[];
  overtimeRecords: IOvertimeRecord[];
  leaveRequests: ILeaveRequest[];
  shiftRosters: IShiftRosterEntry[];
  ocrScans: IOCREntry[];
  settings?: ISystemSettings;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportDatabaseToSnapshot(userName: string = 'HR Admin'): Promise<void> {
  const snapshot: IDatabaseSnapshot = {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: userName,
    employees: await db.employees.toArray(),
    dailyTimesheets: await db.dailyTimesheets.toArray(),
    overtimeRecords: await db.overtimeRecords.toArray(),
    leaveRequests: await db.leaveRequests.toArray(),
    shiftRosters: await db.shiftRosters.toArray(),
    ocrScans: await db.ocrScans.toArray(),
    settings: ((await db.settings.get('systemSettings'))?.value as ISystemSettings) || undefined
  };

  const jsonStr = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `SmartHR_OneDrive_Sync_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

interface ValidatedSnapshot {
  data: Required<Pick<IDatabaseSnapshot, 'employees' | 'dailyTimesheets' | 'overtimeRecords' | 'leaveRequests' | 'shiftRosters' | 'ocrScans'>>;
  settings?: ISystemSettings;
  skipped: Record<string, number>;
}

/** Kiểm tra chặt cấu trúc - trả về bản đã lọc dòng lỗi kèm số dòng bị bỏ qua */
function validateSnapshot(raw: unknown): ValidatedSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Tệp đồng bộ không phải JSON hợp lệ.');
  }
  const obj = raw as Record<string, unknown>;

  if (!isNonEmptyString(obj.version)) {
    throw new Error('Tệp thiếu trường "version" - không phải snapshot của hệ thống.');
  }
  const major = parseInt(obj.version.split('.')[0], 10);
  if (!Number.isFinite(major) || major < 1 || major > 2) {
    throw new Error(`Phiên bản snapshot "${obj.version}" không được hỗ trợ (hỗ trợ 1.x - 2.x).`);
  }

  const skipped: Record<string, number> = {};

  const pickArray = <T>(key: string, isValidRow: (row: T) => boolean): T[] => {
    const arr = obj[key];
    if (arr === undefined) return [];
    if (!Array.isArray(arr)) throw new Error(`Trường "${key}" phải là mảng.`);
    const valid = arr.filter((r): r is T => !!r && typeof r === 'object' && isValidRow(r as T));
    if (valid.length !== arr.length) skipped[key] = arr.length - valid.length;
    return valid;
  };

  const data = {
    employees: pickArray<IEmployee>('employees', e => isNonEmptyString(e.employeeId) && isNonEmptyString(e.fullName)),
    dailyTimesheets: pickArray<IDailyTimesheetCell>('dailyTimesheets', t => isNonEmptyString(t.employeeId_date) && isNonEmptyString(t.date)),
    overtimeRecords: pickArray<IOvertimeRecord>('overtimeRecords', o => isNonEmptyString(o.employeeId_date) && typeof o.hours === 'number'),
    leaveRequests: pickArray<ILeaveRequest>('leaveRequests', l => isNonEmptyString(l.id)),
    shiftRosters: pickArray<IShiftRosterEntry>('shiftRosters', s => isNonEmptyString(s.employeeId_date)),
    ocrScans: pickArray<IOCREntry>('ocrScans', o => isNonEmptyString(o.id))
  };

  let settings: ISystemSettings | undefined;
  if (obj.settings && typeof obj.settings === 'object' && (obj.settings as ISystemSettings).rolePermissions) {
    // Hợp lệ hoá tối thiểu: có rolePermissions dạng object
    settings = { ...DEFAULT_SETTINGS, ...(obj.settings as ISystemSettings) };
    if (!settings.diligenceDeductionRules?.length) settings.diligenceDeductionRules = DEFAULT_SETTINGS.diligenceDeductionRules;
  }

  return { data, settings, skipped };
}

// ---------------------------------------------------------------------------
// Import (atomic)
// ---------------------------------------------------------------------------

export async function importDatabaseFromSnapshot(file: File): Promise<{
  employeesCount: number;
  timesheetsCount: number;
  overtimesCount: number;
  exportedAt: string;
  exportedBy: string;
  skippedTotal: number;
  settingsRestored: boolean;
}> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Tệp không parse được dưới dạng JSON.');
  }

  const { data, settings, skipped } = validateSnapshot(raw);

  // Toàn bộ thay thế nằm trong một transaction - fail ở bất kỳ đâu sẽ rollback toàn bộ
  await db.transaction(
    'rw',
    [db.employees, db.dailyTimesheets, db.overtimeRecords, db.leaveRequests, db.shiftRosters, db.ocrScans, db.settings],
    async () => {
      await Promise.all([
        db.employees.clear(),
        db.dailyTimesheets.clear(),
        db.overtimeRecords.clear(),
        db.leaveRequests.clear(),
        db.shiftRosters.clear(),
        db.ocrScans.clear()
      ]);

      await Promise.all([
        data.employees.length && db.employees.bulkPut(data.employees),
        data.dailyTimesheets.length && db.dailyTimesheets.bulkPut(data.dailyTimesheets),
        data.overtimeRecords.length && db.overtimeRecords.bulkPut(data.overtimeRecords),
        data.leaveRequests.length && db.leaveRequests.bulkPut(data.leaveRequests),
        data.shiftRosters.length && db.shiftRosters.bulkPut(data.shiftRosters),
        data.ocrScans.length && db.ocrScans.bulkPut(data.ocrScans)
      ]);

      if (settings) {
        await db.settings.put({ key: 'systemSettings', value: settings });
      }
    }
  );

  const skippedTotal = Object.values(skipped).reduce((s, n) => s + n, 0);

  return {
    employeesCount: data.employees.length,
    timesheetsCount: data.dailyTimesheets.length,
    overtimesCount: data.overtimeRecords.length,
    exportedAt: String((raw as IDatabaseSnapshot).exportedAt ?? ''),
    exportedBy: String((raw as IDatabaseSnapshot).exportedBy ?? ''),
    skippedTotal,
    settingsRestored: !!settings
  };
}
