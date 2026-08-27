import React, { useState, useMemo } from 'react';
import { 
  CalendarDays, 
  Search, 
  Filter, 
  SlidersHorizontal, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { IEmployee, IDailyTimesheetCell, AttendanceStatusCode } from '../types';
import { computeEmployeeTimesheetSummary } from '../services/formula-engine';
import { generateCalendarDays } from '../services/calendar-utils';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import { exportTimesheetToExcel } from '../services/excel-exporter';

export const TimesheetCalendarPage: React.FC = () => {
  const { success, error, info, warning } = useToast();
  const { openCustomModal, closeCustomModal } = useModal();
  const { departmentScope, hasPermission, systemSettings } = useAuth();
  const [cycleMode, setCycleMode] = useState<'SEASONAL' | 'OFFICIAL'>('SEASONAL');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number>(8);
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Cell quick edit modal state
  const [activeEditCell, setActiveEditCell] = useState<{
    employee: IEmployee;
    cell: IDailyTimesheetCell;
    dateLabel: string;
  } | null>(null);

  // Live queries
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const timesheets = useLiveQuery(() => db.dailyTimesheets.toArray(), []) || [];
  const overtimes = useLiveQuery(() => db.overtimeRecords.toArray(), []) || [];

  // Filter employees
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

  // Create fast map of timesheet cells by `employeeId_date`
  const timesheetMap = useMemo(() => {
    const map = new Map<string, IDailyTimesheetCell>();
    timesheets.forEach(ts => map.set(ts.employeeId_date, ts));
    return map;
  }, [timesheets]);

  // Dynamic Calendar generation - hỗ trợ cả 21-20 (OFFICIAL) và 1-31 (SEASONAL)
  const calendarDays = useMemo(() => {
    return generateCalendarDays(selectedMonth, selectedYear, cycleMode);
  }, [selectedMonth, selectedYear, cycleMode]);

  // Handle cell click to edit (yêu cầu quyền MANAGE_TIMESHEET)
  const handleCellClick = (emp: IEmployee, day: typeof calendarDays[0]) => {
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
      month: selectedMonth,
      year: selectedYear
    };

    setActiveEditCell({
      employee: emp,
      cell: { ...cell },
      dateLabel: `${day.dayVi}, ${day.dayNum}/${day.monthNum}/${day.yearNum}`
    });
  };

  const handleSaveCell = async (newCode: AttendanceStatusCode) => {
    if (!activeEditCell) return;
    const updated = {
      ...activeEditCell.cell,
      statusCode: newCode
    };

    await db.dailyTimesheets.put(updated);
    success('Đã cập nhật công', `Nhân viên ${activeEditCell.employee.fullName} ngày ${activeEditCell.dateLabel} đã được chuyển sang mã "${newCode}".`);
    setActiveEditCell(null);
  };

  const handleExport = async () => {
    await exportTimesheetToExcel(filteredEmployees, timesheets, overtimes, selectedMonth, selectedYear, cycleMode);
    success(`Xuất file chốt công thành công! (Chu kỳ ${cycleMode === 'OFFICIAL' ? '21-20 Chính thức' : '1-31 Thời vụ'})`);
  };

  return (
    <div className="p-6 w-full space-y-6 flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-orange-500" />
            <span>Bảng chấm công</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-[820px] leading-relaxed">
            Tham chiếu từ dữ liệu quẹt thẻ máy chấm công, đảm bảo mã số nhân viên trong hệ thống dữ liệu quẹt thẻ chấm công phải khớp với dữ liệu mã số nhân viên của menu danh mục nhân viên.
          </p>
          <p className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500"></span> PL = Phép tang hoặc kết hôn</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> PH = Nghỉ lễ (tự động khi cả công ty không đi — ngày thường không chấm công trừ CN)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> LA = Đi trễ &lt;30p • ED = Về sớm &lt;30p • &gt;30p chờ duyệt phép</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> MCO/MCI = Không chấm ra/vào</span>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {hasPermission('MANAGE_TIMESHEET') && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-200"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Bảng Chốt Công Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar & Legend */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search & Dept */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, mã NV..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
            />
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
          >
            <option value="ALL">Tất cả Phòng Ban</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={cycleMode}
            onChange={(e) => setCycleMode(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500"
            title="Chu kỳ tính công"
          >
            <option value="SEASONAL">Thời vụ 1-31</option>
            <option value="OFFICIAL">Chính thức 21-20</option>
          </select>
        </div>

        {/* Legend Badges - cập nhật PL/PH + mã mới LA/ED/MCO/MCI */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-slate-600">
          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">W: Đủ công</span>
          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">N: Ca đêm</span>
          <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">Off: Chờ bù phép</span>
          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">AL: Phép năm</span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">UL: Không lương</span>
          <span className="px-2 py-0.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-200">SL: Nghỉ ốm</span>
          <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200" title="Phép tang hoặc kết hôn">PL: Tang/Cưới</span>
          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200" title="Tự động khi cả công ty nghỉ ngày thường (trừ CN)">PH: Nghỉ lễ</span>
          <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200" title="Đi trễ <30p; >=30p chờ duyệt phép">LA: Đi trễ</span>
          <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200" title="Về sớm <30p; >=30p chờ duyệt phép">ED: Về sớm</span>
          <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200" title="Có vào, không có ra">MCO: Không ra</span>
          <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200" title="Có ra, không có vào">MCI: Không vào</span>
        </div>
      </div>

      {/* 31-Day Matrix Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] flex-1">
          <table className="w-full text-left text-xs border-collapse">
            {/* Table Header - Bộ phận gộp chung dưới Họ và Tên để không tràn cột ngày 1 */}
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-30 shadow-md">
              <tr>
                {/* Fixed Sticky Columns - chỉ 3 cột cố định */}
                <th className="py-2.5 px-3 bg-slate-900 sticky left-0 z-40 w-12 text-center border-r border-slate-800">#</th>
                <th className="py-2.5 px-3 bg-slate-900 sticky left-12 z-40 w-24 border-r border-slate-800">Mã NV</th>
                <th className="py-2.5 px-4 bg-slate-900 sticky left-36 z-40 min-w-[200px] border-r border-slate-800">Họ và Tên <span className="font-normal opacity-60 text-[10px]">( + Bộ phận)</span></th>

                {/* 31 Calendar Columns */}
                {calendarDays.map((day) => (
                  <th
                    key={day.dayIndex}
                    className={`py-1.5 px-1 text-center min-w-[38px] border-r border-slate-800 select-none ${
                      day.isSunday ? 'bg-amber-950/80 text-amber-200' : (day.isSaturday ? 'bg-slate-800 text-slate-300' : 'bg-slate-900')
                    }`}
                  >
                    <div className="text-[10px] opacity-75">{day.dayVi}</div>
                    <div className="text-xs font-bold">{day.dayNum}</div>
                  </th>
                ))}

                {/* Summary Formula Columns */}
                <th className="py-2.5 px-3 bg-indigo-950 text-indigo-200 text-center min-w-[80px] border-r border-indigo-900">Công Chuẩn</th>
                <th className="py-2.5 px-3 bg-emerald-950 text-emerald-200 text-center min-w-[80px] border-r border-emerald-900">Công Thực Tế</th>
                <th className="py-2.5 px-3 bg-blue-950 text-blue-200 text-center min-w-[70px] border-r border-blue-900">Phép Năm (AL)</th>
                <th className="py-2.5 px-3 bg-slate-800 text-slate-200 text-center min-w-[75px] border-r border-slate-700">Không Lương (UL)</th>
                <th className="py-2.5 px-3 bg-pink-950 text-pink-200 text-center min-w-[70px] border-r border-pink-900">Nghỉ Ốm (SL)</th>
                <th className="py-2.5 px-3 bg-amber-950 text-amber-200 text-center min-w-[70px] border-r border-amber-900">Nghỉ Lễ (PH)</th>
                <th className="py-2.5 px-3 bg-indigo-950 text-indigo-200 text-center min-w-[80px] border-r border-indigo-900">Ca Đêm (N)</th>
                <th className="py-2.5 px-3 bg-slate-900 text-slate-200 text-center min-w-[80px] border-r border-slate-800">Trễ / Sớm</th>
                <th className="py-2.5 px-3 bg-orange-950 text-orange-200 text-center min-w-[95px] border-r border-orange-900">Tiền Chuyên Cần</th>
                <th className="py-2.5 px-3 bg-slate-900 text-slate-200 text-center min-w-[80px] border-r border-slate-800">Trợ Cấp PCCC</th>
                <th className="py-2.5 px-3 bg-slate-900 text-slate-200 text-center min-w-[80px] border-r border-slate-800">Tiền Độc Hại</th>
                <th className="py-2.5 px-3 bg-slate-900 text-slate-200 text-center min-w-[85px]">Đoàn Phí</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredEmployees.map((emp, empIdx) => {
                const empCells: IDailyTimesheetCell[] = [];
                calendarDays.forEach(d => {
                  const c = timesheetMap.get(`${emp.employeeId}_${d.dateStr}`);
                  if (c) empCells.push(c);
                });

                const deptRule = systemSettings.diligenceDeductionRules.find(r => r.department === emp.department) || systemSettings.diligenceDeductionRules.find(r => r.department === 'ALL') || systemSettings.diligenceDeductionRules[0];
                const summary = computeEmployeeTimesheetSummary(emp, empCells, deptRule ? { twoDaysULPenaltyPct: deptRule.twoDaysULPenaltyPct, threeDaysULPenaltyPct: deptRule.threeDaysULPenaltyPct } : undefined);

                return (
                  <tr key={emp.employeeId} className="hover:bg-orange-50/30 transition group">
                    {/* Fixed Sticky Cells - Bộ phận nằm gọn dưới tên */}
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-0 z-20 text-center font-semibold text-slate-400 border-r border-slate-200">
                      {empIdx + 1}
                    </td>
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-12 z-20 font-bold text-slate-900 border-r border-slate-200">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[11px]">
                        {emp.employeeId}
                      </span>
                    </td>
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-36 z-20 border-r border-slate-200 min-w-[200px]">
                      <div className="font-bold text-slate-800 text-xs leading-tight truncate" title={emp.fullName}>{emp.fullName}</div>
                      <div className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1" title={emp.department}>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span>{emp.department}
                      </div>
                    </td>

                    {/* 31 Calendar Cells */}
                    {calendarDays.map((day) => {
                      const key = `${emp.employeeId}_${day.dateStr}`;
                      const cell = timesheetMap.get(key);
                      const code = cell?.statusCode?.trim() || '';

                      let cellBadge = <span className="text-slate-300">-</span>;
                      if (code === 'W') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shadow-sm" title="Đi làm đủ">W</span>;
                      } else if (code === 'N') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-[11px] shadow-sm" title="Ca đêm">N</span>;
                      } else if (code === 'Off') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 font-bold flex items-center justify-center text-[11px] shadow-sm animate-pulse" title="Chờ bù phép">Off</span>;
                      } else if (code === 'AL') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-[11px]" title="Phép năm">AL</span>;
                      } else if (code === 'UL') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[11px]" title="Không lương">UL</span>;
                      } else if (code === 'SL') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-pink-100 text-pink-800 font-bold flex items-center justify-center text-[11px]" title="Nghỉ ốm">SL</span>;
                      } else if (code === 'PL') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-[11px] border border-teal-200" title="Phép tang hoặc kết hôn">PL</span>;
                      } else if (code === 'PH') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[11px] border border-amber-200" title="Nghỉ lễ (tự động)">PH</span>;
                      } else if (code === 'BT') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 font-bold flex items-center justify-center text-[11px]">BT</span>;
                      } else if (code === 'LA') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-[11px] border border-orange-300 shadow-sm" title={cell?.violationNote || 'Đi trễ - Late arrival (<30p)'}>LA</span>;
                      } else if (code === 'ED') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-[11px] border border-orange-300 shadow-sm" title={cell?.violationNote || 'Về sớm - Early departure (<30p)'}>ED</span>;
                      } else if (code === 'MCO') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[10px] border border-rose-300" title={cell?.violationNote || 'Không chấm công ra - Missing clock-out'}>MCO</span>;
                      } else if (code === 'MCI') {
                        cellBadge = <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[10px] border border-rose-300" title={cell?.violationNote || 'Không chấm công vào - Missing clock-in'}>MCI</span>;
                      } else if (code.includes('/2')) {
                        cellBadge = <span className="px-1 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[9px] border border-blue-200">{code}</span>;
                      }

                      return (
                        <td
                          key={day.dayIndex}
                          onClick={() => handleCellClick(emp, day)}
                          className={`p-1 text-center border-r border-slate-100 cursor-pointer hover:bg-orange-100/50 transition ${
                            day.isSunday ? 'bg-amber-50/40' : (day.isSaturday ? 'bg-slate-50/40' : '')
                          }`}
                          title={cell?.violationNote || `Quẹt: ${cell?.checkIn || '--:--'} - ${cell?.checkOut || '--:--'}`}
                        >
                          <div className="flex items-center justify-center">
                            {cellBadge}
                          </div>
                        </td>
                      );
                    })}

                    {/* Summary Columns */}
                    <td className="py-2 px-3 text-center font-bold text-slate-700 border-r border-slate-200 bg-slate-50/50">
                      {summary.standardWD}
                    </td>
                    <td className="py-2 px-3 text-center font-extrabold text-emerald-700 border-r border-slate-200 bg-emerald-50/30">
                      {summary.actualWD}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-blue-700 border-r border-slate-200">
                      {summary.annualLeaveAL > 0 ? summary.annualLeaveAL : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-slate-600 border-r border-slate-200">
                      {summary.unpaidLeaveUL > 0 ? summary.unpaidLeaveUL : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-pink-700 border-r border-slate-200">
                      {summary.sickLeaveSL > 0 ? summary.sickLeaveSL : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-amber-700 border-r border-slate-200">
                      {summary.publicHolidayPH > 0 ? summary.publicHolidayPH : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-indigo-700 border-r border-slate-200">
                      {summary.nightShiftsCount > 0 ? summary.nightShiftsCount : '-'}
                    </td>
                    <td className="py-2 px-3 text-center text-slate-600 border-r border-slate-200">
                      {summary.lateEarlyMinutes > 0 ? `${summary.lateEarlyMinutes}p` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-extrabold text-orange-600 border-r border-slate-200">
                      {summary.diligenceBonus.toLocaleString()}đ
                    </td>
                    <td className="py-2 px-3 text-center font-semibold text-slate-700 border-r border-slate-200">
                      {summary.pcccAllowance > 0 ? `${summary.pcccAllowance.toLocaleString()}đ` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-semibold text-slate-700 border-r border-slate-200">
                      {summary.hazardousAllowance > 0 ? `${summary.hazardousAllowance.toLocaleString()}đ` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-semibold text-rose-600">
                      {summary.tradeUnionFee.toLocaleString()}đ
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Edit Cell Dialog */}
      {activeEditCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900">
              Chỉnh Sửa Công: {activeEditCell.employee.fullName}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Mã NV: <b>{activeEditCell.employee.employeeId}</b> | Ngày: <b>{activeEditCell.dateLabel}</b>
            </p>

            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>Giờ vào: <b>{activeEditCell.cell.checkIn || 'Không có quẹt thẻ'}</b> {activeEditCell.cell.checkIn && activeEditCell.employee.shiftClassId && <span className="text-[10px] text-slate-400">(ca {activeEditCell.employee.shiftClassId})</span>}</div>
              <div>Giờ ra: <b>{activeEditCell.cell.checkOut || 'Không có quẹt thẻ'}</b></div>
              {activeEditCell.cell.lateMinutes ? (
                <div className="text-amber-600">Đi trễ: <b>{activeEditCell.cell.lateMinutes} phút</b> {activeEditCell.cell.lateMinutes >= 30 ? <span className="text-rose-600 font-bold">→ chờ duyệt phép</span> : '(LA)'}</div>
              ) : null}
              {activeEditCell.cell.earlyMinutes ? (
                <div className="text-orange-600">Về sớm: <b>{activeEditCell.cell.earlyMinutes} phút</b> {activeEditCell.cell.earlyMinutes >= 30 ? <span className="text-rose-600 font-bold">→ chờ duyệt phép</span> : '(ED)'}</div>
              ) : null}
              {activeEditCell.cell.violationNote && (
                <div className="text-slate-600 italic text-[11px] border-t border-slate-200 pt-1 mt-1">{activeEditCell.cell.violationNote}</div>
              )}
              {activeEditCell.cell.statusCode === 'PL' && <div className="text-teal-700 text-[11px]">PL = Phép tang hoặc kết hôn</div>}
              {activeEditCell.cell.statusCode === 'PH' && <div className="text-amber-700 text-[11px]">PH = Nghỉ lễ (tự động khi cả công ty nghỉ)</div>}
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
                  <button
                    key={item.code}
                    onClick={() => handleSaveCell(item.code as AttendanceStatusCode)}
                    className={`p-2 rounded-xl text-xs font-bold border transition text-center ${
                      activeEditCell.cell.statusCode === item.code
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setActiveEditCell(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
