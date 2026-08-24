---
name: in-browser-backend-engine
description: Architecture, Dexie.js IndexedDB schema, Web Worker streaming execution, and formula engine for Single-File In-Browser Backend.
---

# In-Browser Backend Engine Architecture

## 1. Zero-Server / Local-First Database Architecture
The entire backend runs client-side inside the user's browser using **Dexie.js** (IndexedDB).

### Dexie.js Database Schema (`HRSystemDB`)
```typescript
import Dexie, { Table } from 'dexie';

export class HRSystemDatabase extends Dexie {
  employees!: Table<IEmployee, string>; // key: employeeId (LEPxxx)
  rawAttendanceLogs!: Table<IRawAttendanceLog, number>; // auto-increment
  dailyTimesheets!: Table<IDailyTimesheet, string>; // key: employeeId_date
  overtimeRecords!: Table<IOvertimeRecord, string>; // key: employeeId_date
  leaveRequests!: Table<ILeaveRequest, string>; // key: id
  shiftRosters!: Table<IShiftRoster, string>; // key: employeeId_date
  ocrScans!: Table<IOCREntry, string>; // key: id
  systemSettings!: Table<ISystemSetting, string>; // key: key
  userRoles!: Table<IUserRole, string>; // key: roleId

  constructor() {
    super('HRSystem_LeggettPlatt_DB');
    this.version(1).stores({
      employees: 'employeeId, erpId, name, department, shiftType, contractType, status',
      rawAttendanceLogs: '++id, employeeId, date, [employeeId+date], departmentCode',
      dailyTimesheets: '[employeeId+date], employeeId, date, status, month, year',
      overtimeRecords: '[employeeId+date], employeeId, date, verificationStatus, month, year',
      leaveRequests: 'id, employeeId, date, leaveType, status',
      shiftRosters: '[employeeId+date], employeeId, date, shiftCode, isViolation',
      ocrScans: 'id, employeeId, date, matchStatus, scanTimestamp',
      systemSettings: 'key',
      userRoles: 'roleId'
    });
  }
}
```

## 2. Multi-Threaded Web Worker Pipeline
To process files with >20,000 rows without dropping frames:
1. **`timesheet-parser.worker.ts`**:
   - Accepts raw ArrayBuffer of `2107-20082026.xlsx`.
   - Uses SheetJS stream chunking (chunks of 1,000 rows).
   - Direct batch insertion to IndexedDB (`bulkPut`).
   - Computes daily attendance codes (`W`, `N`, `Off`, `WO`, etc.) and pushes `Off` entries into pending leave queue.
2. **`formula-engine.worker.ts`**:
   - Executes Excel COUNTIF / Arithmetic formulas dynamically for all 58 columns.
   - Calculates night shifts, late/early penalties, productivity bonus, diligence allowance, hazardous pay, and firefighting allowance.
3. **Export Engine (`exceljs-exporter.ts`)**:
   - Builds Excel file matching `KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx`.
   - Embeds `Leggett.jpg` image in header.
   - Applies styles, freeze panes, formulas, and cell borders.
