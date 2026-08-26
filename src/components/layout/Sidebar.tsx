import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  Clock, 
  CalendarCheck, 
  RotateCcw, 
  ScanLine, 
  Settings,
  AlertTriangle,
  FileClock,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  Building,
  Briefcase,
  Grid,
  FileText
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';

export type NavPageId = 
  | 'dashboard' 
  | 'employees' 
  | 'timesheet' 
  | 'overtime' 
  | 'leavePending' 
  | 'shiftRoster' 
  | 'ocrVerification' 
  | 'settings';

interface SidebarProps {
  activePage: NavPageId;
  onSelectPage: (page: NavPageId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onSelectPage }) => {
  const { t } = useLanguage();
  const { session, currentRole } = useAuth();
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [appsOpen, setAppsOpen] = useState(true);

  // Combined live badges query - gộp 3 query thành 1 để giảm IndexedDB reads
  const badgeCounts = useLiveQuery(async () => {
    const [pendingLeave, violations, pendingOT] = await Promise.all([
      db.leaveRequests.where('status').equals('PENDING').count(),
      db.shiftRosters.filter(item => Boolean(item.isRestViolation)).count(),
      db.overtimeRecords.where('verificationStatus').equals('PENDING').count(),
    ]);
    return { pendingLeave, violations, pendingOT };
  }, []);
  const pendingLeaveCount = badgeCounts?.pendingLeave ?? 0;
  const shiftViolationCount = badgeCounts?.violations ?? 0;
  const pendingOTCount = badgeCounts?.pendingOT ?? 0;

  return (
    <aside className="w-64 bg-white text-slate-600 flex flex-col shrink-0 border-r border-slate-200 select-none overflow-y-auto font-sans">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF5B26] to-[#FF8442] flex items-center justify-center shadow-md shadow-orange-200">
          {/* SmartHR Hand Logo */}
          <span className="text-white font-black text-lg tracking-tighter">S</span>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <span className="font-extrabold text-base text-slate-900 tracking-tight">Smart</span>
            <span className="font-extrabold text-base text-[#FF5B26] tracking-tight">HR</span>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Leggett & Platt</div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="p-4 space-y-6 flex-1 text-xs">
        {/* SECTION 1: MAIN MENU */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            MAIN MENU
          </div>

          {/* Accordion 1: Dashboard */}
          <div>
            <button
              onClick={() => {
                setDashboardOpen(!dashboardOpen);
                onSelectPage('dashboard');
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition ${
                activePage === 'dashboard'
                  ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className={`w-4 h-4 ${activePage === 'dashboard' ? 'text-[#FF5B26]' : 'text-slate-500'}`} />
                <span>Dashboard</span>
              </div>
              {dashboardOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </button>

            {dashboardOpen && (
              <div className="pl-9 pr-2 py-1 space-y-0.5 border-l border-slate-100 ml-5 my-1">
                <button
                  onClick={() => onSelectPage('dashboard')}
                  className={`w-full text-left py-1.5 px-2 rounded-lg font-semibold transition ${
                    activePage === 'dashboard' ? 'text-[#FF5B26] font-bold' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Admin Dashboard
                </button>
                <button
                  onClick={() => onSelectPage('dashboard')}
                  className="w-full text-left py-1.5 px-2 rounded-lg font-medium text-slate-400 hover:text-slate-700"
                >
                  Employee Analytics
                </button>
              </div>
            )}
          </div>

          {/* Accordion 2: Applications */}
          <div>
            <button
              onClick={() => setAppsOpen(!appsOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <Grid className="w-4 h-4 text-slate-500" />
                <span>HR Applications</span>
              </div>
              {appsOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </button>

            {appsOpen && (
              <div className="space-y-0.5 mt-1">
                {/* Employee Master Catalog */}
                <button
                  onClick={() => onSelectPage('employees')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'employees'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className={`w-4 h-4 ${activePage === 'employees' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('employees')}</span>
                  </div>
                </button>

                {/* Timesheet Calendar Matrix */}
                <button
                  onClick={() => onSelectPage('timesheet')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'timesheet'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarDays className={`w-4 h-4 ${activePage === 'timesheet' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('timesheet')}</span>
                  </div>
                </button>

                {/* Overtime Page */}
                <button
                  onClick={() => onSelectPage('overtime')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'overtime'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className={`w-4 h-4 ${activePage === 'overtime' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('overtime')}</span>
                  </div>
                  {pendingOTCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                      {pendingOTCount}
                    </span>
                  )}
                </button>

                {/* Leave Pending Page */}
                <button
                  onClick={() => onSelectPage('leavePending')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'leavePending'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className={`w-4 h-4 ${activePage === 'leavePending' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('leavePending')}</span>
                  </div>
                  {pendingLeaveCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                      {pendingLeaveCount}
                    </span>
                  )}
                </button>

                {/* Shift Roster & 12h Rest Violations */}
                <button
                  onClick={() => onSelectPage('shiftRoster')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'shiftRoster'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <RotateCcw className={`w-4 h-4 ${activePage === 'shiftRoster' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('shiftRoster')}</span>
                  </div>
                  {shiftViolationCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">
                      {shiftViolationCount}
                    </span>
                  )}
                </button>

                {/* OCR Overtime Verification */}
                <button
                  onClick={() => onSelectPage('ocrVerification')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
                    activePage === 'ocrVerification'
                      ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ScanLine className={`w-4 h-4 ${activePage === 'ocrVerification' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
                    <span>{t('ocrVerification')}</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 text-[#FF5B26] text-[9px] font-extrabold">AI</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: SYSTEM & CONFIGURATION */}
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            SYSTEM & ROLES
          </div>

          <button
            onClick={() => onSelectPage('settings')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition ${
              activePage === 'settings'
                ? 'bg-[#FFF5F2] text-[#FF5B26] border-l-4 border-[#FF5B26] rounded-l-none font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Settings className={`w-4 h-4 ${activePage === 'settings' ? 'text-[#FF5B26]' : 'text-slate-400'}`} />
              <span>{t('settings')} & RBAC</span>
            </div>
          </button>
        </div>
      </div>

      {/* User Footer Profile Card */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-400 to-amber-400 flex items-center justify-center text-white font-bold text-xs shadow-inner">
            {(session?.displayName ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs text-slate-900 truncate">{session?.displayName ?? 'Chưa đăng nhập'}</div>
            <div className="text-[10px] text-slate-400 truncate">{currentRole ?? ''}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
