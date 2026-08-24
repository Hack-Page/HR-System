import { db } from '../db';
import { IEmployee, IDailyTimesheetCell, IOvertimeRecord, ILeaveRequest, IShiftRosterEntry, IOCREntry, ISystemSettings } from '../types';

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

// 1. Export entire DB to a JSON file (Save directly to OneDrive shared folder)
export async function exportDatabaseToSnapshot(userName: string = 'HR Admin'): Promise<void> {
  const snapshot: IDatabaseSnapshot = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedBy: userName,
    employees: await db.employees.toArray(),
    dailyTimesheets: await db.dailyTimesheets.toArray(),
    overtimeRecords: await db.overtimeRecords.toArray(),
    leaveRequests: await db.leaveRequests.toArray(),
    shiftRosters: await db.shiftRosters.toArray(),
    ocrScans: await db.ocrScans.toArray()
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
  URL.revokeObjectURL(url);
}

// 2. Import entire DB snapshot from a JSON file (Loaded from OneDrive shared folder)
export async function importDatabaseFromSnapshot(file: File): Promise<{
  employeesCount: number;
  timesheetsCount: number;
  overtimesCount: number;
  exportedAt: string;
  exportedBy: string;
}> {
  const text = await file.text();
  const data: IDatabaseSnapshot = JSON.parse(text);

  if (!data.employees || !Array.isArray(data.employees)) {
    throw new Error('Tệp đồng bộ không hợp lệ hoặc bị lỗi cấu trúc dữ liệu.');
  }

  // Clear and bulk insert
  if (data.employees.length > 0) {
    await db.employees.clear();
    await db.employees.bulkPut(data.employees);
  }
  if (data.dailyTimesheets && data.dailyTimesheets.length > 0) {
    await db.dailyTimesheets.clear();
    await db.dailyTimesheets.bulkPut(data.dailyTimesheets);
  }
  if (data.overtimeRecords && data.overtimeRecords.length > 0) {
    await db.overtimeRecords.clear();
    await db.overtimeRecords.bulkPut(data.overtimeRecords);
  }
  if (data.leaveRequests && data.leaveRequests.length > 0) {
    await db.leaveRequests.clear();
    await db.leaveRequests.bulkPut(data.leaveRequests);
  }
  if (data.shiftRosters && data.shiftRosters.length > 0) {
    await db.shiftRosters.clear();
    await db.shiftRosters.bulkPut(data.shiftRosters);
  }
  if (data.ocrScans && data.ocrScans.length > 0) {
    await db.ocrScans.clear();
    await db.ocrScans.bulkPut(data.ocrScans);
  }

  return {
    employeesCount: data.employees.length,
    timesheetsCount: data.dailyTimesheets?.length || 0,
    overtimesCount: data.overtimeRecords?.length || 0,
    exportedAt: data.exportedAt,
    exportedBy: data.exportedBy
  };
}
