import { db } from '../db';
import initialEmployees from '../data/initial-employees.json';
import initialTimesheets from '../data/initial-timesheets.json';
import initialOvertimes from '../data/initial-overtimes.json';
import { IEmployee, IDailyTimesheetCell, IOvertimeRecord, IShiftRosterEntry, ILeaveRequest } from '../types';

export async function seedDatabaseIfEmpty() {
  const empCount = await db.employees.count();
  if (empCount === 0) {
    console.log('Seeding Dexie.js database with initial Leggett & Platt data...');
    
    // Seed employees
    await db.employees.bulkPut(initialEmployees as unknown as IEmployee[]);
    
    // Seed timesheets
    await db.dailyTimesheets.bulkPut(initialTimesheets as unknown as IDailyTimesheetCell[]);
    
    // Seed overtimes
    await db.overtimeRecords.bulkPut(initialOvertimes as unknown as IOvertimeRecord[]);
    
    // Seed initial shift rosters and detect rest violations
    const shiftRosters: IShiftRosterEntry[] = [];
    const leaveRequests: ILeaveRequest[] = [];

    // Let's create some sample shift rotations including a 12h rest violation test case
    const prodEmps = (initialEmployees as unknown as IEmployee[]).filter(e => e.department === 'Production');
    
    prodEmps.slice(0, 15).forEach((emp, idx) => {
      // Day 1 (2026-07-21): Shift 2 (14:00 - 22:00)
      shiftRosters.push({
        employeeId_date: `${emp.employeeId}_2026-07-21`,
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department,
        date: '2026-07-21',
        shiftCode: 'SHIFT_2',
        startTime: '14:00',
        endTime: '22:00',
        isRestViolation: false
      });

      // Day 2 (2026-07-22): If idx < 3, rotate to Shift 1 (06:00 - 14:00) -> 8h rest -> VIOLATION!
      const isViolating = idx < 3;
      shiftRosters.push({
        employeeId_date: `${emp.employeeId}_2026-07-22`,
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department,
        date: '2026-07-22',
        shiftCode: isViolating ? 'SHIFT_1' : 'SHIFT_2',
        startTime: isViolating ? '06:00' : '14:00',
        endTime: isViolating ? '14:00' : '22:00',
        previousShiftEndTime: '22:00',
        restHours: isViolating ? 8 : 16,
        isRestViolation: isViolating,
        violationDetails: isViolating ? 'Nghỉ 8 giờ giữa Ca 2 (kết thúc 22h) và Ca 1 (bắt đầu 06h) < 12h quy định' : undefined
      });
    });

    // Populate initial pending leave requests for employees with 'Off' or 'UL'
    const pendingOffs = (initialTimesheets as unknown as IDailyTimesheetCell[]).filter(t => t.statusCode === 'Off' || t.statusCode === 'UL').slice(0, 8);
    pendingOffs.forEach((item, idx) => {
      const emp = (initialEmployees as unknown as IEmployee[]).find(e => e.employeeId === item.employeeId);
      if (emp) {
        leaveRequests.push({
          id: `leave_${item.employeeId}_${item.date}`,
          employeeId: item.employeeId,
          fullName: emp.fullName,
          department: emp.department,
          date: item.date,
          leaveType: 'AL',
          durationDays: 1,
          status: 'PENDING',
          reason: 'Vắng mặt không quẹt thẻ ngày làm việc, chờ bù phép'
        });
      }
    });

    await db.shiftRosters.bulkPut(shiftRosters);
    await db.leaveRequests.bulkPut(leaveRequests);

    console.log('Database seeded successfully!');
  }
}
