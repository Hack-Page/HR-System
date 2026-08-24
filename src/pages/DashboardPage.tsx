import React, { useMemo, useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserPlus, 
  UserMinus, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  ShieldAlert, 
  ArrowRight,
  TrendingUp,
  Percent,
  Building,
  BarChart3,
  PieChart as PieIcon
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useLanguage } from '../context/LanguageContext';
import { NavPageId } from '../components/layout/Sidebar';

interface DashboardPageProps {
  onNavigate: (page: NavPageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { t } = useLanguage();

  // Query live data from Dexie.js
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const timesheets = useLiveQuery(() => db.dailyTimesheets.toArray(), []) || [];
  const shiftRosters = useLiveQuery(() => db.shiftRosters.toArray(), []) || [];

  const [hoveredBar, setHoveredBar] = useState<{ dept: string; official: number; seasonal: number; late: number; early: number; missing: number } | null>(null);

  // Compute all Dashboard Metrics
  const stats = useMemo(() => {
    const total = employees.length;
    const official = employees.filter(e => e.contractType === 'OFFICIAL').length;
    const seasonal = employees.filter(e => e.contractType === 'SEASONAL').length;

    const shift1 = employees.filter(e => e.shiftClassId === 'SHIFT_1').length;
    const shift2 = employees.filter(e => e.shiftClassId === 'SHIFT_2').length;
    const office = employees.filter(e => e.shiftClassId === 'OFFICE_M_F' || e.shiftClassId === 'OFFICE_M_S').length;

    const resigned = employees.filter(e => e.status === 'RESIGNED').length;
    // New hires (Start date in 2026)
    const newHires = employees.filter(e => e.startDate && (e.startDate.includes('2026') || e.startDate.includes('26'))).length;
    const turnoverRate = total > 0 ? ((resigned / total) * 100).toFixed(1) : '0';

    // Department breakdown
    const deptMap: Record<string, { total: number; official: number; seasonal: number; late: number; early: number; missing: number; violation12h: number }> = {};
    employees.forEach(e => {
      const dept = e.department || 'Other';
      if (!deptMap[dept]) {
        deptMap[dept] = { total: 0, official: 0, seasonal: 0, late: 0, early: 0, missing: 0, violation12h: 0 };
      }
      deptMap[dept].total++;
      if (e.contractType === 'OFFICIAL') deptMap[dept].official++;
      else deptMap[dept].seasonal++;
    });

    // Timesheet violations
    let totalLateCount = 0;
    let totalEarlyCount = 0;
    let totalMissingPunch = 0;
    let totalWorkdaySlots = 0;

    timesheets.forEach(ts => {
      const emp = employees.find(e => e.employeeId === ts.employeeId);
      const dept = emp?.department || 'Other';
      if (!deptMap[dept]) {
        deptMap[dept] = { total: 0, official: 0, seasonal: 0, late: 0, early: 0, missing: 0, violation12h: 0 };
      }

      totalWorkdaySlots++;
      if (ts.lateMinutes && ts.lateMinutes > 0) {
        totalLateCount++;
        deptMap[dept].late++;
      }
      if (ts.earlyMinutes && ts.earlyMinutes > 0) {
        totalEarlyCount++;
        deptMap[dept].early++;
      }
      if (ts.statusCode === 'Off' || (!ts.checkIn && !!ts.checkOut) || (!!ts.checkIn && !ts.checkOut)) {
        totalMissingPunch++;
        deptMap[dept].missing++;
      }
    });

    // 12h Rest Violations
    let total12hViolations = 0;
    shiftRosters.forEach(sr => {
      if (sr.isRestViolation) {
        total12hViolations++;
        const dept = sr.department || 'Other';
        if (deptMap[dept]) {
          deptMap[dept].violation12h++;
        }
      }
    });

    const lateRate = totalWorkdaySlots > 0 ? ((totalLateCount / totalWorkdaySlots) * 100).toFixed(1) : '0';
    const missingPunchRate = totalWorkdaySlots > 0 ? ((totalMissingPunch / totalWorkdaySlots) * 100).toFixed(1) : '0';

    const departmentChartData = Object.keys(deptMap).map(k => ({
      name: k,
      total: deptMap[k].total,
      official: deptMap[k].official,
      seasonal: deptMap[k].seasonal,
      late: deptMap[k].late,
      early: deptMap[k].early,
      missing: deptMap[k].missing,
      violation12h: deptMap[k].violation12h,
    }));

    return {
      total,
      official,
      seasonal,
      shift1,
      shift2,
      office,
      resigned,
      newHires,
      turnoverRate,
      totalLateCount,
      totalEarlyCount,
      totalMissingPunch,
      lateRate,
      missingPunchRate,
      total12hViolations,
      deptMap,
      departmentChartData
    };
  }, [employees, timesheets, shiftRosters]);

  const maxDeptHeadcount = useMemo(() => {
    return Math.max(1, ...stats.departmentChartData.map(d => d.total));
  }, [stats.departmentChartData]);

  const maxDeptViolations = useMemo(() => {
    return Math.max(1, ...stats.departmentChartData.map(d => Math.max(d.late, d.early, d.missing)));
  }, [stats.departmentChartData]);

  return (
    <div className="p-6 w-full space-y-6">
      {/* Top Welcome & Summary Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-400 font-semibold text-xs uppercase tracking-wider">
            <Building className="w-4 h-4" />
            <span>Leggett & Platt Vietnam - SmartHR Executive Analytics</span>
          </div>
          <h2 className="text-2xl font-bold mt-1 text-white">Báo Cáo Tổng Hợp Nhân Sự & Chấm Công</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Chu kỳ công Tháng 08/2026 (Chính thức: 21/07 - 20/08 | Thời vụ: 01/08 - 31/08). Xử lý cục bộ 100% In-Browser.
          </p>
        </div>

        {/* 12h Shift Rest Violation Alert Badge with Direct CTA */}
        <div className={`p-4 rounded-xl border flex items-center gap-4 transition shadow-lg ${
          stats.total12hViolations > 0 
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-200' 
            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
        }`}>
          <div className="p-2.5 rounded-lg bg-rose-500/30 text-rose-300 shrink-0">
            <ShieldAlert className="w-6 h-6 animate-pulse text-rose-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Cảnh Báo Xoay Ca</div>
            <div className="text-xl font-extrabold text-white">
              {stats.total12hViolations} <span className="text-xs font-normal text-slate-300">trường hợp nghỉ &lt; 12h</span>
            </div>
          </div>
          <button
            onClick={() => onNavigate('shiftRoster')}
            className="ml-2 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-md shadow-rose-900/50"
          >
            <span>Chi tiết</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 1: KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Headcount */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Nhân Sự</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{stats.total}</div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
            <span>Chính thức: <b className="text-blue-600">{stats.official}</b></span>
            <span>Thời vụ: <b className="text-orange-600">{stats.seasonal}</b></span>
          </div>
        </div>

        {/* Card 2: Shifts breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phân Bổ Đi Ca</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{stats.shift1 + stats.shift2}</div>
          <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-100 text-center">
            <div>HC: <b className="text-slate-800">{stats.office}</b></div>
            <div>Ca 1: <b className="text-indigo-600">{stats.shift1}</b></div>
            <div>Ca 2: <b className="text-pink-600">{stats.shift2}</b></div>
          </div>
        </div>

        {/* Card 3: Turnover & Movement */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ Nghỉ Việc</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-3xl font-extrabold text-slate-900">{stats.turnoverRate}%</div>
            <span className="text-xs text-rose-500 font-semibold">{stats.resigned} đã nghỉ</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
            <span>Nhận việc mới: <b className="text-emerald-600">+{stats.newHires}</b></span>
            <span>Nghỉ việc: <b className="text-rose-600">-{stats.resigned}</b></span>
          </div>
        </div>

        {/* Card 4: Attendance Violations */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ Đi Trễ / Vắng</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-3xl font-extrabold text-amber-600">{stats.lateRate}%</div>
            <span className="text-xs text-slate-500">trễ ({stats.totalLateCount} lượt)</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
            <span>Về sớm: <b className="text-slate-800">{stats.totalEarlyCount}</b></span>
            <span>Thiếu quẹt: <b className="text-rose-600">{stats.totalMissingPunch} ({stats.missingPunchRate}%)</b></span>
          </div>
        </div>
      </div>

      {/* Row 2: Responsive Visual Charts (Native SVG / CSS Bars - 100% Reliable & Fast) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Headcount by Department */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Số Lượng Nhân Viên Theo Phòng Ban</h3>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-6">Phân loại Chính thức (Xanh dương | Kỳ 21-20) và Thời vụ (Cam | Kỳ 1-31)</p>
          </div>

          <div className="space-y-3.5">
            {stats.departmentChartData.map((d) => {
              const officialPct = maxDeptHeadcount > 0 ? (d.official / maxDeptHeadcount) * 100 : 0;
              const seasonalPct = maxDeptHeadcount > 0 ? (d.seasonal / maxDeptHeadcount) * 100 : 0;

              return (
                <div key={d.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{d.name}</span>
                    <span className="font-semibold text-slate-500">
                      <b className="text-blue-600">{d.official}</b> chính thức + <b className="text-orange-600">{d.seasonal}</b> thời vụ = <b className="text-slate-900">{d.total}</b>
                    </span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200 shadow-inner">
                    <div
                      style={{ width: `${officialPct}%` }}
                      className="bg-blue-500 hover:bg-blue-600 transition-all duration-300"
                      title={`Chính thức: ${d.official}`}
                    />
                    <div
                      style={{ width: `${seasonalPct}%` }}
                      className="bg-orange-500 hover:bg-orange-600 transition-all duration-300"
                      title={`Thời vụ: ${d.seasonal}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="font-semibold text-slate-700">Chính thức (21-20): {stats.official}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="font-semibold text-slate-700">Thời vụ (1-31): {stats.seasonal}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Violations by Department */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">Sai Phạm Chấm Công & Đi Trễ Theo Phòng Ban</h3>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-6">Thống kê số lượt đi trễ (Vàng), về sớm (Xám) và thiếu quẹt thẻ (Đỏ)</p>
          </div>

          <div className="space-y-3.5">
            {stats.departmentChartData.map((d) => {
              const latePct = maxDeptViolations > 0 ? (d.late / maxDeptViolations) * 100 : 0;
              const earlyPct = maxDeptViolations > 0 ? (d.early / maxDeptViolations) * 100 : 0;
              const missingPct = maxDeptViolations > 0 ? (d.missing / maxDeptViolations) * 100 : 0;

              return (
                <div key={d.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{d.name}</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-amber-600 font-semibold">{d.late} trễ</span>
                      <span className="text-slate-500 font-semibold">{d.early} sớm</span>
                      <span className="text-rose-600 font-bold">{d.missing} vắng/thiếu</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div style={{ width: `${latePct}%` }} className="h-full bg-amber-400 rounded-full" />
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div style={{ width: `${earlyPct}%` }} className="h-full bg-slate-400 rounded-full" />
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div style={{ width: `${missingPct}%` }} className="h-full bg-rose-500 rounded-full" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="font-medium text-slate-600">Đi trễ ({stats.totalLateCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span className="font-medium text-slate-600">Về sớm ({stats.totalEarlyCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="font-bold text-rose-700">Không quẹt vào/ra ({stats.totalMissingPunch})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Department Breakdown Table & 12h Rest Violations Detail */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Bảng Tổng Hợp Chi Tiết Theo Từng Phòng Ban</h3>
            <p className="text-xs text-slate-500">Bao gồm tỷ lệ đi trễ, không quẹt thẻ và cảnh báo vi phạm xoay ca &lt; 12 giờ</p>
          </div>
          <button
            onClick={() => onNavigate('shiftRoster')}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
          >
            <span>Quản Lý Xoay Ca</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Phòng Ban (Dept)</th>
                <th className="py-3 px-4 text-center">Tổng Nhân Sự</th>
                <th className="py-3 px-4 text-center">Chính Thức</th>
                <th className="py-3 px-4 text-center">Thời Vụ</th>
                <th className="py-3 px-4 text-center">Lượt Đi Trễ</th>
                <th className="py-3 px-4 text-center">Lượt Về Sớm</th>
                <th className="py-3 px-4 text-center">Không Chấm Vào/Ra</th>
                <th className="py-3 px-4 text-center">Vi Phạm Xoay Ca (&lt;12h)</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.departmentChartData.map((d) => (
                <tr key={d.name} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    {d.name}
                  </td>
                  <td className="py-3 px-4 text-center font-bold">{d.total}</td>
                  <td className="py-3 px-4 text-center text-blue-600 font-semibold">{d.official}</td>
                  <td className="py-3 px-4 text-center text-orange-600 font-semibold">{d.seasonal}</td>
                  <td className="py-3 px-4 text-center text-amber-600 font-semibold">{d.late}</td>
                  <td className="py-3 px-4 text-center text-slate-600">{d.early}</td>
                  <td className="py-3 px-4 text-center text-rose-600 font-bold">{d.missing}</td>
                  <td className="py-3 px-4 text-center">
                    {d.violation12h > 0 ? (
                      <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 font-bold inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        {d.violation12h} ca vi phạm
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">0</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onNavigate('shiftRoster')}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                    >
                      Chi tiết →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
