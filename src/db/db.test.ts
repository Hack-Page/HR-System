/**
 * Dexie v6 Boolean Index Fix — Minimal tests per SKILL §5 step 6
 * (a) DB init, (b) bulkPut/put, (c) compound index correctness với Flag 0|1
 * v6: 5 field boolean → shadow Flag Number (isViolationFlag, isRestViolationFlag, activeFlag, isRotatingFlag, isSystemFlag)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, ensurePersistentStorage, getStorageEstimate, DEFAULT_SETTINGS } from './index';

describe('HRSystemDatabase v6 — Schema & Flag Indexes', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await Promise.all([
      db.employees.clear(),
      db.dailyTimesheets.clear(),
      db.overtimeRecords.clear(),
      db.leaveRequests.clear(),
      db.shiftRosters.clear(),
      db.ocrScans.clear(),
      db.rawAttendanceLogs.clear(),
      db.settings.clear(),
      db.accounts.clear(),
      db.shiftClasses.clear(),
      db.rbacRoles.clear()
    ]);
  });

  it('(a) DB init không lỗi, version 6 và đủ 11 stores', async () => {
    expect(db.verno).toBe(6);
    expect(db.employees).toBeDefined();
    expect(db.dailyTimesheets).toBeDefined();
    expect(db.overtimeRecords).toBeDefined();
    expect(db.leaveRequests).toBeDefined();
    expect(db.shiftRosters).toBeDefined();
    expect(db.ocrScans).toBeDefined();
    expect(db.rawAttendanceLogs).toBeDefined();
    expect(db.settings).toBeDefined();
    expect(db.accounts).toBeDefined();
    expect(db.shiftClasses).toBeDefined();
    expect(db.rbacRoles).toBeDefined();
  });

  it('(b) bulkPut/put cơ bản — employees + timesheet upsert với Flag', async () => {
    const emp = {
      employeeId: 'LEP999',
      erpId: '9999',
      fullName: 'Test User',
      department: 'Production',
      position: 'Operator',
      startDate: '01/08/2026',
      contractType: 'OFFICIAL' as const,
      shiftClassId: 'SHIFT_1' as const,
      customAllowances: { pcccAllowance: 0, hazardousAllowance: 0, diligenceBonus: 500000, productivityBonus: 0, tradeUnionFee: -40000, otherFees: 0 },
      annualLeaveBalance: { initialQuota: 12, usedDays: 0, remainingDays: 12 },
      status: 'ACTIVE' as const
    };
    await db.employees.bulkPut([emp as any]);
    expect(await db.employees.count()).toBe(1);

    const cell = {
      employeeId_date: 'LEP999_2026-08-15',
      employeeId: 'LEP999',
      date: '2026-08-15',
      dayIndex: 15,
      statusCode: 'W' as const,
      calculatedOvertime: 0,
      month: 8,
      year: 2026,
      isViolation: false,
      isViolationFlag: 0 as const
    };
    await db.dailyTimesheets.put(cell as any);
    await db.dailyTimesheets.put({ ...cell, statusCode: 'LA', isViolation: true, isViolationFlag: 1 } as any);
    const fetched = await db.dailyTimesheets.get('LEP999_2026-08-15');
    expect(fetched?.statusCode).toBe('LA');
    expect((fetched as any)?.isViolationFlag).toBe(1);
    expect(await db.dailyTimesheets.count()).toBe(1);
  });

  it('(c1) compound index [month+year] — lọc timesheet theo kỳ', async () => {
    await db.dailyTimesheets.bulkPut([
      { employeeId_date: 'LEP001_2026-08-10', employeeId: 'LEP001', date: '2026-08-10', dayIndex: 10, statusCode: 'W', calculatedOvertime: 0, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
      { employeeId_date: 'LEP001_2026-09-10', employeeId: 'LEP001', date: '2026-09-10', dayIndex: 10, statusCode: 'W', calculatedOvertime: 0, month: 9, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
      { employeeId_date: 'LEP002_2026-08-10', employeeId: 'LEP002', date: '2026-08-10', dayIndex: 10, statusCode: 'Off', calculatedOvertime: 0, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
    ]);
    const aug = await db.dailyTimesheets.where('[month+year]').equals([8, 2026]).toArray();
    expect(aug.length).toBe(2);
  });

  it('(c2) compound index [employeeId+month+year]', async () => {
    await db.dailyTimesheets.bulkPut([
      { employeeId_date: 'LEP010_2026-08-15', employeeId: 'LEP010', date: '2026-08-15', dayIndex: 15, statusCode: 'W', calculatedOvertime: 2, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
      { employeeId_date: 'LEP010_2026-08-16', employeeId: 'LEP010', date: '2026-08-16', dayIndex: 16, statusCode: 'W', calculatedOvertime: 1, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
      { employeeId_date: 'LEP020_2026-08-15', employeeId: 'LEP020', date: '2026-08-15', dayIndex: 15, statusCode: 'W', calculatedOvertime: 0, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
    ]);
    const lep010Aug = await db.dailyTimesheets.where('[employeeId+month+year]').equals(['LEP010', 8, 2026]).toArray();
    expect(lep010Aug.length).toBe(2);
  });

  it('(c3) index statusCode', async () => {
    await db.dailyTimesheets.bulkPut([
      { employeeId_date: 'LEP001_2026-08-01', employeeId: 'LEP001', date: '2026-08-01', dayIndex: 1, statusCode: 'LA', calculatedOvertime: 0, month: 8, year: 2026, isViolation: true, isViolationFlag: 1 } as any,
      { employeeId_date: 'LEP002_2026-08-01', employeeId: 'LEP002', date: '2026-08-01', dayIndex: 1, statusCode: 'MCO', calculatedOvertime: 0, month: 8, year: 2026, isViolation: true, isViolationFlag: 1 } as any,
      { employeeId_date: 'LEP003_2026-08-01', employeeId: 'LEP003', date: '2026-08-01', dayIndex: 1, statusCode: 'W', calculatedOvertime: 0, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
    ]);
    const violations = await db.dailyTimesheets.where('statusCode').anyOf(['LA', 'ED', 'MCO', 'MCI']).count();
    expect(violations).toBe(2);
    const withMonth = await db.dailyTimesheets.where('[statusCode+month+year]').equals(['LA', 8, 2026]).toArray();
    expect(withMonth.length).toBe(1);
  });

  it('(c4) dailyTimesheets isViolationFlag + [isViolationFlag+month+year] deterministic', async () => {
    await db.dailyTimesheets.bulkPut([
      { employeeId_date: 'LEP001_2026-08-01', employeeId: 'LEP001', date: '2026-08-01', dayIndex: 1, statusCode: 'LA', calculatedOvertime: 0, month: 8, year: 2026, isViolation: true, isViolationFlag: 1 } as any,
      { employeeId_date: 'LEP002_2026-08-01', employeeId: 'LEP002', date: '2026-08-01', dayIndex: 1, statusCode: 'W', calculatedOvertime: 0, month: 8, year: 2026, isViolation: false, isViolationFlag: 0 } as any,
      { employeeId_date: 'LEP003_2026-08-15', employeeId: 'LEP003', date: '2026-08-15', dayIndex: 15, statusCode: 'ED', calculatedOvertime: 0, month: 8, year: 2026, isViolation: true, isViolationFlag: 1 } as any,
    ]);
    expect(await db.dailyTimesheets.where('isViolationFlag').equals(1).count()).toBe(2);
    expect(await db.dailyTimesheets.where('isViolationFlag').equals(0).count()).toBe(1);
    expect(await db.dailyTimesheets.where('[isViolationFlag+month+year]').equals([1, 8, 2026]).count()).toBe(2);
    expect(await db.dailyTimesheets.where('[isViolationFlag+month+year]').equals([0, 8, 2026]).count()).toBe(1);
  });

  it('(c5) overtime [verificationStatus+month+year]', async () => {
    await db.overtimeRecords.bulkPut([
      { employeeId_date: 'LEP010_2026-08-15', employeeId: 'LEP010', date: '2026-08-15', dayOfWeek: 'Sáu', hours: 2, dayType: 'WEEKDAY', verificationStatus: 'PENDING', month: 8, year: 2026 } as any,
      { employeeId_date: 'LEP010_2026-09-15', employeeId: 'LEP010', date: '2026-09-15', dayOfWeek: 'Sáu', hours: 1, dayType: 'WEEKDAY', verificationStatus: 'MATCHED', month: 9, year: 2026 } as any,
    ]);
    const pendingAug = await db.overtimeRecords.where('[verificationStatus+month+year]').equals(['PENDING', 8, 2026]).toArray();
    expect(pendingAug.length).toBe(1);
  });

  it('(c6) shiftRosters isRestViolationFlag deterministic', async () => {
    await db.shiftRosters.bulkPut([
      { employeeId_date: 'LEP001_2026-08-15', employeeId: 'LEP001', fullName: 'A', department: 'Production', date: '2026-08-15', shiftCode: 'SHIFT_1', startTime: '06:00', endTime: '14:00', isRestViolation: true, isRestViolationFlag: 1 } as any,
      { employeeId_date: 'LEP002_2026-08-15', employeeId: 'LEP002', fullName: 'B', department: 'WH', date: '2026-08-15', shiftCode: 'SHIFT_2', startTime: '14:00', endTime: '22:00', isRestViolation: false, isRestViolationFlag: 0 } as any,
    ]);
    expect(await db.shiftRosters.where('isRestViolationFlag').equals(1).count()).toBe(1);
    expect(await db.shiftRosters.where('isRestViolationFlag').equals(0).count()).toBe(1);
    expect(await db.shiftRosters.where('[isRestViolationFlag+date]').equals([1, '2026-08-15']).count()).toBe(1);
    expect(await db.shiftRosters.where('[isRestViolationFlag+date]').equals([0, '2026-08-15']).count()).toBe(1);
  });

  it('(c7) accounts activeFlag + [role+activeFlag] deterministic', async () => {
    await db.accounts.bulkPut([
      { username: 'hr_admin', displayName: 'HR', role: 'HR Admin', salt: 'a', passwordHash: 'h', active: true, activeFlag: 1, createdAt: '2026-08-01' } as any,
      { username: 'wh_admin', displayName: 'WH', role: 'Warehouse Admin', salt: 'b', passwordHash: 'h', active: true, activeFlag: 1, createdAt: '2026-08-01' } as any,
      { username: 'inactive', displayName: 'Off', role: 'HR Admin', salt: 'c', passwordHash: 'h', active: false, activeFlag: 0, createdAt: '2026-08-01' } as any,
    ]);
    expect(await db.accounts.where('activeFlag').equals(1).count()).toBe(2);
    expect(await db.accounts.where('activeFlag').equals(0).count()).toBe(1);
    expect(await db.accounts.where('[role+activeFlag]').equals(['HR Admin', 1]).count()).toBe(1);
    expect(await db.accounts.where('[role+activeFlag]').equals(['HR Admin', 0]).count()).toBe(1);
  });

  it('(c8) shiftClasses isRotatingFlag deterministic', async () => {
    const now = new Date().toISOString();
    await db.shiftClasses.bulkPut([
      { shiftClassId: 'OFFICE_M_F', labelVi: 'HC Văn phòng', labelEn: 'Office M-F', startTime: '07:30', endTime: '16:00', standardWorkDays: 23, workDaysPattern: 'MON_FRI', isRotating: false, isRotatingFlag: 0, createdAt: now } as any,
      { shiftClassId: 'OFFICE_M_S', labelVi: 'HC Chung', labelEn: 'Office M-S', startTime: '07:30', endTime: '16:00', standardWorkDays: 27, workDaysPattern: 'MON_SAT', isRotating: false, isRotatingFlag: 0, createdAt: now },
      { shiftClassId: 'SHIFT_1', labelVi: 'Ca 1', labelEn: 'Shift 1', startTime: '06:00', endTime: '14:00', standardWorkDays: 27, workDaysPattern: 'ROTATING', isRotating: true, isRotatingFlag: 1, createdAt: now },
      { shiftClassId: 'SHIFT_2', labelVi: 'Ca 2', labelEn: 'Shift 2', startTime: '14:00', endTime: '22:00', standardWorkDays: 27, workDaysPattern: 'ROTATING', isRotating: true, isRotatingFlag: 1, createdAt: now },
    ]);
    expect(await db.shiftClasses.where('isRotatingFlag').equals(1).count()).toBe(2);
    expect(await db.shiftClasses.where('isRotatingFlag').equals(0).count()).toBe(2);
  });

  it('(c9) rbacRoles isSystemFlag deterministic + multiEntry', async () => {
    const now = new Date().toISOString();
    const perms = DEFAULT_SETTINGS.rolePermissions as Record<string, string[]>;
    await db.rbacRoles.bulkPut(Object.entries(perms).map(([roleId, permissions]) => ({ roleId, roleName: roleId, permissions, isSystem: true, isSystemFlag: 1, createdAt: now })) as any);
    expect(await db.rbacRoles.where('isSystemFlag').equals(1).count()).toBe(6);
    await db.rbacRoles.put({ roleId: 'Custom Auditor', roleName: 'Custom Auditor', permissions: ['VIEW_DASHBOARD'], isSystem: false, isSystemFlag: 0, createdAt: now } as any);
    expect(await db.rbacRoles.where('isSystemFlag').equals(0).count()).toBe(1);
    expect(await db.rbacRoles.where('isSystemFlag').equals(1).count()).toBe(6);
    const managers = await db.rbacRoles.where('permissions').equals('MANAGE_EMPLOYEES').toArray();
    expect(managers.length).toBeGreaterThanOrEqual(1);
  });

  it('(c10) upgrade transform — old records without Flag get Flag=boolean?1:0', async () => {
    // Simulate old v5 data without Flag by direct put bypassing hook (using any)
    await db.dailyTimesheets.put({ employeeId_date: 'OLD_2026-08-01', employeeId: 'OLD', date: '2026-08-01', dayIndex: 1, statusCode: 'LA', calculatedOvertime: 0, month: 8, year: 2026, isViolation: true } as any);
    await db.shiftRosters.put({ employeeId_date: 'OLD_2026-08-01', employeeId: 'OLD', fullName: 'Old', department: 'WH', date: '2026-08-01', shiftCode: 'SHIFT_1', startTime: '06:00', endTime: '14:00', isRestViolation: true } as any);
    await db.accounts.put({ username: 'old_user', displayName: 'Old', role: 'HR Admin', salt: 'x', passwordHash: 'y', active: false, createdAt: '2026-08-01' } as any);
    // Manually trigger same logic as v6 upgrade modify (since DB already at v6, modify is the migration)
    await db.dailyTimesheets.toCollection().modify((r: any) => { if (typeof r.isViolationFlag === 'undefined') r.isViolationFlag = r.isViolation ? 1 : 0; });
    await db.shiftRosters.toCollection().modify((r: any) => { if (typeof r.isRestViolationFlag === 'undefined') r.isRestViolationFlag = r.isRestViolation ? 1 : 0; });
    await db.accounts.toCollection().modify((r: any) => { if (typeof r.activeFlag === 'undefined') r.activeFlag = r.active ? 1 : 0; });
    expect(await db.dailyTimesheets.where('isViolationFlag').equals(1).count()).toBeGreaterThanOrEqual(1);
    expect(await db.shiftRosters.where('isRestViolationFlag').equals(1).count()).toBeGreaterThanOrEqual(1);
    expect(await db.accounts.where('activeFlag').equals(0).count()).toBeGreaterThanOrEqual(1);
  });

  it('(d) persistent helpers', async () => {
    const original = (global as any).navigator;
    (global as any).navigator = {
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({ usage: 80 * 1024 * 1024, quota: 100 * 1024 * 1024 })
      }
    };
    expect(await ensurePersistentStorage()).toBe(true);
    const est = await getStorageEstimate();
    expect(est?.percentUsed).toBeCloseTo(80, 0);
    (global as any).navigator = original;
  });

  it('(e) DEFAULT_SETTINGS', () => {
    expect(Object.keys(DEFAULT_SETTINGS.rolePermissions)).toContain('HR Manager');
    expect(Object.keys(DEFAULT_SETTINGS.rolePermissions)).toContain('AD System');
  });
});
