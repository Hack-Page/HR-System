import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Flame, 
  Biohazard, 
  Award, 
  Calendar,
  CheckCircle2,
  XCircle,
  FileText,
  SlidersHorizontal
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { IEmployee, ShiftClassType, ContractType } from '../types';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';

export const EmployeeListPage: React.FC = () => {
  const { success, warning, error } = useToast();
  const { confirm, openCustomModal, closeCustomModal } = useModal();
  const { currentRole, departmentScope, hasPermission } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedContract, setSelectedContract] = useState<string>('ALL');
  const [selectedShift, setSelectedShift] = useState<string>('ALL');

  // Modal form states
  const [editingEmployee, setEditingEmployee] = useState<IEmployee | null>(null);

  // Query live employees
  const rawEmployees = useLiveQuery(() => db.employees.toArray(), []) || [];

  // Filter based on department scope and filters
  const filteredEmployees = rawEmployees.filter(emp => {
    // Dept scope for restricted roles
    if (departmentScope && emp.department !== departmentScope) {
      return false;
    }
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchId = emp.employeeId.toLowerCase().includes(q);
      const matchName = emp.fullName.toLowerCase().includes(q);
      const matchErp = emp.erpId?.toLowerCase().includes(q);
      if (!matchId && !matchName && !matchErp) return false;
    }
    // Dept filter
    if (selectedDept !== 'ALL' && emp.department !== selectedDept) return false;
    // Contract filter
    if (selectedContract !== 'ALL' && emp.contractType !== selectedContract) return false;
    // Shift filter
    if (selectedShift !== 'ALL' && emp.shiftClassId !== selectedShift) return false;

    return true;
  });

  const departments = Array.from(new Set(rawEmployees.map(e => e.department))).filter(Boolean);

  const handleOpenAddEditModal = (emp?: IEmployee) => {
    const defaultEmp: IEmployee = emp ? { ...emp } : {
      employeeId: `LEP${String(rawEmployees.length + 1).padStart(3, '0')}`,
      erpId: '',
      fullName: '',
      department: departmentScope || 'Production',
      position: 'Operator',
      startDate: new Date().toLocaleDateString('en-GB'),
      contractType: 'OFFICIAL',
      shiftClassId: 'OFFICE_M_S',
      customAllowances: {
        pcccAllowance: 0,
        hazardousAllowance: 0,
        diligenceBonus: 500000,
        productivityBonus: 0,
        tradeUnionFee: -40000,
        otherFees: 0
      },
      annualLeaveBalance: {
        initialQuota: 12,
        usedDays: 0,
        remainingDays: 12
      },
      status: 'ACTIVE'
    };

    setEditingEmployee(defaultEmp);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    if (!editingEmployee.employeeId.trim() || !editingEmployee.fullName.trim()) {
      error('Thiếu thông tin bắt buộc', 'Vui lòng nhập đầy đủ Mã NV và Họ tên.');
      return;
    }

    try {
      await db.employees.put(editingEmployee);
      success(
        'Lưu nhân viên thành công!',
        `Đã cập nhật thông tin và phụ cấp cho nhân viên ${editingEmployee.employeeId} - ${editingEmployee.fullName}.`
      );
      setEditingEmployee(null);
    } catch (err: any) {
      error('Lỗi khi lưu nhân viên', err.message);
    }
  };

  const handleDeleteEmployee = async (emp: IEmployee) => {
    const ok = await confirm({
      title: 'Xác nhận xóa nhân viên',
      message: `Bạn có chắc chắn muốn xóa nhân viên [${emp.employeeId}] ${emp.fullName} khỏi hệ thống không? Dữ liệu công liên quan cũng có thể bị ảnh hưởng.`,
      confirmText: 'Xóa nhân viên',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });

    if (ok) {
      await db.employees.delete(emp.employeeId);
      success('Đã xóa nhân viên', `Nhân viên ${emp.employeeId} đã được xóa thành công.`);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <span>Danh Mục Toàn Bộ Nhân Viên (Master Catalog & Classes)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý quan hệ ca làm việc (Hành chính T2-T6 / T2-T7, Ca 1, Ca 2), chu kỳ tính công (Thời vụ 1-31 / Chính thức 21-20), phụ cấp PCCC/Độc hại và phép năm.
          </p>
        </div>

        {hasPermission('MANAGE_EMPLOYEES') && (
          <button
            onClick={() => handleOpenAddEditModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white text-xs font-bold rounded-xl transition shadow-md shadow-orange-200"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Viên Mới</span>
          </button>
        )}
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã NV, Tên..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        {/* Dept Filter */}
        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          >
            <option value="ALL">Tất cả Phòng Ban ({rawEmployees.length})</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Contract Type Filter */}
        <div>
          <select
            value={selectedContract}
            onChange={(e) => setSelectedContract(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          >
            <option value="ALL">Tất cả Hợp đồng</option>
            <option value="OFFICIAL">Chính thức (Kỳ 21 - 20)</option>
            <option value="SEASONAL">Thời vụ (Kỳ 1 - 31)</option>
          </select>
        </div>

        {/* Shift Class Filter */}
        <div>
          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          >
            <option value="ALL">Tất cả Nhóm Ca</option>
            <option value="OFFICE_M_F">HC Văn Phòng (T2-T6 | 23 công)</option>
            <option value="OFFICE_M_S">HC Chung (T2-T7 | 27 công)</option>
            <option value="SHIFT_1">Ca 1 (06:00 - 14:00)</option>
            <option value="SHIFT_2">Ca 2 (14:00 - 22:00)</option>
          </select>
        </div>
      </div>

      {/* Employee List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Hiển thị <b>{filteredEmployees.length}</b> / {rawEmployees.length} nhân viên</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Mã NV</th>
                <th className="py-3 px-4">Họ và Tên</th>
                <th className="py-3 px-4">Phòng Ban & Chức Vụ</th>
                <th className="py-3 px-4 text-center">Nhóm Ca Làm Việc</th>
                <th className="py-3 px-4 text-center">Hợp Đồng & Kỳ Công</th>
                <th className="py-3 px-4 text-center">Phụ Cấp Gắn Riêng</th>
                <th className="py-3 px-4 text-center">Phép Năm Còn Lại</th>
                <th className="py-3 px-4 text-center">Trạng Thái</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((emp, idx) => {
                const isPCCC = emp.customAllowances?.pcccAllowance > 0;
                const isHazard = emp.customAllowances?.hazardousAllowance > 0;

                return (
                  <tr key={emp.employeeId} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 text-slate-400 font-medium">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                        {emp.employeeId}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{emp.fullName}</div>
                      {emp.erpId && <div className="text-[11px] text-slate-400">ERP: {emp.erpId}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{emp.department}</div>
                      <div className="text-[11px] text-slate-500">{emp.position}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {emp.shiftClassId === 'OFFICE_M_F' && (
                        <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">HC T2-T6 (23 công)</span>
                      )}
                      {emp.shiftClassId === 'OFFICE_M_S' && (
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">HC T2-T7 (27 công)</span>
                      )}
                      {emp.shiftClassId === 'SHIFT_1' && (
                        <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold">Ca 1 (06h - 14h)</span>
                      )}
                      {emp.shiftClassId === 'SHIFT_2' && (
                        <span className="px-2 py-1 rounded-full bg-pink-50 text-pink-700 font-bold">Ca 2 (14h - 22h)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {emp.contractType === 'OFFICIAL' ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                          Chính thức (21-20)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-semibold">
                          Thời vụ (1-31)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {isPCCC && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-200 flex items-center gap-1" title={`Trợ cấp PCCC: ${emp.customAllowances.pcccAllowance.toLocaleString()} VNĐ`}>
                            <Flame className="w-3 h-3 text-amber-600" />
                            PCCC
                          </span>
                        )}
                        {isHazard && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200 flex items-center gap-1" title={`Tiền độc hại: ${emp.customAllowances.hazardousAllowance.toLocaleString()} VNĐ`}>
                            <Biohazard className="w-3 h-3 text-rose-600" />
                            Độc hại
                          </span>
                        )}
                        {!isPCCC && !isHazard && (
                          <span className="text-slate-400 font-normal">Tiêu chuẩn</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-bold ${
                        (emp.annualLeaveBalance?.remainingDays ?? 12) <= 2
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {emp.annualLeaveBalance?.remainingDays ?? 12} / {emp.annualLeaveBalance?.initialQuota ?? 12} ngày
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {emp.status === 'ACTIVE' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Đang làm việc</span>
                      )}
                      {emp.status === 'RESIGNED' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Đã nghỉ việc</span>
                      )}
                      {emp.status === 'MATERNITY' && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold">Nghỉ thai sản</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenAddEditModal(emp)}
                          className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition"
                          title="Chỉnh sửa thông tin & phụ cấp"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {hasPermission('MANAGE_EMPLOYEES') && (
                          <button
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Xóa nhân viên"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100">
              {rawEmployees.some(e => e.employeeId === editingEmployee.employeeId) ? 'Chỉnh Sửa Nhân Viên & Phụ Cấp' : 'Thêm Nhân Viên Mới'}
            </h3>

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã Nhân Viên (LEPxxx) *</label>
                  <input
                    type="text"
                    value={editingEmployee.employeeId}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, employeeId: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã Chấm Công / ERP ID</label>
                  <input
                    type="text"
                    value={editingEmployee.erpId || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, erpId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ và Tên *</label>
                  <input
                    type="text"
                    value={editingEmployee.fullName}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, fullName: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phòng Ban (Department)</label>
                  <input
                    type="text"
                    value={editingEmployee.department}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chức Vụ (Position)</label>
                  <input
                    type="text"
                    value={editingEmployee.position}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, position: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày Bắt Đầu Làm Việc</label>
                  <input
                    type="text"
                    value={editingEmployee.startDate}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Shift Class & Contract Type */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nhóm Ca Quy Định</label>
                  <select
                    value={editingEmployee.shiftClassId}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, shiftClassId: e.target.value as ShiftClassType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="OFFICE_M_F">Hành chính VP (Thứ 2 - Thứ 6 | 23 công chuẩn)</option>
                    <option value="OFFICE_M_S">Hành chính chung (Thứ 2 - Thứ 7 | 27 công chuẩn)</option>
                    <option value="SHIFT_1">Ca 1 (06:00 - 14:00 xoay ca)</option>
                    <option value="SHIFT_2">Ca 2 (14:00 - 22:00 xoay ca)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hợp Đồng & Chu Kỳ Công</label>
                  <select
                    value={editingEmployee.contractType}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, contractType: e.target.value as ContractType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="OFFICIAL">Chính thức (Chu kỳ 21 tháng trước - 20 tháng này)</option>
                    <option value="SEASONAL">Thời vụ (Chu kỳ 1 - 31 hàng tháng)</option>
                  </select>
                </div>
              </div>

              {/* Custom Allowances Section */}
              <div className="p-4 bg-orange-50/40 rounded-xl border border-orange-200/60 space-y-3">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 text-orange-950">
                  <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                  <span>Phân Bổ Phụ Cấp Linh Hoạt Từng Cá Nhân (Custom Allowances)</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Trợ cấp PCCC (VNĐ)</label>
                    <input
                      type="number"
                      value={editingEmployee.customAllowances?.pcccAllowance || 0}
                      onChange={(e) => setEditingEmployee({
                        ...editingEmployee,
                        customAllowances: {
                          ...editingEmployee.customAllowances,
                          pcccAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tiền Độc Hại (VNĐ)</label>
                    <input
                      type="number"
                      value={editingEmployee.customAllowances?.hazardousAllowance || 0}
                      onChange={(e) => setEditingEmployee({
                        ...editingEmployee,
                        customAllowances: {
                          ...editingEmployee.customAllowances,
                          hazardousAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tiền Chuyên Cần (VNĐ)</label>
                    <input
                      type="number"
                      value={editingEmployee.customAllowances?.diligenceBonus || 500000}
                      onChange={(e) => setEditingEmployee({
                        ...editingEmployee,
                        customAllowances: {
                          ...editingEmployee.customAllowances,
                          diligenceBonus: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Annual Leave Quota */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạn Mức Phép Năm Ban Đầu (Ngày)</label>
                  <input
                    type="number"
                    value={editingEmployee.annualLeaveBalance?.initialQuota || 12}
                    onChange={(e) => {
                      const init = parseFloat(e.target.value) || 0;
                      const used = editingEmployee.annualLeaveBalance?.usedDays || 0;
                      setEditingEmployee({
                        ...editingEmployee,
                        annualLeaveBalance: {
                          initialQuota: init,
                          usedDays: used,
                          remainingDays: Math.max(0, init - used)
                        }
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số Phép Năm Còn Lại (Ngày)</label>
                  <input
                    type="number"
                    value={editingEmployee.annualLeaveBalance?.remainingDays || 12}
                    onChange={(e) => setEditingEmployee({
                      ...editingEmployee,
                      annualLeaveBalance: {
                        ...editingEmployee.annualLeaveBalance,
                        remainingDays: parseFloat(e.target.value) || 0
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold rounded-xl shadow-md transition"
                >
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
