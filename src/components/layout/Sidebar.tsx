import React from 'react';
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
  FileClock
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
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

  // Dynamic live badges from Dexie
  const pendingLeaveCount = useLiveQuery(async () => {
    return await db.leaveRequests.where('status').equals('PENDING').count();
  }, []) || 0;

  const shiftViolationCount = useLiveQuery(async () => {
    return await db.shiftRosters.filter(item => Boolean(item.isRestViolation)).count();
  }, []) || 0;

  const pendingOTCount = useLiveQuery(async () => {
    return await db.overtimeRecords.where('verificationStatus').equals('PENDING').count();
  }, []) || 0;

  const navItems: { id: NavPageId; labelKey: any; icon: React.ReactNode; badge?: number; badgeType?: 'danger' | 'warning' | 'info' }[] = [
    {
      id: 'dashboard',
      labelKey: 'dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'employees',
      labelKey: 'employees',
      icon: <Users className="w-4 h-4" />
    },
    {
      id: 'timesheet',
      labelKey: 'timesheet',
      icon: <CalendarDays className="w-4 h-4" />
    },
    {
      id: 'overtime',
      labelKey: 'overtime',
      icon: <Clock className="w-4 h-4" />,
      badge: pendingOTCount > 0 ? pendingOTCount : undefined,
      badgeType: 'warning'
    },
    {
      id: 'leavePending',
      labelKey: 'leavePending',
      icon: <CalendarCheck className="w-4 h-4" />,
      badge: pendingLeaveCount > 0 ? pendingLeaveCount : undefined,
      badgeType: 'danger'
    },
    {
      id: 'shiftRoster',
      labelKey: 'shiftRoster',
      icon: <RotateCcw className="w-4 h-4" />,
      badge: shiftViolationCount > 0 ? shiftViolationCount : undefined,
      badgeType: 'danger'
    },
    {
      id: 'ocrVerification',
      labelKey: 'ocrVerification',
      icon: <ScanLine className="w-4 h-4" />
    },
    {
      id: 'settings',
      labelKey: 'settings',
      icon: <Settings className="w-4 h-4" />
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Navigation Links */}
      <div className="p-4 flex-1 flex flex-col gap-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Phân Hệ Quản Trị
        </div>

        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/20'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-orange-400'}`}>
                  {item.icon}
                </div>
                <span>{t(item.labelKey)}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.badgeType === 'danger'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer info card */}
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-300">Local-First Engine Active</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Dexie.js IndexedDB & Web Workers
          </p>
        </div>
      </div>
    </aside>
  );
};
