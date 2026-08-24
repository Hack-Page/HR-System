export type RoleType = 
  | 'HR Manager' 
  | 'HR Admin' 
  | 'Warehouse Admin' 
  | 'Production Admin' 
  | 'QC Admin' 
  | 'AD System';

export type LanguageType = 'vi' | 'en';

export type ShiftClassType = 
  | 'OFFICE_M_F'    // Hành chính văn phòng: Thứ 2 - Thứ 6 (7:30 - 16:00), công chuẩn 23
  | 'OFFICE_M_S'    // Hành chính chung: Thứ 2 - Thứ 7 (7:30 - 16:00), công chuẩn 27
  | 'SHIFT_1'       // Ca 1: 06:00 - 14:00 (xoay ca)
  | 'SHIFT_2';      // Ca 2: 14:00 - 22:00 (xoay ca)

export type ContractType = 
  | 'OFFICIAL'      // Chính thức: Chu kỳ công 21 -> 20 tháng sau
  | 'SEASONAL';     // Thời vụ: Chu kỳ công 1 -> 31 hàng tháng

export type EmployeeStatus = 'ACTIVE' | 'RESIGNED' | 'MATERNITY';

export interface ICustomAllowances {
  pcccAllowance: number;      // Phụ cấp PCCC (ví dụ 3 NV bảo trì)
  hazardousAllowance: number; // Phụ cấp độc hại (bộ phận chuyền sơn)
  diligenceBonus: number;     // Tiền chuyên cần (mặc định 500,000)
  productivityBonus: number;  // Thưởng năng suất
  tradeUnionFee: number;      // Trừ đoàn phí (mặc định -40,000 VND)
  otherFees: number;          // Chi phí khác
}

export interface IAnnualLeaveBalance {
  initialQuota: number;       // Hạn mức phép năm ban đầu (linh hoạt, HR chỉnh sửa)
  usedDays: number;           // Số ngày đã dùng
  remainingDays: number;      // Số ngày còn lại
}

export interface IEmployee {
  employeeId: string;         // Khóa chính: LEP001, LEP010, ...
  erpId?: string;             // Mã ERP/Chấm công: 1013789
  fullName: string;           // Tên nhân viên
  department: string;         // Finance, Production, WH, Logistics, QC, EHS, Sales, IT
  position: string;           // Chức vụ
  startDate: string;          // DD/MM/YYYY
  contractType: ContractType;
  shiftClassId: ShiftClassType;
  customAllowances: ICustomAllowances;
  annualLeaveBalance: IAnnualLeaveBalance;
  status: EmployeeStatus;
  resignedDate?: string;
  notes?: string;
}

export interface IRawAttendanceLog {
  id?: number;
  employeeId: string;
  fullName: string;
  departmentCode: string;     // Composite key LEP04046224
  date: string;               // YYYY-MM-DD
  dayOfWeek: string;          // Ba, Tư, Năm, Sáu, Bảy, CN, Hai
  checkIn: string;            // HH:mm
  checkOut: string;           // HH:mm
  lateMinutes: number;        // Phút đi trễ
  earlyMinutes: number;       // Phút về sớm
  workUnits: number;          // Công (0, 0.5, 1)
  totalHours: number;         // Tổng giờ
  overtimeHours: number;      // Giờ tăng ca
  totalOverall?: number;
  shiftName?: string;
}

export type AttendanceStatusCode = 
  | 'W'         // Đi làm đầy đủ
  | 'N'         // Đi ca đêm
  | 'Off'       // Vắng không quẹt thẻ (Chờ bù phép)
  | 'WO'        // Nghỉ hàng tuần (Weekly Off)
  | 'AL'        // Nghỉ phép năm
  | 'UL'        // Nghỉ không lương
  | 'SL'        // Nghỉ ốm / bệnh
  | 'PL'        // Nghỉ phép chế độ có lương (tang, cưới)
  | 'PH'        // Nghỉ lễ
  | 'BT'        // Công tác
  | 'W/2 AL/2'  // Nửa ngày làm, nửa ngày phép
  | 'W/2 UL/2'  // Nửa ngày làm, nửa ngày không lương
  | 'AL/2 UL/2' // Nửa ngày phép, nửa ngày không lương
  | 'MATERNITY LEAVE' // Nghỉ thai sản
  | 'RESIGNED'  // Đã nghỉ việc
  | '';         // Trống (ngày nghỉ)

export interface IDailyTimesheetCell {
  employeeId_date: string;    // LEP010_2026-07-21
  employeeId: string;
  date: string;               // YYYY-MM-DD
  dayIndex: number;           // 1..31
  statusCode: AttendanceStatusCode;
  checkIn?: string;
  checkOut?: string;
  lateMinutes?: number;
  earlyMinutes?: number;
  isViolation?: boolean;
  violationNote?: string;
  calculatedOvertime: number;
  month: number;
  year: number;
}

export type OvertimeVerificationStatus = 'PENDING' | 'MATCHED' | 'MISMATCH';

export interface IOvertimeRecord {
  employeeId_date: string;    // LEP010_2026-07-21
  employeeId: string;
  date: string;               // YYYY-MM-DD
  dayOfWeek: string;
  hours: number;              // Số giờ tăng ca chuẩn (phút / 60)
  dayType: 'WEEKDAY' | 'SUNDAY' | 'HOLIDAY';
  verificationStatus: OvertimeVerificationStatus;
  ocrExtractedHours?: number;
  ocrConfidence?: number;
  mismatchReason?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  month: number;
  year: number;
}

export type LeaveType = 'AL' | 'UL' | 'SL' | 'PL' | 'BT' | 'MATERNITY' | 'UNAUTHORIZED';

export interface ILeaveRequest {
  id: string;                 // UUID / ID
  employeeId: string;
  fullName: string;
  department: string;
  date: string;               // YYYY-MM-DD
  leaveType: LeaveType;
  durationDays: number;       // 1 hoặc 0.5
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
}

export interface IShiftRosterEntry {
  employeeId_date: string;    // LEP010_2026-07-21
  employeeId: string;
  fullName: string;
  department: string;
  date: string;               // YYYY-MM-DD
  shiftCode: ShiftClassType;
  startTime: string;          // 06:00, 14:00, 07:30
  endTime: string;            // 14:00, 22:00, 16:00
  previousShiftEndTime?: string; // Giờ kết thúc ca trước
  restHours?: number;         // Khoảng nghỉ giữa 2 ca
  isRestViolation: boolean;   // true nếu restHours < 12
  violationDetails?: string;
}

export interface IOCREntry {
  id: string;
  fileName: string;
  scanTimestamp: string;
  extractedEmployeeId?: string;
  extractedDate?: string;
  extractedHours?: number;
  rawText: string;
  confidence: number;
  matchStatus: 'MATCHED' | 'MISMATCH' | 'NOT_FOUND';
  details?: string;
}

export interface ISystemSettings {
  overtimeRounding: 'exact' | '15min' | '30min';
  defaultAnnualLeaveQuota: number;
  diligenceDeductionRules: {
    department: string;       // 'ALL' hoặc tên phòng ban
    twoDaysULPenaltyPct: number;   // 50%
    threeDaysULPenaltyPct: number; // 100%
  }[];
  nightShiftAllowanceRate: number; // Tỷ lệ phụ cấp ca đêm
  rolePermissions: Record<RoleType, string[]>;
}
