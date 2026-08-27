import React, { createContext, useContext, useState, ReactNode } from 'react';
import { LanguageType } from '../types';

const DICTIONARY = {
  vi: {
    // Navigation
    dashboard: 'Tổng Quan Báo Cáo',
    employees: 'Danh Mục Nhân Viên',
    timesheet: 'Bảng Chấm Công',
    overtime: 'Quản Lý Tăng Ca',
    leavePending: 'Danh Sách Chờ Bù Phép',
    shiftRoster: 'Phân Ca & Xoay Ca',
    shiftAssignment: 'Sắp Xếp Ca Làm Việc',
    ocrVerification: 'Đối Soát OCR Phiếu Tăng Ca',
    settings: 'Cài Đặt & Phân Quyền',
    
    // Header & Common
    systemTitle: 'SmartHR Leggett & Platt',
    role: 'Vai trò',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    searchPlaceholder: 'Tìm kiếm theo tên, mã NV (LEPxxx)...',
    importExcel: 'Nạp dữ liệu chấm công',
    exportExcel: 'Xuất Bảng Chốt Công Excel',
    loading: 'Đang tải dữ liệu...',
    saveChanges: 'Lưu thay đổi',
    cancel: 'Hủy bỏ',
    confirm: 'Xác nhận',
    actions: 'Thao tác',
    status: 'Trạng thái',
    department: 'Bộ phận',
    
    // Dashboard metrics
    totalEmployees: 'Tổng Số Nhân Viên',
    officialEmployees: 'Nhân Viên Chính Thức',
    seasonalEmployees: 'Nhân Viên Thời Vụ',
    shift1Count: 'Nhân Viên Ca 1 (6h-14h)',
    shift2Count: 'Nhân Viên Ca 2 (14h-22h)',
    officeCount: 'Nhân Viên Hành Chính',
    resignedThisMonth: 'Nghỉ Việc Tháng Này',
    newHiresThisMonth: 'Nhận Việc Tháng Này',
    turnoverRate: 'Tỷ Lệ Nghỉ Việc',
    lateDeparturesRate: 'Tỷ Lệ Đi Trễ',
    missingPunchRate: 'Tỷ Lệ Thiếu Quẹt Thẻ',
    shiftViolation12h: 'Vi Phạm Nghỉ < 12 Giờ Khi Đổi Ca',
    viewDetails: 'Xem chi tiết',
    welcomeBack: 'Chào mừng trở lại,',
    kpiTotalEmployees: 'Tổng Số Nhân Viên',
    kpiEmployeesOnShift: 'Tổng Số Nhân Viên Đang Đi Ca',
    kpiNewHiresMonth: 'Tổng Số Nhân Viên Nhận Việc Tháng Này',
    kpiResignedMonth: 'Tổng Số Nhân Viên Nghỉ Việc Tháng Này',
    kpiTurnoverMonth: 'Tỷ Lệ Nhân Viên Nghỉ Việc Trong Tháng',
    kpiOvertimeMonth: 'Tổng Giờ Tăng Ca Tháng Này',
    kpiLateEarly: 'Tổng Nhân Viên Đi Trễ / Về Sớm',
    kpiMissingPunch: 'Tổng Số Nhân Viên Không Bấm Thẻ',
    chartEmployeesByDept: 'Employees By Department',
    chartAttendanceOverview: 'Attendance Overview',
    chartTopViolators: 'Top 10 Nhân Viên Vi Phạm',
    chartPendingHalfDay: 'Nghỉ Chưa Bù & Nửa Ngày',
    
    // Table & Matrix
    employeeId: 'Mã NV',
    fullName: 'Họ và Tên',
    position: 'Chức Vụ',
    startDate: 'Ngày Vào Làm',
    totalWD: 'Công Thực Tế',
    stdWD: 'Công Chuẩn',
    annualLeave: 'Phép Năm (AL)',
    unpaidLeave: 'Không Lương (UL)',
    sickLeave: 'Phép Bệnh (SL)',
    paidLeave: 'Phép Chế Độ (PL)',
    holiday: 'Nghỉ Lễ (PH)',
    nightShifts: 'Số Ngày Ca Đêm (N)',
    lateEarly: 'Đi Trễ / Về Sớm',
    allowances: 'Phụ Cấp & Chuyên Cần',
    pcccAllowance: 'Trợ Cấp PCCC',
    hazardousAllowance: 'Tiền Độc Hại',
    diligenceBonus: 'Tiền Chuyên Cần',
    tradeUnionFee: 'Đoàn Phí (-40k)',
  },
  en: {
    // Navigation
    dashboard: 'Executive Dashboard',
    employees: 'Employee Master List',
    timesheet: 'Timesheet',
    overtime: 'Overtime Management',
    leavePending: 'Pending Leave Compensation',
    shiftRoster: 'Shift Roster & Rotation',
    shiftAssignment: 'Shift Assignment',
    ocrVerification: 'OCR Overtime Verification',
    settings: 'Settings & Dynamic RBAC',
    
    // Header & Common
    systemTitle: 'SmartHR Leggett & Platt',
    role: 'Role',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    searchPlaceholder: 'Search by employee name, ID (LEPxxx)...',
    importExcel: 'Import Attendance Log (20k rows)',
    exportExcel: 'Export Payroll Summary Excel',
    loading: 'Loading data...',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    confirm: 'Confirm',
    actions: 'Actions',
    status: 'Status',
    department: 'Department',
    
    // Dashboard metrics
    totalEmployees: 'Total Headcount',
    officialEmployees: 'Permanent Employees',
    seasonalEmployees: 'Contract / Seasonal',
    shift1Count: 'Shift 1 (06:00 - 14:00)',
    shift2Count: 'Shift 2 (14:00 - 22:00)',
    officeCount: 'Administrative Shifts',
    resignedThisMonth: 'Resigned This Month',
    newHiresThisMonth: 'New Hires This Month',
    turnoverRate: 'Turnover Rate',
    lateDeparturesRate: 'Tardiness Rate',
    missingPunchRate: 'Missing Punch Rate',
    shiftViolation12h: '< 12h Rest Violations on Shift Rotation',
    viewDetails: 'View Details',
    welcomeBack: 'Welcome Back,',
    kpiTotalEmployees: 'Total Employees',
    kpiEmployeesOnShift: 'Employees On Shift',
    kpiNewHiresMonth: 'New Hires This Month',
    kpiResignedMonth: 'Resigned This Month',
    kpiTurnoverMonth: 'Monthly Turnover Rate',
    kpiOvertimeMonth: 'Total Overtime Hours This Month',
    kpiLateEarly: 'Late / Early Departures',
    kpiMissingPunch: 'Missing Punch In/Out',
    chartEmployeesByDept: 'Employees By Department',
    chartAttendanceOverview: 'Attendance Overview',
    chartTopViolators: 'Top 10 Violators',
    chartPendingHalfDay: 'Pending & Half-Day Leave',
    
    // Table & Matrix
    employeeId: 'Emp ID',
    fullName: 'Full Name',
    position: 'Position',
    startDate: 'Start Date',
    totalWD: 'Actual Working Days',
    stdWD: 'Standard Working Days',
    annualLeave: 'Annual Leave (AL)',
    unpaidLeave: 'Unpaid Leave (UL)',
    sickLeave: 'Sick Leave (SL)',
    paidLeave: 'Special Paid Leave (PL)',
    holiday: 'Public Holiday (PH)',
    nightShifts: 'Night Shifts (N)',
    lateEarly: 'Late / Early Minutes',
    allowances: 'Allowances & Bonuses',
    pcccAllowance: 'Firefighting Allowance',
    hazardousAllowance: 'Hazardous Pay',
    diligenceBonus: 'Diligence Bonus',
    tradeUnionFee: 'Trade Union Fee (-40k)',
  }
};

interface LanguageContextType {
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  toggleLanguage: () => void;
  t: (key: keyof typeof DICTIONARY['vi']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageType>(() => {
    return (localStorage.getItem('smarthr_lang') as LanguageType) || 'vi';
  });

  const setLanguage = (lang: LanguageType) => {
    setLanguageState(lang);
    localStorage.setItem('smarthr_lang', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'vi' ? 'en' : 'vi');
  };

  const t = (key: keyof typeof DICTIONARY['vi']): string => {
    return DICTIONARY[language][key] || DICTIONARY['vi'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
