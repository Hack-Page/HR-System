import React, { useState, useMemo } from 'react';
import { 
  CalendarDays, 
  Search, 
  FileSpreadsheet,
  CalendarRange,
  Building2,
  Clock3,
  AlertTriangle
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { IEmployee, IDailyTimesheetCell, AttendanceStatusCode } from '../types';
import { computeEmployeeTimesheetSummary } from '../services/formula-engine';
import { generateCalendarDays, CalendarDay } from '../services/calendar-utils';
import { formatPayPeriodLabel } from '../services/pay-period';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { exportTimesheetToExcel } from '../services/excel-exporter';

export const TimesheetCalendarPage: React.FC = () => {
  const { success, warning } = useToast();
  const { departmentScope, hasPermission, systemSettings } = useAuth();
  const [cycleMode, setCycleMode] = useState<'SEASONAL' | 'OFFICIAL' | 'ALL'>('ALL');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number>(8);
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  const [activeEditCell, setActiveEditCell] = useState<{
    employee: IEmployee;
    cell: IDailyTimesheetCell;
    dateLabel: string;
  } | null>(null);

  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const timesheets = useLiveQuery(() => db.dailyTimesheets.toArray(), []) || [];
  const overtimes = useLiveQuery(() => db.overtimeRecords.toArray(), []) || [];

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (departmentScope && emp.department !== departmentScope) return false;
      if (selectedDept !== 'ALL' && emp.department !== selectedDept) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const m1 = emp.employeeId.toLowerCase().includes(q);
        const m2 = emp.fullName.toLowerCase().includes(q);
        if (!m1 && !m2) return false;
      }
      return true;
    });
  }, [employees, departmentScope, selectedDept, searchTerm]);

  const departments = Array.from(new Set(employees.map(e => e.department))).filter(Boolean);

  const timesheetMap = useMemo(() => {
    const map = new Map<string, IDailyTimesheetCell>();
    timesheets.forEach(ts => map.set(ts.employeeId_date, ts));
    return map;
  }, [timesheets]);

  const officialPayLabel = formatPayPeriodLabel(selectedMonth, selectedYear, 'OFFICIAL');
  const seasonalPayLabel = formatPayPeriodLabel(selectedMonth, selectedYear, 'SEASONAL');

  const officialDays = useMemo(() => generateCalendarDays(selectedMonth, selectedYear, 'OFFICIAL'), [selectedMonth, selectedYear]);
  const seasonalDays = useMemo(() => generateCalendarDays(selectedMonth, selectedYear, 'SEASONAL'), [selectedMonth, selectedYear]);

  const getCalendarForEmployee = (emp: IEmployee): CalendarDay[] => {
    if (cycleMode === 'OFFICIAL') return officialDays;
    if (cycleMode === 'SEASONAL') return seasonalDays;
    return emp.contractType === 'SEASONAL' ? seasonalDays : officialDays;
  };

  const calendarDaysSingle = cycleMode === 'OFFICIAL' ? officialDays : cycleMode === 'SEASONAL' ? seasonalDays : seasonalDays;

  const grouped = useMemo(() => {
    if (cycleMode !== 'ALL') return null;
    const official = filteredEmployees.filter(e => e.contractType === 'OFFICIAL');
    const seasonal = filteredEmployees.filter(e => e.contractType === 'SEASONAL');
    return { official, seasonal };
  }, [filteredEmployees, cycleMode]);

  const handleCellClick = (emp: IEmployee, day: CalendarDay) => {
    if (!hasPermission('MANAGE_TIMESHEET')) {
      warning?.('Không đủ quyền', 'Bạn không có quyền chỉnh sửa bảng chấm công (MANAGE_TIMESHEET).');
      return;
    }
    const key = `${emp.employeeId}_${day.dateStr}`;
    const cell = timesheetMap.get(key) || {
      employeeId_date: key,
      employeeId: emp.employeeId,
      date: day.dateStr,
      dayIndex: day.dayIndex,
      statusCode: '',
      calculatedOvertime: 0,
      month: day.monthNum,
      year: day.yearNum
    } as IDailyTimesheetCell;

    setActiveEditCell({
      employee: emp,
      cell: { ...cell },
      dateLabel: `${day.dayVi}, ${day.dayNum}/${day.monthNum}/${day.yearNum}`
    });
  };

  const handleSaveCell = async (newCode: AttendanceStatusCode) => {
    if (!activeEditCell) return;
    const updated = { ...activeEditCell.cell, statusCode: newCode };
    await db.dailyTimesheets.put(updated);
    success('Đã cập nhật công', `Nhân viên ${activeEditCell.employee.fullName} ngày ${activeEditCell.dateLabel} đã được chuyển sang mã "${newCode}".`);
    setActiveEditCell(null);
  };

  const handleExport = async () => {
    await exportTimesheetToExcel(filteredEmployees, timesheets, overtimes, selectedMonth, selectedYear, cycleMode === 'ALL' ? 'OFFICIAL' : cycleMode as any, systemSettings);
    const label = cycleMode === 'ALL' ? 'ALL (2 kỳ: Chính thức 21-20 + Thời vụ 1-31)' : cycleMode === 'OFFICIAL' ? `Chính thức ${officialPayLabel}` : `Thời vụ ${seasonalPayLabel}`;
    success(`Xuất file chốt công thành công!`, `Đã xuất ${filteredEmployees.length} nhân viên — ${label}`);
  };

  const renderTable = (emps: IEmployee[], days: CalendarDay[], title?: string) => {
    if (emps.length === 0) return (
      <div className="p-8 text-center text-xs text-slate-500 bg-slate-50/50 border-t">Không có nhân viên thuộc nhóm này</div>
    );
    return (
      <div className="overflow-x-auto overflow-y-auto max-h-[62vh] flex-1">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-900 text-white font-bold sticky top-0 z-30 shadow-md">
            <tr>
              <th className="py-2.5 px-2 bg-slate-900 sticky left-0 z-40 w-10 text-center border-r border-slate-800">#</th>
              <th className="py-2.5 px-2 bg-slate-900 sticky left-10 z-40 w-20 border-r border-slate-800">Mã NV</th>
              <th className="py-2.5 px-3 bg-slate-900 sticky left-[112px] z-40 min-w-[158px] max-w-[170px] border-r border-slate-800">Họ và Tên <span className="font-normal opacity-60 text-[10px]">(+Bộ phận)</span></th>
              {days.map((day) => (
                <th key={day.dayIndex} className={`py-1.5 px-1 text-center min-w-[36px] border-r border-slate-800 select-none ${day.isSunday ? 'bg-amber-950/80 text-amber-200' : (day.isSaturday ? 'bg-slate-800 text-slate-300' : 'bg-slate-900')}`}>
                  <div className="text-[10px] opacity-75">{day.dayVi}</div>
                  <div className="text-xs font-bold">{day.dayNum}</div>
                </th>
              ))}
              <th className="py-2.5 px-2 bg-indigo-950 text-indigo-200 text-center min-w-[72px] border-r border-indigo-900">Công Chuẩn<br/><span className="text-[10px] font-normal">AN</span></th>
              <th className="py-2.5 px-2 bg-emerald-950 text-emerald-200 text-center min-w-[76px] border-r border-emerald-900">Công Thực Tế<br/><span className="text-[10px] font-normal">AO</span></th>
              <th className="py-2.5 px-2 bg-blue-950 text-blue-200 text-center min-w-[65px] border-r border-blue-900">AL</th>
              <th className="py-2.5 px-2 bg-slate-800 text-slate-200 text-center min-w-[68px] border-r border-slate-700">UL<br/><span className="text-[10px] font-normal">+Off</span></th>
              <th className="py-2.5 px-2 bg-pink-950 text-pink-200 text-center min-w-[62px] border-r border-pink-900">SL</th>
              <th className="py-2.5 px-2 bg-amber-950 text-amber-200 text-center min-w-[62px] border-r border-amber-900">PH</th>
              <th className="py-2.5 px-2 bg-teal-950 text-teal-200 text-center min-w-[62px] border-r border-teal-900">PL</th>
              <th className="py-2.5 px-2 bg-indigo-950 text-indigo-200 text-center min-w-[68px] border-r border-indigo-900">Ca Đêm N</th>
              <th className="py-2.5 px-2 bg-slate-900 text-slate-200 text-center min-w-[72px] border-r border-slate-800">Trễ/Sớm</th>
              <th className="py-2.5 px-2 bg-emerald-950 text-emerald-200 text-center min-w-[96px] border-r border-emerald-900">Năng suất<br/><span className="text-[10px] font-normal">AW=(AO+AP)*BF/AN</span></th>
              <th className="py-2.5 px-2 bg-orange-950 text-orange-200 text-center min-w-[92px] border-r border-orange-900">Chuyên cần<br/><span className="text-[10px] font-normal">AX</span></th>
              <th className="py-2.5 px-2 bg-red-950 text-red-200 text-center min-w-[78px] border-r border-red-900">Độc hại<br/><span className="text-[10px] font-normal">AY</span></th>
              <th className="py-2.5 px-2 bg-amber-950 text-amber-200 text-center min-w-[78px] border-r border-amber-900">PCCC<br/><span className="text-[10px] font-normal">AZ</span></th>
              <th className="py-2.5 px-2 bg-slate-800 text-slate-200 text-center min-w-[84px] border-r border-slate-700">Chi phí khác<br/><span className="text-[10px] font-normal">BA</span></th>
              <th className="py-2.5 px-2 bg-slate-900 text-slate-200 text-center min-w-[78px]">Đoàn phí<br/><span className="text-[10px] font-normal">BB</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {emps.map((emp, empIdx) => {
              const empDays = getCalendarForEmployee(emp);
              const effectiveDays = cycleMode === 'ALL' ? empDays : days;
              const empCells: IDailyTimesheetCell[] = [];
              effectiveDays.forEach(d => {
                const c = timesheetMap.get(`${emp.employeeId}_${d.dateStr}`);
                if (c) empCells.push(c);
              });
              const deptRule = systemSettings.diligenceDeductionRules.find(r => r.department === emp.department) || systemSettings.diligenceDeductionRules.find(r => r.department === 'ALL') || systemSettings.diligenceDeductionRules[0];
              const prodBase = systemSettings.productivityBonusConfig?.useDepartmentOverride && systemSettings.productivityBonusConfig.departmentBaseRates?.[emp.department] != null
                ? systemSettings.productivityBonusConfig.departmentBaseRates[emp.department]!
                : (emp.customAllowances?.productivityBonus || systemSettings.productivityBonusConfig?.defaultBaseRate || 1000000);
              const diligenceBase = systemSettings.diligenceBonusConfig?.baseAmount ?? 500000;
              const summary = computeEmployeeTimesheetSummary(emp, empCells, {
                diligenceRules: deptRule ? { twoDaysULPenaltyPct: deptRule.twoDaysULPenaltyPct, threeDaysULPenaltyPct: deptRule.threeDaysULPenaltyPct } : undefined,
                diligenceBaseAmount: emp.customAllowances?.diligenceBonus || diligenceBase,
                productivityBaseRate: prodBase,
                productivityConfig: systemSettings.productivityBonusConfig
              });

              return (
                <tr key={emp.employeeId} className="hover:bg-orange-50/30 transition group">
                  <td className="py-2 px-2 bg-white group-hover:bg-orange-50/50 sticky left-0 z-20 text-center font-semibold text-slate-400 border-r border-slate-200">{empIdx + 1}</td>
                  <td className="py-2 px-2 bg-white group-hover:bg-orange-50/50 sticky left-10 z-20 font-bold text-slate-900 border-r border-slate-200"><span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[11px]">{emp.employeeId}</span></td>
                  <td className="py-2 px-2 bg-white group-hover:bg-orange-50/50 sticky left-[112px] z-20 border-r border-slate-200 min-w-[158px] max-w-[170px]">
                    <div className="font-bold text-slate-800 text-xs leading-tight truncate" title={emp.fullName}>{emp.fullName}</div>
                    <div className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1" title={emp.department}><span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span>{emp.department}</div>
                    <div className="text-[10px] text-slate-400 truncate">{emp.contractType === 'OFFICIAL' ? 'Chính thức 21-20' : 'Thời vụ 1-31'} • {emp.shiftClassId}</div>
                  </td>
                  {effectiveDays.map((day) => {
                    const key = `${emp.employeeId}_${day.dateStr}`;
                    const cell = timesheetMap.get(key);
                    const code = cell?.statusCode?.trim() || '';
                    let cellBadge = <span className="text-slate-300 text-[11px]">-</span>;
                    if (code === 'W') cellBadge = <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shadow-sm" title="Đi làm đủ">W</span>;
                    else if (code === 'N') cellBadge = <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-[11px] shadow-sm" title="Ca đêm">N</span>;
                    else if (code === 'Off') cellBadge = <span className="w-6 h-6 rounded-md bg-rose-100 text-rose-800 font-bold flex items-center justify-center text-[10px] shadow-sm animate-pulse" title="Chờ bù phép">Off</span>;
                    else if (code === 'AL') cellBadge = <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-[11px]" title="Phép năm">AL</span>;
                    else if (code === 'UL') cellBadge = <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[11px]" title="Không lương">UL</span>;
                    else if (code === 'SL') cellBadge = <span className="w-6 h-6 rounded-md bg-pink-100 text-pink-800 font-bold flex items-center justify-center text-[11px]" title="Nghỉ ốm">SL</span>;
                    else if (code === 'PL') cellBadge = <span className="w-6 h-6 rounded-md bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-[11px] border border-teal-200" title="Phép tang/kết hôn">PL</span>;
                    else if (code === 'PH') cellBadge = <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[11px] border border-amber-200" title="Nghỉ lễ">PH</span>;
                    else if (code === 'BT') cellBadge = <span className="w-6 h-6 rounded-md bg-sky-100 text-sky-800 font-bold flex items-center justify-center text-[11px]">BT</span>;
                    else if (code === 'LA') cellBadge = <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-[11px] border border-orange-300" title={cell?.violationNote || 'Đi trễ'}>LA</span>;
                    else if (code === 'ED') cellBadge = <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-[11px] border border-orange-300" title={cell?.violationNote || 'Về sớm'}>ED</span>;
                    else if (code === 'MCO') cellBadge = <span className="w-6 h-6 rounded-md bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[9px] border border-rose-300" title={cell?.violationNote || 'Không ra'}>MCO</span>;
                    else if (code === 'MCI') cellBadge = <span className="w-6 h-6 rounded-md bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[9px] border border-rose-300" title={cell?.violationNote || 'Không vào'}>MCI</span>;
                    else if (code.includes('/2')) cellBadge = <span className="px-1 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[9px] border border-blue-200">{code}</span>;
                    return (
                      <td key={day.dayIndex} onClick={() => handleCellClick(emp, day)} className={`p-1 text-center border-r border-slate-100 cursor-pointer hover:bg-orange-100/50 transition ${day.isSunday ? 'bg-amber-50/40' : (day.isSaturday ? 'bg-slate-50/40' : '')}`} title={cell?.violationNote || `Quẹt: ${cell?.checkIn || '--:--'} - ${cell?.checkOut || '--:--'}`}>
                        <div className="flex items-center justify-center">{cellBadge}</div>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center font-bold text-slate-700 border-r border-slate-200 bg-slate-50/50">{summary.standardWD}</td>
                  <td className="py-2 px-2 text-center font-extrabold text-emerald-700 border-r border-slate-200 bg-emerald-50/30">{summary.actualWD}</td>
                  <td className="py-2 px-2 text-center font-bold text-blue-700 border-r border-slate-200">{summary.annualLeaveAL > 0 ? summary.annualLeaveAL : '-'}</td>
                  <td className="py-2 px-2 text-center font-bold text-slate-600 border-r border-slate-200">{summary.unpaidLeaveUL > 0 ? summary.unpaidLeaveUL : '-'}</td>
                  <td className="py-2 px-2 text-center font-bold text-pink-700 border-r border-slate-200">{summary.sickLeaveSL > 0 ? summary.sickLeaveSL : '-'}</td>
                  <td className="py-2 px-2 text-center font-bold text-amber-700 border-r border-slate-200">{summary.publicHolidayPH > 0 ? summary.publicHolidayPH : '-'}</td>
                  <td className="py-2 px-2 text-center font-bold text-teal-700 border-r border-slate-200">{summary.specialPaidLeavePL > 0 ? summary.specialPaidLeavePL : '-'}</td>
                  <td className="py-2 px-2 text-center font-bold text-indigo-700 border-r border-slate-200">{summary.nightShiftsCount > 0 ? summary.nightShiftsCount : '-'}</td>
                  <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200 text-[11px]">{summary.lateEarlyMinutes > 0 ? `${summary.lateEarlyMinutes}p` : '-'}</td>
                  <td className="py-2 px-2 text-center font-extrabold text-emerald-600 border-r border-slate-200" title={`(AO+AP)*BF/AN = (${summary.actualWD}+${summary.annualLeaveAL})*${prodBase.toLocaleString()}/${summary.standardWD}`}>{summary.productivityBonus > 0 ? `${summary.productivityBonus.toLocaleString()}đ` : '-'}</td>
                  <td className="py-2 px-2 text-center font-extrabold text-orange-600 border-r border-slate-200" title={`Base ${diligenceBase.toLocaleString()}đ, UL=${summary.unpaidLeaveUL}`}>{summary.diligenceBonus.toLocaleString()}đ</td>
                  <td className="py-2 px-2 text-center font-semibold text-slate-700 border-r border-slate-200">{summary.hazardousAllowance > 0 ? `${summary.hazardousAllowance.toLocaleString()}đ` : '-'}</td>
                  <td className="py-2 px-2 text-center font-semibold text-slate-700 border-r border-slate-200">{summary.pcccAllowance > 0 ? `${summary.pcccAllowance.toLocaleString()}đ` : '-'}</td>
                  <td className="py-2 px-2 text-center font-semibold text-slate-700 border-r border-slate-200">{summary.otherFees > 0 ? `${summary.otherFees.toLocaleString()}đ` : summary.otherFees < 0 ? `${summary.otherFees.toLocaleString()}đ` : '-'}</td>
                  <td className="py-2 px-2 text-center font-semibold text-rose-600">{summary.tradeUnionFee.toLocaleString()}đ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 w-full space-y-4 flex-1 flex flex-col">
      <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-[17px] font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-orange-500" />
              <span>Bảng chấm công</span>
              <span className="ml-2 px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-black">Tháng {String(selectedMonth).padStart(2,'0')}/{selectedYear}</span>
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${cycleMode !== 'SEASONAL' ? 'bg-white border-slate-200 text-slate-700' : 'bg-blue-600 text-white border-blue-600 shadow'}`}>
                <CalendarRange className="w-3.5 h-3.5" /> Chính thức (21-20): <b>{officialPayLabel}</b> {cycleMode==='OFFICIAL' && <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">đang xem</span>}
              </span>
              <span className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${cycleMode !== 'SEASONAL' ? 'bg-white border-slate-200 text-slate-700' : 'bg-emerald-600 text-white border-emerald-600 shadow'}`}>
                <Clock3 className="w-3.5 h-3.5" /> Thời vụ (1-31): <b>{seasonalPayLabel}</b> {cycleMode==='SEASONAL' && <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">đang xem</span>}
              </span>
              {cycleMode==='ALL' && <span className="px-3 py-1.5 rounded-xl bg-orange-500 text-white font-black border border-orange-600 shadow flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5"/> Chế độ thông minh: Chính thức 21-20 + Thời vụ 1-31 (tách nhóm)</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-[880px]">
              Kỳ công chính thức tính <b>21 tháng trước – 20 tháng này</b> (VD: {officialPayLabel} là kỳ tháng {selectedMonth}), thời vụ tính <b>01–cuối tháng</b> ({seasonalPayLabel}). Bảng tự động gom nhóm theo <b>loại hợp đồng</b> khi chọn “Tất cả”. Mã nhân viên quẹt thẻ phải khớp danh mục nhân viên.
            </p>
            <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500"></span> PL=Tang/Cưới</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> PH=Nghỉ lễ (cả CTY nghỉ)</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> LA/ED &lt;30p, &gt;30p chờ duyệt phép</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> AW năng suất=(AO+AP)*BF/AN, AX chuyên cần={systemSettings.diligenceBonusConfig?.baseAmount?.toLocaleString() || '500,000'}đ</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasPermission('MANAGE_TIMESHEET') && (
              <button onClick={handleExport} className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-200">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xuất Bảng Chốt Công Excel</span>
                <span className="hidden xl:inline text-[10px] opacity-80">({filteredEmployees.length} NV)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full lg:w-auto flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Tìm theo tên, mã NV..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500" />
          </div>
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500">
            <option value="ALL">Tất cả Phòng Ban</option>
            {departments.map(d => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            {Array.from({length:12}, (_,i)=> i+1).map(m=> <option key={m} value={m}>Tháng {m}</option>)}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            {[2025,2026,2027].map(y=> <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 mr-1">Chu kỳ:</span>
          <button onClick={()=>setCycleMode('ALL')} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${cycleMode==='ALL' ? 'bg-orange-500 text-white border-orange-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Tất cả (thông minh)</button>
          <button onClick={()=>setCycleMode('OFFICIAL')} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${cycleMode==='OFFICIAL' ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Chính thức 21-20</button>
          <button onClick={()=>setCycleMode('SEASONAL')} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${cycleMode==='SEASONAL' ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Thời vụ 1-31</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-slate-600 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">W: Đủ công</span>
        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">N: Ca đêm</span>
        <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">Off: Chờ bù phép</span>
        <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">AL: Phép năm</span>
        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">UL: Không lương</span>
        <span className="px-2 py-0.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-200">SL: Nghỉ ốm</span>
        <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">PL: Tang/Cưới</span>
        <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">PH: Nghỉ lễ</span>
        <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">LA: Đi trễ</span>
        <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">ED: Về sớm</span>
        <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">MCO: Không ra</span>
        <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">MCI: Không vào</span>
      </div>

      {cycleMode === 'ALL' && grouped ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black"><Building2 className="w-4 h-4 text-orange-400"/>Nhóm Chính thức (21-20) — {officialPayLabel} <span className="ml-2 px-2 py-0.5 bg-white/10 rounded-full text-xs font-bold">{grouped.official.length} NV</span></div>
              <div className="text-[11px] text-slate-300">Chu kỳ {officialPayLabel} • Tháng {String(selectedMonth).padStart(2,'0')}/{selectedYear}</div>
            </div>
            {renderTable(grouped.official, officialDays)}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black"><Clock3 className="w-4 h-4 text-white"/>Nhóm Thời vụ (1-31) — {seasonalPayLabel} <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{grouped.seasonal.length} NV</span></div>
              <div className="text-[11px] text-emerald-100">Chu kỳ {seasonalPayLabel} • Tháng {String(selectedMonth).padStart(2,'0')}/{selectedYear}</div>
            </div>
            {renderTable(grouped.seasonal, seasonalDays)}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5 text-orange-500"/>{cycleMode==='OFFICIAL' ? `Chính thức ${officialPayLabel}` : `Thời vụ ${seasonalPayLabel}`}</span>
            <span className="text-slate-500">{filteredEmployees.length} nhân viên • {cycleMode==='OFFICIAL' ? `${officialDays[0].dayNum}/${officialDays[0].monthNum} → ${officialDays[30].dayNum}/${officialDays[30].monthNum}` : `01/${String(selectedMonth).padStart(2,'0')} → cuối tháng`}</span>
          </div>
          {renderTable(filteredEmployees, calendarDaysSingle)}
        </div>
      )}

      {filteredEmployees.length===0 && <div className="p-6 text-center text-xs text-slate-500 bg-white rounded-2xl border border-dashed"><AlertTriangle className="w-5 h-5 mx-auto text-amber-500 mb-1"/> Không có dữ liệu nhân viên khớp bộ lọc</div>}

      {activeEditCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Chỉnh Sửa Công: {activeEditCell.employee.fullName}</h3>
            <p className="text-xs text-slate-500 mt-1">Mã NV: <b>{activeEditCell.employee.employeeId}</b> | Ngày: <b>{activeEditCell.dateLabel}</b> | {activeEditCell.employee.contractType==='OFFICIAL'?'Chính thức 21-20':'Thời vụ 1-31'}</p>
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>Giờ vào: <b>{activeEditCell.cell.checkIn || 'Không có quẹt thẻ'}</b></div>
              <div>Giờ ra: <b>{activeEditCell.cell.checkOut || 'Không có quẹt thẻ'}</b></div>
              {activeEditCell.cell.lateMinutes ? (<div className="text-amber-600">Đi trễ: <b>{activeEditCell.cell.lateMinutes} phút</b> {activeEditCell.cell.lateMinutes >= 30 ? <span className="text-rose-600 font-bold">→ chờ duyệt phép</span> : '(LA)'}</div>) : null}
              {activeEditCell.cell.earlyMinutes ? (<div className="text-orange-600">Về sớm: <b>{activeEditCell.cell.earlyMinutes} phút</b> {activeEditCell.cell.earlyMinutes >= 30 ? <span className="text-rose-600 font-bold">→ chờ duyệt phép</span> : '(ED)'}</div>) : null}
              {activeEditCell.cell.violationNote && (<div className="text-slate-600 italic text-[11px] border-t border-slate-200 pt-1 mt-1">{activeEditCell.cell.violationNote}</div>)}
            </div>
            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 mb-2">Chọn mã trạng thái công mới:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: 'W', label: 'W: Đi làm đủ' },
                  { code: 'N', label: 'N: Ca đêm' },
                  { code: 'Off', label: 'Off: Chờ bù phép' },
                  { code: 'AL', label: 'AL: Phép năm' },
                  { code: 'UL', label: 'UL: Không lương' },
                  { code: 'SL', label: 'SL: Nghỉ ốm' },
                  { code: 'PL', label: 'PL: Tang/Cưới' },
                  { code: 'PH', label: 'PH: Nghỉ lễ' },
                  { code: 'LA', label: 'LA: Đi trễ' },
                  { code: 'ED', label: 'ED: Về sớm' },
                  { code: 'MCO', label: 'MCO: Không ra' },
                  { code: 'MCI', label: 'MCI: Không vào' },
                  { code: 'BT', label: 'BT: Công tác' },
                  { code: 'W/2 AL/2', label: 'W/2 AL/2: Nửa phép' },
                ].map(item => (
                  <button key={item.code} onClick={() => handleSaveCell(item.code as AttendanceStatusCode)} className={`p-2 rounded-xl text-xs font-bold border transition text-center ${activeEditCell.cell.statusCode === item.code ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}`}>{item.label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setActiveEditCell(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
