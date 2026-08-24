import React, { useRef, useState } from 'react';
import { 
  Upload, 
  Download, 
  Globe, 
  Shield, 
  Search, 
  CheckCircle2, 
  Loader2, 
  FileSpreadsheet,
  Building2,
  ChevronDown,
  Cloud,
  FolderSync
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../context/ModalContext';
import { RoleType } from '../../types';
import { exportTimesheetToExcel } from '../../services/excel-exporter';
import { exportDatabaseToSnapshot, importDatabaseFromSnapshot } from '../../services/db-sync';
import { db } from '../../db';

export const Header: React.FC = () => {
  const { currentRole, setCurrentRole, hasPermission } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { success, error, warning, info } = useToast();
  const { alertModal } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  const roles: RoleType[] = [
    'HR Manager',
    'HR Admin',
    'Warehouse Admin',
    'Production Admin',
    'QC Admin',
    'AD System'
  ];

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
      const worker = new Worker(
        new URL('../../workers/timesheet-parser.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.postMessage({ buffer, month: 8, year: 2026 });

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
        } else if (msg.type === 'ERROR') {
          setIsImporting(false);
          error('Lỗi khi xử lý file', msg.error);
          worker.terminate();
        }
      };

      worker.onerror = (err) => {
        setIsImporting(false);
        error('Lỗi Web Worker', err.message);
        worker.terminate();
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
      {/* Left: Brand & Search */}
      <div className="flex items-center gap-6 flex-1 max-w-xl">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-rose-500 flex items-center justify-center shadow-md shadow-orange-200">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold text-slate-900 leading-tight">SmartHR</h1>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Leggett & Platt</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-sm transition focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
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

        {/* Import Button */}
        {hasPermission('IMPORT_LOGS') && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-60"
            title="Nạp file chấm công 2107-20082026.xlsx (>19k dòng)"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            ) : (
              <Upload className="w-4 h-4 text-slate-600" />
            )}
            <span className="hidden lg:inline">{isImporting ? `${importProgress}%` : t('importExcel')}</span>
          </button>
        )}

        {/* Export Button */}
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm shadow-emerald-200"
          title="Xuất bảng chốt công chuẩn theo mẫu KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden lg:inline">{t('exportExcel')}</span>
        </button>

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
                        await exportDatabaseToSnapshot(currentRole);
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
                          try {
                            const res = await importDatabaseFromSnapshot(file);
                            success(
                              'Đồng bộ OneDrive thành công!',
                              `Đã nạp ${res.employeesCount} nhân viên, ${res.timesheetsCount} ô công từ bản ghi của ${res.exportedBy} (${new Date(res.exportedAt).toLocaleTimeString('vi-VN')}).`
                            );
                          } catch (err: any) {
                            error('Lỗi nạp file đồng bộ', err.message);
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

        {/* Role Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-orange-400" />
            <span>{currentRole}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isRoleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                {t('role')} (RBAC Access)
              </div>
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setCurrentRole(r);
                    setIsRoleDropdownOpen(false);
                    info(`Đã chuyển sang vai trò: ${r}`);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition ${
                    currentRole === r ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>{r}</span>
                  {currentRole === r && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />}
                </button>
              ))}
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
