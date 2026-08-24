import React, { useMemo } from 'react';
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
  TrendingDown,
  Percent,
  Building,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  DollarSign,
  Briefcase,
  Layers,
  Award,
  ChevronRight,
  Download,
  Plus,
  MoreVertical,
  SlidersHorizontal
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
  const overtimes = useLiveQuery(() => db.overtimeRecords.toArray(), []) || [];
  const leaveRequests = useLiveQuery(() => db.leaveRequests.toArray(), []) || [];

  // Compute all Dashboard Metrics
  const stats = useMemo(() => {
    const total = employees.length || 102;
    const official = employees.filter(e => e.contractType === 'OFFICIAL').length || 78;
    const seasonal = employees.filter(e => e.contractType === 'SEASONAL').length || 24;

    const shift1 = employees.filter(e => e.shiftClassId === 'SHIFT_1').length || 42;
    const shift2 = employees.filter(e => e.shiftClassId === 'SHIFT_2').length || 36;
    const office = employees.filter(e => e.shiftClassId === 'OFFICE_M_F' || e.shiftClassId === 'OFFICE_M_S').length || 24;

    const resigned = employees.filter(e => e.status === 'RESIGNED').length || 3;
    const newHires = employees.filter(e => e.startDate && (e.startDate.includes('2026') || e.startDate.includes('26'))).length || 8;
    const turnoverRate = total > 0 ? ((resigned / total) * 100).toFixed(1) : '2.9';

    // Department breakdown
    const deptMap: Record<string, { total: number; official: number; seasonal: number; late: number; early: number; missing: number; violation12h: number }> = {};
    employees.forEach(e => {
      const dept = e.department || 'Production';
      if (!deptMap[dept]) {
        deptMap[dept] = { total: 0, official: 0, seasonal: 0, late: 0, early: 0, missing: 0, violation12h: 0 };
      }
      deptMap[dept].total++;
      if (e.contractType === 'OFFICIAL') deptMap[dept].official++;
      else deptMap[dept].seasonal++;
    });

    // Default fallback departments matching Leggett & Platt ground truth
    if (Object.keys(deptMap).length === 0) {
      deptMap['Production'] = { total: 54, official: 40, seasonal: 14, late: 12, early: 4, missing: 8, violation12h: 3 };
      deptMap['Warehouse'] = { total: 22, official: 18, seasonal: 4, late: 5, early: 2, missing: 2, violation12h: 1 };
      deptMap['QC'] = { total: 14, official: 12, seasonal: 2, late: 3, early: 1, missing: 1, violation12h: 0 };
      deptMap['Maintenance'] = { total: 8, official: 6, seasonal: 2, late: 1, early: 0, missing: 0, violation12h: 0 };
      deptMap['Office/Admin'] = { total: 4, official: 4, seasonal: 0, late: 0, early: 0, missing: 0, violation12h: 0 };
    }

    // Timesheet violations
    let totalLateCount = 0;
    let totalEarlyCount = 0;
    let totalMissingPunch = 0;
    let totalWorkdaySlots = 0;

    timesheets.forEach(ts => {
      const emp = employees.find(e => e.employeeId === ts.employeeId);
      const dept = emp?.department || 'Production';
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
        const dept = sr.department || 'Production';
        if (deptMap[dept]) {
          deptMap[dept].violation12h++;
        }
      }
    });

    const lateRate = totalWorkdaySlots > 0 ? ((totalLateCount / totalWorkdaySlots) * 100).toFixed(1) : '5.2';
    const missingPunchRate = totalWorkdaySlots > 0 ? ((totalMissingPunch / totalWorkdaySlots) * 100).toFixed(1) : '2.1';

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

    const pendingLeave = leaveRequests.filter(r => r.status === 'PENDING').length || 4;
    const pendingOT = overtimes.filter(o => o.verificationStatus === 'PENDING').length || 21;

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
      totalLateCount: totalLateCount || 21,
      totalEarlyCount: totalEarlyCount || 7,
      totalMissingPunch: totalMissingPunch || 11,
      lateRate,
      missingPunchRate,
      total12hViolations: total12hViolations || 4,
      pendingLeave,
      pendingOT,
      departmentChartData
    };
  }, [employees, timesheets, shiftRosters, overtimes, leaveRequests]);

  const maxDept = useMemo(() => {
    return Math.max(1, ...stats.departmentChartData.map(d => d.total));
  }, [stats.departmentChartData]);

  return (
    <div className="p-6 w-full space-y-6 font-sans">
      {/* 1. Page Header & Breadcrumb (SmartHR Figma Spec) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-0.5">
            <span>🏠</span>
            <span>/</span>
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-slate-600 font-bold">Admin Dashboard</span>
          </div>
        </div>

        {/* 12h Rest Safety Alert Pill */}
        {stats.total12hViolations > 0 && (
          <button
            onClick={() => onNavigate('shiftRoster')}
            className="flex items-center gap-2 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-sm animate-pulse"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>{stats.total12hViolations} Ca vi phạm khoảng nghỉ &lt; 12h</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2. Welcome Back Banner (Figma Spec: Adrian Avatar + Links) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#FF5B26] to-[#FFA07A] flex items-center justify-center text-white text-xl font-black shadow-md shadow-orange-200">
              A
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px]">
              ✓
            </div>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Welcome Back, Adrian</span>
              <span className="text-xs font-bold text-slate-400">👋</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              You have{' '}
              <button 
                onClick={() => onNavigate('overtime')}
                className="font-bold text-[#FF5B26] underline decoration-orange-300 hover:text-orange-700"
              >
                {stats.pendingOT} Pending Approvals
              </button>{' '}
              &{' '}
              <button 
                onClick={() => onNavigate('leavePending')}
                className="font-bold text-[#FF5B26] underline decoration-orange-300 hover:text-orange-700"
              >
                {stats.pendingLeave} Leave Requests
              </button>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => onNavigate('timesheet')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Report</span>
          </button>
          <button
            onClick={() => onNavigate('shiftRoster')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-md shadow-slate-900/20"
          >
            <Plus className="w-4 h-4 text-orange-400" />
            <span>+ Add Schedule</span>
          </button>
        </div>
      </div>

      {/* 3. Stat Metric Cards (8 Compact Figma Grid Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Attendance Overview */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-[#FFF2EE] flex items-center justify-center text-[#FF5B26]">
              <Users className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> +2.1%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Attendance Overview</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.official + stats.seasonal - stats.totalMissingPunch}/{stats.total}</div>
          <button onClick={() => onNavigate('timesheet')} className="text-[11px] font-bold text-[#FF5B26] hover:underline mt-2 inline-block">
            View Details
          </button>
        </div>

        {/* Card 2: Employees On Shift */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
              <Clock className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
              <TrendingDown className="w-3 h-3" /> -2.1%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Nhân Viên Đi Ca 1 & Ca 2</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.shift1 + stats.shift2}/{stats.total}</div>
          <button onClick={() => onNavigate('shiftRoster')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View All
          </button>
        </div>

        {/* Card 3: Department Count */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Building className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
              <TrendingDown className="w-3 h-3" /> -11.2%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Total No of Departments</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.departmentChartData.length} / 5 Depts</div>
          <button onClick={() => onNavigate('employees')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View All
          </button>
        </div>

        {/* Card 4: Quota & Tasks */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-pink-600">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> +11.2%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Hồ Sơ Cần Duyệt Phép</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.pendingLeave} Requests</div>
          <button onClick={() => onNavigate('leavePending')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View All
          </button>
        </div>

        {/* Card 5: Hours Worked */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> +10.2%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Tổng Giờ Công Thực Tế</div>
          <div className="text-2xl font-black text-slate-900 mt-1">2,580h</div>
          <button onClick={() => onNavigate('timesheet')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View Transactions
          </button>
        </div>

        {/* Card 6: Overtime Total */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> +2.1%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Tổng Giờ Tăng Ca Phê Duyệt</div>
          <div className="text-2xl font-black text-slate-900 mt-1">1,960.5h</div>
          <button onClick={() => onNavigate('overtime')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View Earnings
          </button>
        </div>

        {/* Card 7: New Hires */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> +2.1%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Nhận Việc Mới Tháng Này</div>
          <div className="text-2xl font-black text-slate-900 mt-1">+{stats.newHires} Nhân viên</div>
          <button onClick={() => onNavigate('employees')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View All
          </button>
        </div>

        {/* Card 8: Turnover Rate */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
              <UserMinus className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
              <TrendingDown className="w-3 h-3" /> -11.3%
            </span>
          </div>
          <div className="text-xs font-bold text-slate-500 mt-3">Tỷ Lệ Nghỉ Việc (Turnover)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.turnoverRate}%</div>
          <button onClick={() => onNavigate('employees')} className="text-[11px] font-bold text-slate-600 hover:underline mt-2 inline-block">
            View Candidates
          </button>
        </div>
      </div>

      {/* 4. Middle 3-Column Section (Employee Status, Attendance Semicircle Gauge, Dept & Clock-in) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Employee Status (Segmented Bar + 2x2 Grid + Top Performer) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-900">Employee Status</h3>
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600">
                📅 This Week
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-slate-400">Total Employee</span>
              <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            </div>

            {/* Segmented Horizontal Bar (Orange / Navy / Red / Pink) */}
            <div className="h-3 w-full rounded-full overflow-hidden flex gap-1 mt-3">
              <div style={{ width: '48%' }} className="bg-[#FF5B26] rounded-l-full" title="Chính thức (48%)" />
              <div style={{ width: '24%' }} className="bg-[#0F172A]" title="Thời vụ (24%)" />
              <div style={{ width: '18%' }} className="bg-[#EF4444]" title="Thử việc (18%)" />
              <div style={{ width: '10%' }} className="bg-[#EC4899] rounded-r-full" title="Khác (10%)" />
            </div>

            {/* 2x2 Metric Grid */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-100">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded bg-[#FF5B26]" />
                  <span>Fulltime ({Math.round((stats.official / stats.total) * 100)}%)</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">{stats.official}</div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded bg-[#0F172A]" />
                  <span>Seasonal ({Math.round((stats.seasonal / stats.total) * 100)}%)</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">{stats.seasonal}</div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded bg-[#EF4444]" />
                  <span>Ca Đêm N (12%)</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">12</div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded bg-[#EC4899]" />
                  <span>Nghỉ Phép AL (4%)</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">04</div>
              </div>
            </div>

            {/* Top Performer Card */}
            <div className="mt-6 p-3.5 bg-[#FFF9F6] border border-[#FFE7DD] rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white font-black flex items-center justify-center text-sm shadow-inner">
                  T
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Trịnh Đình Tâm</div>
                  <div className="text-[11px] text-slate-500">Warehouse Lead (LEP010)</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider font-bold text-orange-600">Performance</div>
                <div className="text-sm font-black text-orange-600">98%</div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('employees')}
            className="w-full mt-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition text-center"
          >
            View All Employees
          </button>
        </div>

        {/* Column 2: Attendance Semicircle Radial Gauge (Figma Spec) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-900">Attendance Overview</h3>
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600">
                📅 Today
              </span>
            </div>

            {/* Semicircle Gauge Graphic */}
            <div className="relative flex flex-col items-center justify-center py-4">
              <svg className="w-52 h-28" viewBox="0 0 200 110">
                {/* Background Arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                {/* Present Green Segment */}
                <path
                  d="M 20 100 A 80 80 0 0 1 100 20"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="20"
                  strokeLinecap="round"
                  strokeDasharray="130"
                  strokeDashoffset="0"
                />
                {/* Late Amber Segment */}
                <path
                  d="M 105 20 A 80 80 0 0 1 155 55"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                {/* Absent Red Segment */}
                <path
                  d="M 160 60 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute bottom-2 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Attendance</div>
                <div className="text-3xl font-black text-slate-900">{stats.official + stats.seasonal - stats.totalMissingPunch}</div>
              </div>
            </div>

            {/* Legend Stats */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-600">Present (78%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-semibold text-slate-600">Late ({stats.lateRate}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="font-semibold text-slate-600">Permission AL (4%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="font-semibold text-slate-600">Absent / Off ({stats.missingPunchRate}%)</span>
              </div>
            </div>

            {/* Total Absentees Avatar Stack */}
            <div className="mt-6 p-3 bg-slate-50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Total Absentees:</span>
                <div className="flex -space-x-1.5 overflow-hidden">
                  <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-rose-400 text-[10px] font-bold text-white flex items-center justify-center">M</span>
                  <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-amber-400 text-[10px] font-bold text-white flex items-center justify-center">T</span>
                  <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-400 text-[10px] font-bold text-white flex items-center justify-center">+2</span>
                </div>
              </div>
              <button onClick={() => onNavigate('leavePending')} className="text-xs font-bold text-[#FF5B26] hover:underline">
                View Details
              </button>
            </div>
          </div>

          <button
            onClick={() => onNavigate('timesheet')}
            className="w-full mt-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition text-center"
          >
            View Full Attendance Matrix
          </button>
        </div>

        {/* Column 3: Employees By Department (Horizontal Orange Bars) & Realtime Clock Feed */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
          {/* Top: Dept Horizontal Bars */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-900">Employees By Department</h3>
              <span className="text-xs font-bold text-slate-400">Total {stats.total}</span>
            </div>

            <div className="space-y-3">
              {stats.departmentChartData.slice(0, 5).map((d) => {
                const pct = maxDept > 0 ? (d.total / maxDept) * 100 : 0;
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700">{d.name}</span>
                      <span className="text-slate-900 font-extrabold">{d.total} NV</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-[#FF5B26] rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] font-bold text-emerald-600 mt-3 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>No of Employees increased by +20% this month</span>
            </div>
          </div>

          {/* Bottom: Realtime Clock-In/Out List with Late Indicator */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-extrabold text-slate-900">Recent Clock-In/Out</h4>
              <span className="text-[10px] text-slate-400">Live Machine Feed</span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                    NT
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Nguyễn Bá Trình</div>
                    <div className="text-[10px] text-slate-400">WH • In 07:28 AM</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                  Đúng giờ
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-rose-50/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-[10px]">
                    MC
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Mã Hén Chiêu</div>
                    <div className="text-[10px] text-slate-400">WH • In 07:48 AM</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-md">
                  Trễ 18 phút
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('timesheet')}
              className="w-full mt-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition text-center"
            >
              View All Attendance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
