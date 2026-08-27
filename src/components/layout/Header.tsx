import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Download,
  Globe,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  Cloud,
  LogOut,
  UserCircle2,
  Bell,
  AlertTriangle,
  CalendarClock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../context/ModalContext';
import { exportTimesheetToExcel } from '../../services/excel-exporter';
import { exportDatabaseToSnapshot, importDatabaseFromSnapshot } from '../../services/db-sync';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { daysUntil as calcDaysUntil } from '../../services/pay-period';

export const Header: React.FC = () => {
  const { session, currentRole, hasPermission, logout, refreshPermissions } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { success, error, warning, info } = useToast();
  const { alertModal, confirm } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Chuông thông báo hợp đồng sắp hết hạn
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const contractNotifs = (() => {
    const now = new Date();
    const list: Array<{ emp: any; days: number; term: string; notifyAt: string }> = [];
    employees.forEach(emp => {
      if (!emp.contractEndDate || emp.status === 'RESIGNED') return;
      if (emp.contractTerm === 'PERMANENT') return;
      const days = calcDaysUntil(emp.contractEndDate, now);
      if (days === null || days < 0 || days > 30) return;
      // Ngưỡng thông báo chuẩn
      const term = emp.contractTerm;
      let shouldNotify = false;
      let notifyAt = '';
      if (term === '1_MONTH' || term === '2_MONTHS') {
        if (days <= 14 && days >= 12) { shouldNotify = true; notifyAt = '14 ngày'; }
        else if (days <= 7 && days >= 5) { shouldNotify = true; notifyAt = '7 ngày'; }
        else if (days <= 5 && days >= 0) { shouldNotify = true; notifyAt = `${days} ngày`; }
        else if (days <= 14 && days > 7) { shouldNotify = true; notifyAt = '14 ngày'; }
        else if (days <= 7) { shouldNotify = true; notifyAt = '7 ngày'; }
      } else if (term === '1_YEAR' || term === '3_YEARS') {
        if (days <= 30 && days > 15) { shouldNotify = true; notifyAt = '30 ngày'; }
        else if (days <= 15 && days >= 0) { shouldNotify = true; notifyAt = days <= 15 && days > 5 ? '15 ngày' : `${days} ngày`; }
      } else {
        // Chưa cấu hình term: nếu còn <=30 ngày thì báo
        if (days <= 30 && days >= 0) { shouldNotify = true; notifyAt = `${days} ngày`; }
      }
      if (shouldNotify) list.push({ emp, days, term: term || '—', notifyAt });
    });
    return list.sort((a,b) => a.days - b.days);
  })();

  // Huỷ import worker khi rời trang để tránh leak + setState trên unmounted
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      error('Định dạng tệp không hợp lệ', 'Vui lòng chọn tệp Excel (.xlsx hoặc .xls)');
      return;
    }

    try {
      setIsImporting(true);
      setImportProgress(5);
      setImportStatusText('Đang khởi tạo Web Worker xử lý nền...');

      const buffer = await file.arrayBuffer();

      // Launch Timesheet Parser Web Worker
      const now = new Date();
      const worker = new Worker(
        new URL('../../workers/timesheet-parser.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      // Dữ liệu nạp vào kỳ hiện tại thay vì tháng cứng
      worker.postMessage({ buffer, month: now.getMonth() + 1, year: now.getFullYear() });

      worker.onmessage = async (event) => {
        const msg = event.data;
        if (msg.type === 'PROGRESS') {
          setImportProgress(msg.progress);
          setImportStatusText(msg.message);
        } else if (msg.type === 'COMPLETE') {
          setImportStatusText('Đang lưu vào cơ sở dữ liệu Dexie.js (IndexedDB)...');

          // Bulk put to Dexie.js
          if (msg.timesheets && msg.timesheets.length > 0) {
            await db.dailyTimesheets.bulkPut(msg.timesheets);
          }
          if (msg.overtimes && msg.overtimes.length > 0) {
            await db.overtimeRecords.bulkPut(msg.overtimes);
          }
          if (msg.rawLogs && msg.rawLogs.length > 0) {
            await db.rawAttendanceLogs.clear();
            await db.rawAttendanceLogs.bulkAdd(msg.rawLogs);
          }

          setIsImporting(false);
          success(
            'Nạp dữ liệu chấm công thành công!',
            `Đã phân tích ${msg.rawLogsCount.toLocaleString()} dòng quẹt thẻ và cập nhật ${msg.timesheetCellsCount.toLocaleString()} ô công.`
          );
          worker.terminate();
          workerRef.current = null;
        } else if (msg.type === 'ERROR') {
          setIsImporting(false);
          error('Lỗi khi xử lý file', msg.error);
          worker.terminate();
          workerRef.current = null;
        }
      };

      worker.onerror = (err) => {
        setIsImporting(false);
        error('Lỗi Web Worker', err.message);
        worker.terminate();
        workerRef.current = null;
      };

    } catch (err: any) {
      setIsImporting(false);
      error('Lỗi hệ thống', err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = async () => {
    try {
      info('Đang chuẩn bị dữ liệu xuất Excel...', 'Hệ thống đang định dạng tiêu đề, chèn logo Leggett & Platt và áp dụng công thức.');
      const emps = await db.employees.toArray();
      const timesheets = await db.dailyTimesheets.toArray();
      const overtimes = await db.overtimeRecords.toArray();

      if (emps.length === 0) {
        warning('Chưa có dữ liệu nhân viên để xuất tệp.');
        return;
      }

      await exportTimesheetToExcel(emps, timesheets, overtimes, 8, 2026);
      success('Xuất file Excel thành công!', 'File KIEM_TRA_CHOT_CONG đã được tải về máy của bạn.');
    } catch (err: any) {
      error('Lỗi xuất Excel', err.message);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      {/* Left: Logo + Chuông thông báo hợp đồng */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <img
          src="/Leggett.jpg"
          alt="Leggett & Platt HOME FURNITURE"
          className="h-9 w-auto object-contain max-w-[260px]"
          loading="eager"
        />
        {/* Chuông thông báo hợp đồng sắp hết hạn */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(v => !v)}
            className="relative p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-sm"
            title="Thông báo hợp đồng sắp hết hạn"
            aria-label="Thông báo hợp đồng"
          >
            <Bell className="w-5 h-5 text-slate-700" />
            {contractNotifs.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow">
                {contractNotifs.length}
              </span>
            )}
          </button>
          {isNotifOpen && (
            <div className="absolute left-0 mt-2 w-[380px] bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <div className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-amber-600" />
                  <span>Hợp đồng sắp hết hạn</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px]">{contractNotifs.length} nhân viên</span>
                </div>
                <button onClick={() => setIsNotifOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">×</button>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {contractNotifs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                    <p className="font-semibold text-slate-700">Không có hợp đồng sắp hết hạn</p>
                    <p className="text-[11px] text-slate-400 mt-1">Ngưỡng: HĐ 1-2 tháng → 14 & 7 ngày | HĐ 1/3 năm → 30 & 15 ngày | Vĩnh viễn không báo</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contractNotifs.map(({ emp, days, term }) => (
                      <div key={emp.employeeId} className="px-4 py-3 hover:bg-slate-50 flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 text-xs">{emp.employeeId} • {emp.fullName}</div>
                          <div className="text-[11px] text-slate-500">{emp.department} • {emp.position} • {term === '1_MONTH' ? 'HĐ 1 tháng' : term === '2_MONTHS' ? 'HĐ 2 tháng' : term === '1_YEAR' ? 'HĐ 1 năm' : term === '3_YEARS' ? 'HĐ 3 năm' : term === 'PERMANENT' ? 'Vĩnh viễn' : 'Chưa cấu hình'} {emp.contractEndDate ? `• hết hạn ${emp.contractEndDate}` : ''}</div>
                        </div>
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-black border ${days <= 5 ? 'bg-rose-100 text-rose-700 border-rose-200 animate-pulse' : days <= 15 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          còn {days} ngày
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions, Import/Export, Language & Role Switcher */}
      <div className="flex items-center gap-3">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx, .xls"
          className="hidden"
        />

        {/* Import Button - đã đổi thành Nạp dữ liệu chấm công */}
        {hasPermission('IMPORT_LOGS') && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-60"
            title="Nạp dữ liệu chấm công"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            ) : (
              <Upload className="w-4 h-4 text-slate-600" />
            )}
            <span className="hidden lg:inline">{isImporting ? `${importProgress}%` : t('importExcel')}</span>
          </button>
        )}

        {/* Export Button (yêu cầu quyền quản lý chấm công) */}
        {hasPermission('MANAGE_TIMESHEET') && (
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm shadow-emerald-200"
            title="Xuất bảng chốt công chuẩn theo mẫu KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden lg:inline">{t('exportExcel')}</span>
          </button>
        )}

        {/* OneDrive Shared Sync Button */}
        <button
          onClick={() => {
            alertModal(
              'Đồng Bộ Dữ Liệu Dùng Chung (OneDrive Sync)',
              (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-200">
                    <p className="font-bold flex items-center gap-1.5">
                      <Cloud className="w-4 h-4 text-blue-600" />
                      <span>Cơ Chế Đồng Bộ Nhiều Người Dùng Qua OneDrive</span>
                    </p>
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      Ứng dụng chạy 100% In-Browser. Để đồng bộ dữ liệu giữa các máy tính (HR Admin, Warehouse, Production, QC), bạn chỉ cần xuất file <b>Snapshot JSON</b> vào thư mục OneDrive dùng chung, hoặc nạp file JSON từ OneDrive.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={async () => {
                        await exportDatabaseToSnapshot(session?.username ?? 'unknown');
                        success('Đã xuất bản ghi Snapshot', 'Lưu file JSON này vào thư mục OneDrive dùng chung.');
                      }}
                      className="p-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex flex-col items-center justify-center gap-2 transition"
                    >
                      <Download className="w-5 h-5 text-orange-400" />
                      <span>1. Xuất Dữ Liệu Ra OneDrive</span>
                    </button>

                    <label className="p-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex flex-col items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-orange-200">
                      <Upload className="w-5 h-5" />
                      <span>2. Nạp Dữ Liệu Từ OneDrive</span>
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                          onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const ok = await confirm({
                            title: 'Nạp dữ liệu đè lên hiện tại?',
                            message: `Toàn bộ dữ liệu nhân viên/chấm công/tăng ca trên máy này sẽ bị THAY THẾ bằng nội dung file "${file.name}". Hành động không thể hoàn tác.`,
                            confirmText: 'Thay thế dữ liệu',
                            cancelText: 'Huỷ',
                            type: 'warning'
                          });
                          if (!ok) {
                            e.target.value = '';
                            return;
                          }
                          try {
                            const res = await importDatabaseFromSnapshot(file);
                            await refreshPermissions();
                            success(
                              'Đồng bộ OneDrive thành công!',
                              `Đã nạp ${res.employeesCount} nhân viên, ${res.timesheetsCount} ô công${res.skippedTotal > 0 ? `, bỏ qua ${res.skippedTotal} dòng lỗi` : ''}${res.settingsRestored ? ' và khôi phục cấu hình' : ''}.`
                            );
                            if (res.skippedTotal > 0) {
                              warning('Có dòng dữ liệu không hợp lệ', `${res.skippedTotal} dòng bị bỏ qua do thiếu khoá hoặc sai cấu trúc.`);
                            }
                          } catch (err: any) {
                            error('Lỗi nạp file đồng bộ', err.message);
                          } finally {
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )
            );
          }}
          className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl transition"
          title="Đồng bộ dữ liệu đa người dùng qua thư mục OneDrive dùng chung"
        >
          <Cloud className="w-4 h-4 text-blue-600" />
          <span className="hidden xl:inline">Đồng Bộ OneDrive</span>
        </button>

        {/* Language Toggle Button */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          title="Chuyển đổi ngôn ngữ Tiếng Việt / English"
        >
          <Globe className="w-4 h-4 text-slate-500" />
          <span className="uppercase">{language}</span>
        </button>

        {/* User Menu (thay cho role-switcher: vai trò đến từ tài khoản đăng nhập) */}
        <div className="relative">
          <button
            onClick={() => setIsUserDropdownOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={isUserDropdownOpen}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition shadow-sm"
          >
            <UserCircle2 className="w-4 h-4 text-orange-400" />
            <span>{session?.displayName ?? 'Chưa đăng nhập'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isUserDropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95"
            >
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                {session?.username} · {currentRole}
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setIsUserDropdownOpen(false);
                  logout();
                  info('Đã đăng xuất', 'Hẹn gặp lại!');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-rose-600 hover:bg-rose-50 transition font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Import Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-x-0 top-16 bg-white/95 backdrop-blur-sm border-b border-orange-200 px-6 py-2.5 z-40 flex items-center justify-between shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
            <span className="text-xs font-semibold text-slate-700">{importStatusText}</span>
          </div>
          <div className="flex items-center gap-3 w-64">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-orange-500 to-rose-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-orange-600 w-9 text-right">{importProgress}%</span>
          </div>
        </div>
      )}
    </header>
  );
};
