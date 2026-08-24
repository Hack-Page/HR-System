import React, { useState } from 'react';
import { 
  Settings, 
  Shield, 
  SlidersHorizontal, 
  Database, 
  CheckCircle2, 
  Save, 
  RefreshCw, 
  Lock,
  Layers,
  Award,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { RoleType, ISystemSettings } from '../types';
import { DEFAULT_SETTINGS, db } from '../db';
import { seedDatabaseIfEmpty } from '../services/db-seeder';

export const SettingsPage: React.FC = () => {
  const { currentRole } = useAuth();
  const { success, warning, error } = useToast();
  const { confirm } = useModal();

  const [settings, setSettings] = useState<ISystemSettings>(() => {
    const saved = localStorage.getItem('smarthr_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [activeTab, setActiveTab] = useState<'rbac' | 'diligence' | 'system'>('rbac');

  const rolesList: RoleType[] = [
    'HR Manager',
    'HR Admin',
    'Warehouse Admin',
    'Production Admin',
    'QC Admin',
    'AD System'
  ];

  const permissionsList = [
    { id: 'VIEW_DASHBOARD', label: 'Xem Executive Dashboard & Báo Cáo' },
    { id: 'MANAGE_EMPLOYEES', label: 'Thêm, Sửa, Xóa Danh Mục Nhân Viên' },
    { id: 'IMPORT_LOGS', label: 'Import Dữ Liệu Chấm Công Máy (>20k dòng)' },
    { id: 'MANAGE_TIMESHEET', label: 'Sửa Mã Chấm Công 31 Ngày' },
    { id: 'MANAGE_OT', label: 'Phê Duyệt & Chốt Giờ Tăng Ca' },
    { id: 'MANAGE_LEAVE', label: 'Duyệt Bù Phép & Trừ Hạn Mức Phép Năm' },
    { id: 'MANAGE_ROSTER', label: 'Phân Ca & Điều Chỉnh Ca Vi Phạm <12h' },
    { id: 'SCAN_OCR', label: 'Quét OCR Phiếu Tăng Ca Tự Động' },
    { id: 'SYSTEM_SETTINGS', label: 'Cấu Hình Hệ Thống & Phân Quyền AD System' }
  ];

  const handleTogglePermission = (role: RoleType, permId: string) => {
    if (currentRole !== 'AD System') {
      warning('Quyền hạn bị hạn chế', 'Chỉ tài khoản có vai trò AD System mới được phép chỉnh sửa ma trận phân quyền.');
      return;
    }

    const currentPerms = settings.rolePermissions[role] || [];
    const isGranted = currentPerms.includes(permId) || currentPerms.includes('ALL_ACCESS');

    let updatedPerms: string[];
    if (isGranted) {
      updatedPerms = currentPerms.filter(p => p !== permId && p !== 'ALL_ACCESS');
    } else {
      updatedPerms = [...currentPerms, permId];
    }

    const updatedSettings = {
      ...settings,
      rolePermissions: {
        ...settings.rolePermissions,
        [role]: updatedPerms
      }
    };

    setSettings(updatedSettings);
    localStorage.setItem('smarthr_settings', JSON.stringify(updatedSettings));
    success('Đã cập nhật phân quyền', `Quyền ${permId} cho vai trò ${role} đã được cập nhật.`);
  };

  const handleSaveDiligenceRules = () => {
    localStorage.setItem('smarthr_settings', JSON.stringify(settings));
    success('Đã lưu cấu hình chuyên cần', 'Tỷ lệ giảm trừ tiền chuyên cần đã được áp dụng toàn hệ thống.');
  };

  const handleResetDatabase = async () => {
    const ok = await confirm({
      title: 'Khôi phục dữ liệu mặc định',
      message: 'Hành động này sẽ xóa toàn bộ dữ liệu hiện tại trong IndexedDB và nạp lại dữ liệu chuẩn từ file KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx. Bạn có chắc chắn không?',
      type: 'danger',
      confirmText: 'Khôi phục ngay',
      cancelText: 'Hủy bỏ'
    });

    if (ok) {
      await db.delete();
      await db.open();
      await seedDatabaseIfEmpty();
      success('Khôi phục dữ liệu thành công', 'Toàn bộ danh mục nhân viên và bảng chốt công đã được đồng bộ lại.');
    }
  };

  return (
    <div className="p-6 w-full space-y-6 flex-1 flex flex-col">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-500" />
            <span>Cài Đặt Hệ Thống & Phân Quyền Chủ Động (System Configuration)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Quản trị viên AD System có thể tùy biến ma trận phân quyền 6 vai trò, công thức giảm trừ chuyên cần và cài đặt tính toán tăng ca chuẩn.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('rbac')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'rbac'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4 text-orange-400" />
          <span>Ma Trận Phân Quyền (RBAC Matrix)</span>
        </button>

        <button
          onClick={() => setActiveTab('diligence')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'diligence'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4 text-orange-400" />
          <span>Quy Tắc Chuyên Cần & Phép Năm</span>
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'system'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4 text-orange-400" />
          <span>Cơ Sở Dữ Liệu & Khôi Phục</span>
        </button>
      </div>

      {/* Tab Content 1: RBAC Matrix */}
      {activeTab === 'rbac' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Phân Quyền Chủ Động Theo 6 Vai Trò Doanh Nghiệp</h3>
              <p className="text-xs text-slate-500 mt-0.5">Bật / Tắt trực tiếp quyền truy cập theo từng module</p>
            </div>
            {currentRole !== 'AD System' && (
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-600" />
                Chỉ xem (Cần role AD System để sửa)
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 min-w-[240px]">Chức Năng & Quyền Hạn</th>
                  {rolesList.map(r => (
                    <th key={r} className="py-3 px-3 text-center min-w-[120px]">
                      <div className="font-bold">{r}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissionsList.map((perm) => (
                  <tr key={perm.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {perm.label}
                    </td>
                    {rolesList.map(role => {
                      const perms = settings.rolePermissions[role] || [];
                      const isGranted = perms.includes('ALL_ACCESS') || perms.includes(perm.id);

                      return (
                        <td key={role} className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleTogglePermission(role, perm.id)}
                            disabled={currentRole !== 'AD System' || (role === 'AD System' && perm.id === 'SYSTEM_SETTINGS')}
                            className={`w-6 h-6 rounded-lg font-bold inline-flex items-center justify-center transition ${
                              isGranted
                                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                                : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {isGranted && <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 2: Diligence & Leave rules */}
      {activeTab === 'diligence' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Cấu Hình Giảm Trừ Tiền Chuyên Cần & Hạn Mức Phép Năm</h3>
            <p className="text-xs text-slate-500 mt-1">
              Định nghĩa tỷ lệ giảm trừ tiền chuyên cần khi nhân viên nghỉ việc riêng không hưởng lương (UL). Có thể tùy biến riêng theo từng phòng ban.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            {/* Global Rule */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-orange-500" />
                <span>Quy Tắc Chuyên Cần Mặc Định (Toàn Hệ Thống)</span>
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nghỉ 2 ngày không lương (UL &ge; 2 ngày):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={settings.diligenceDeductionRules[0]?.twoDaysULPenaltyPct ?? 50}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const rules = [...settings.diligenceDeductionRules];
                      rules[0].twoDaysULPenaltyPct = val;
                      setSettings({ ...settings, diligenceDeductionRules: rules });
                    }}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                  <span className="text-xs text-slate-500">% giảm trừ tiền chuyên cần (Mặc định 50%)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nghỉ từ 3 ngày không lương (UL &ge; 3 ngày):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={settings.diligenceDeductionRules[0]?.threeDaysULPenaltyPct ?? 100}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const rules = [...settings.diligenceDeductionRules];
                      rules[0].threeDaysULPenaltyPct = val;
                      setSettings({ ...settings, diligenceDeductionRules: rules });
                    }}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                  <span className="text-xs text-slate-500">% giảm trừ tiền chuyên cần (Mặc định 100%)</span>
                </div>
              </div>
            </div>

            {/* Overtime & Quota Defaults */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span>Quy Tắc Tính Tăng Ca & Phép Năm Ban Đầu</span>
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phương thức tính giờ tăng ca:</label>
                <div className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
                  ✓ Tính đúng theo giờ chuẩn thực tế (không làm tròn)
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hạn mức phép năm ban đầu mặc định:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={settings.defaultAnnualLeaveQuota}
                    onChange={(e) => setSettings({ ...settings, defaultAnnualLeaveQuota: parseFloat(e.target.value) || 12 })}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                  <span className="text-xs text-slate-500">ngày/năm (Có thể sửa tự do theo từng cá nhân)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={handleSaveDiligenceRules}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>Lưu Cấu Hình Chuyên Cần</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab Content 3: System & DB Reset */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Quản Trị Cơ Sở Dữ Liệu Trình Duyệt (Dexie.js IndexedDB)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Toàn bộ dữ liệu được lưu trữ cục bộ tại máy người dùng. Bạn có thể khôi phục lại dữ liệu chuẩn từ file thực tế bất cứ lúc nào.
            </p>
          </div>

          <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200 space-y-3">
            <h4 className="font-bold text-xs text-rose-900 uppercase tracking-wider">Khôi phục cơ sở dữ liệu về mặc định</h4>
            <p className="text-xs text-slate-600">
              Nạp lại toàn bộ 102 nhân viên, 3,162 ô công và 196 bản ghi tăng ca gốc từ tài liệu chốt công.
            </p>
            <button
              onClick={handleResetDatabase}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-rose-200"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Khôi Phục Dữ Liệu Gốc</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
