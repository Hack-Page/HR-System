import Dexie, { Table } from 'dexie';
import {
  IEmployee,
  IRawAttendanceLog,
  IDailyTimesheetCell,
  IOvertimeRecord,
  ILeaveRequest,
  IShiftRosterEntry,
  IOCREntry,
  ISystemSettings,
  IAccount
} from '../types';

export class HRSystemDatabase extends Dexie {
  employees!: Table<IEmployee, string>;
  rawAttendanceLogs!: Table<IRawAttendanceLog, number>;
  dailyTimesheets!: Table<IDailyTimesheetCell, string>;
  overtimeRecords!: Table<IOvertimeRecord, string>;
  leaveRequests!: Table<ILeaveRequest, string>;
  shiftRosters!: Table<IShiftRosterEntry, string>;
  ocrScans!: Table<IOCREntry, string>;
  settings!: Table<{ key: string; value: any }, string>;
  accounts!: Table<IAccount, string>;

  constructor() {
    super('HRSystem_LeggettPlatt_DB');

    this.version(2).stores({
      employees: 'employeeId, erpId, fullName, department, shiftClassId, contractType, status',
      rawAttendanceLogs: '++id, employeeId, date, [employeeId+date], departmentCode',
      dailyTimesheets: 'employeeId_date, employeeId, date, statusCode, month, year',
      overtimeRecords: 'employeeId_date, employeeId, date, verificationStatus, month, year',
      leaveRequests: 'id, employeeId, date, leaveType, status',
      shiftRosters: 'employeeId_date, employeeId, date, shiftCode',
      ocrScans: 'id, extractedEmployeeId, extractedDate, matchStatus, scanTimestamp',
      settings: 'key'
    });

    // v3: bảng tài khoản đăng nhập cục bộ
    this.version(3).stores({
      accounts: 'username, role'
    });
  }
}

export const db = new HRSystemDatabase();

// Default initial settings
export const DEFAULT_SETTINGS: ISystemSettings = {
  overtimeRounding: 'exact',
  defaultAnnualLeaveQuota: 12,
  diligenceDeductionRules: [
    {
      department: 'ALL',
      twoDaysULPenaltyPct: 50,
      threeDaysULPenaltyPct: 100
    }
  ],
  nightShiftAllowanceRate: 30,
  rolePermissions: {
    'HR Manager': ['ALL_ACCESS'],
    'HR Admin': ['VIEW_DASHBOARD', 'MANAGE_EMPLOYEES', 'IMPORT_LOGS', 'MANAGE_TIMESHEET', 'MANAGE_OT', 'MANAGE_LEAVE', 'MANAGE_ROSTER', 'SCAN_OCR'],
    'Warehouse Admin': ['VIEW_DEPT_DASHBOARD', 'VIEW_DEPT_EMPLOYEES', 'VIEW_DEPT_TIMESHEET', 'PROPOSE_DEPT_OT', 'VIEW_DEPT_LEAVE', 'MANAGE_DEPT_ROSTER', 'SCAN_DEPT_OCR'],
    'Production Admin': ['VIEW_DEPT_DASHBOARD', 'VIEW_DEPT_EMPLOYEES', 'VIEW_DEPT_TIMESHEET', 'PROPOSE_DEPT_OT', 'VIEW_DEPT_LEAVE', 'MANAGE_DEPT_ROSTER', 'SCAN_DEPT_OCR'],
    'QC Admin': ['VIEW_DEPT_DASHBOARD', 'VIEW_DEPT_EMPLOYEES', 'VIEW_DEPT_TIMESHEET', 'PROPOSE_DEPT_OT', 'VIEW_DEPT_LEAVE', 'MANAGE_DEPT_ROSTER', 'SCAN_DEPT_OCR'],
    'AD System': ['ALL_ACCESS', 'SYSTEM_SETTINGS', 'MANAGE_ROLES_PERMISSIONS']
  }
};
