import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  ScanLine, 
  FileSpreadsheet,
  Calendar,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { IEmployee, IOvertimeRecord, OvertimeVerificationStatus } from '../types';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import { NavPageId } from '../components/layout/Sidebar';

interface OvertimePageProps {
  onNavigate: (page: NavPageId) => void;
}

export const OvertimePage: React.FC<OvertimePageProps> = ({ onNavigate }) => {
  const { success, warning } = useToast();
  const { confirm } = useModal();
  const { departmentScope, hasPermission } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number>(8);
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Live queries
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
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

  // Fast map of overtimes
  const overtimeMap = useMemo(() => {
    const map = new Map<string, IOvertimeRecord>();
    overtimes.forEach(ot => map.set(ot.employeeId_date, ot));
    return map;
  }, [overtimes]);

  // Calendar 31-day definition
  const calendarDays = useMemo(() => {
    const days = [];
    const daysOfWeekVi = ['T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5'];

    for (let i = 1; i <= 31; i++) {
      const dateNum = i <= 11 ? 20 + i : i - 11;
      const monthNum = i <= 11 ? (selectedMonth === 1 ? 12 : selectedMonth - 1) : selectedMonth;
      const dateStr = `${selectedYear}-${String(monthNum).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;
      
      days.push({
        dayIndex: i,
        dayNum: dateNum,
        monthNum,
        dateStr,
        dayVi: daysOfWeekVi[i - 1] || '',
        isSunday: daysOfWeekVi[i - 1] === 'CN'
      });
    }
    return days;
  }, [selectedMonth, selectedYear]);

  // Total summary OT statistics
  const otSummary = useMemo(() => {
    let totalOTHours = 0;
    let pendingCount = 0;
    let verifiedCount = 0;
    let mismatchCount = 0;

    overtimes.forEach(ot => {
      totalOTHours += ot.hours;
      if (ot.verificationStatus === 'PENDING') pendingCount++;
      else if (ot.verificationStatus === 'MATCHED') verifiedCount++;
      else if (ot.verificationStatus === 'MISMATCH') mismatchCount++;
    });

    return {
      totalOTHours: totalOTHours.toFixed(1),
      pendingCount,
      verifiedCount,
      mismatchCount
    };
  }, [overtimes]);

  // Manual verify OT toggle
  const handleToggleStatus = async (record: IOvertimeRecord) => {
    const nextStatus: OvertimeVerificationStatus = 
      record.verificationStatus === 'PENDING' ? 'MATCHED' : (record.verificationStatus === 'MATCHED' ? 'MISMATCH' : 'PENDING');
    
    await db.overtimeRecords.put({
      ...record,
      verificationStatus: nextStatus,
      verifiedAt: new Date().toISOString()
    });

    success('Đã chuyển trạng thái xác nhận OT', `Trạng thái: ${nextStatus}`);
  };

  return (
    <div className="p-6 w-full space-y-6 flex-1 flex flex-col">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <span>Bảng Theo Dõi & Quản Lý Tăng Ca (Overtime Table)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tự động tính giờ tăng ca: Ngày thường tính số giờ ra sau ca quy định; Ngày Chủ Nhật quy đổi toàn bộ thời gian làm việc (7h30-16h = 8h OT).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('ocrVerification')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white text-xs font-bold rounded-xl transition shadow-md shadow-orange-200"
          >
            <ScanLine className="w-4 h-4" />
            <span>Quét Phiếu Đối Soát OCR</span>
          </button>
        </div>
      </div>

      {/* KPI Cards for OT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase">Tổng Giờ Tăng Ca</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{otSummary.totalOTHours} <span className="text-xs font-medium text-slate-500">giờ</span></div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 shadow-sm">
          <div className="text-xs font-bold text-amber-800 uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Chờ Đối Soát (Vàng Nhạt)
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{otSummary.pendingCount} <span className="text-xs font-medium">bản ghi</span></div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
          <div className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Đã Khớp OCR (Xanh Lá)
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{otSummary.verifiedCount} <span className="text-xs font-medium">bản ghi</span></div>
        </div>

        <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-200 shadow-sm">
          <div className="text-xs font-bold text-rose-800 uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Lệch OCR / Sai Khác (Đỏ)
          </div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{otSummary.mismatchCount} <span className="text-xs font-medium">bản ghi</span></div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
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
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">Vàng: Chờ xác nhận</span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">Xanh: Đã khớp OCR</span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300">Đỏ: Lệch phiếu duyệt</span>
        </div>
      </div>

      {/* Overtime Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-30 shadow-md">
              <tr>
                <th className="py-2.5 px-3 bg-slate-900 sticky left-0 z-40 w-12 text-center border-r border-slate-800">#</th>
                <th className="py-2.5 px-3 bg-slate-900 sticky left-12 z-40 w-24 border-r border-slate-800">Mã NV</th>
                <th className="py-2.5 px-4 bg-slate-900 sticky left-36 z-40 min-w-[180px] border-r border-slate-800">Họ và Tên</th>
                <th className="py-2.5 px-3 bg-slate-900 sticky left-[324px] z-40 w-28 border-r border-slate-800">Bộ Phận</th>

                {/* 31 Calendar Columns */}
                {calendarDays.map((day) => (
                  <th
                    key={day.dayIndex}
                    className={`py-1.5 px-1 text-center min-w-[38px] border-r border-slate-800 select-none ${
                      day.isSunday ? 'bg-amber-950/80 text-amber-200' : 'bg-slate-900'
                    }`}
                  >
                    <div className="text-[10px] opacity-75">{day.dayVi}</div>
                    <div className="text-xs font-bold">{day.dayNum}</div>
                  </th>
                ))}

                <th className="py-2.5 px-4 bg-orange-950 text-orange-200 text-center min-w-[100px]">Tổng Giờ OT</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredEmployees.map((emp, empIdx) => {
                let empTotalOT = 0;

                return (
                  <tr key={emp.employeeId} className="hover:bg-orange-50/30 transition group">
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-0 z-20 text-center font-semibold text-slate-400 border-r border-slate-200">
                      {empIdx + 1}
                    </td>
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-12 z-20 font-bold text-slate-900 border-r border-slate-200">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[11px]">
                        {emp.employeeId}
                      </span>
                    </td>
                    <td className="py-2 px-4 bg-white group-hover:bg-orange-50/50 sticky left-36 z-20 font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap">
                      {emp.fullName}
                    </td>
                    <td className="py-2 px-3 bg-white group-hover:bg-orange-50/50 sticky left-[324px] z-20 font-semibold text-slate-600 border-r border-slate-200">
                      {emp.department}
                    </td>

                    {/* 31 Calendar OT cells */}
                    {calendarDays.map((day) => {
                      const key = `${emp.employeeId}_${day.dateStr}`;
                      const otRecord = overtimeMap.get(key);
                      const hours = otRecord?.hours || 0;
                      if (hours > 0) empTotalOT += hours;

                      let cellBadge = <span className="text-slate-300">-</span>;
                      if (hours > 0) {
                        let bgClass = 'bg-amber-100 text-amber-900 border-amber-300';
                        if (otRecord?.verificationStatus === 'MATCHED') {
                          bgClass = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold';
                        } else if (otRecord?.verificationStatus === 'MISMATCH') {
                          bgClass = 'bg-rose-100 text-rose-900 border-rose-300 font-extrabold animate-pulse';
                        }

                        cellBadge = (
                          <span
                            onClick={() => otRecord && handleToggleStatus(otRecord)}
                            className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center text-[11px] border cursor-pointer hover:scale-110 transition shadow-sm ${bgClass}`}
                            title={`Tăng ca: ${hours}h | Trạng thái: ${otRecord?.verificationStatus} (Click để đổi)`}
                          >
                            {hours}
                          </span>
                        );
                      }

                      return (
                        <td
                          key={day.dayIndex}
                          className={`p-1 text-center border-r border-slate-100 ${
                            day.isSunday ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            {cellBadge}
                          </div>
                        </td>
                      );
                    })}

                    <td className="py-2 px-4 text-center font-extrabold text-orange-600 bg-orange-50/40">
                      {empTotalOT > 0 ? `${empTotalOT.toFixed(1)}h` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
