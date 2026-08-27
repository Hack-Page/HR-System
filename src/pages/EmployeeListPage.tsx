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
  SlidersHorizontal,
  UserMinus
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { IEmployee, ShiftClassType, ContractType } from '../types';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import { daysUntil } from '../services/pay-period';

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
  const [showAddDept, setShowAddDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [showAddPos, setShowAddPos] = useState(false);
  const [newPosName, setNewPosName] = useState('');

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

  const handleResignEmployee = async (emp: IEmployee) => {
    const ok = await confirm({
      title: 'Xác nhận cho nghỉ việc',
      message: `Bạn có chắc chắn muốn cho nhân viên [${emp.employeeId}] ${emp.fullName} nghỉ việc? Thao tác sẽ cập nhật trạng thái RESIGNED và tính vào tỷ lệ nghỉ việc (KPI). Nhân viên sẽ được chuyển sang trạng thái đã nghỉ việc và ẩn khỏi danh sách hoạt động.`,
      confirmText: 'Xác nhận nghỉ việc',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });

    if (ok) {
      const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
      await db.employees.update(emp.employeeId, {
        status: 'RESIGNED',
        resignedDate: today
      } as any);
      success('Đã cho nghỉ việc', `Nhân viên ${emp.employeeId} - ${emp.fullName} đã được chuyển sang trạng thái nghỉ việc (RESIGNED) ngày ${today}. KPI tỷ lệ nghỉ việc sẽ tự động cập nhật theo kỳ công 21-20 / 01-31.`);
    }
  };

  // Giữ hàm xóa cứng cho AD System nếu cần, nhưng nút chính là nghỉ việc
  const handleDeleteEmployee = async (emp: IEmployee) => {
    const ok = await confirm({
      title: 'Xác nhận xóa vĩnh viễn',
      message: `Bạn có chắc chắn muốn XÓA VĨNH VIỄN nhân viên [${emp.employeeId}] ${emp.fullName}? Hành động không thể hoàn tác.`,
      confirmText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });
    if (ok) {
      await db.employees.delete(emp.employeeId);
      success('Đã xóa nhân viên', `Nhân viên ${emp.employeeId} đã được xóa vĩnh viễn.`);
    }
  };

  return (
    <div className="p-6 w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <span>Danh Mục Toàn Bộ Nhân Viên</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý quan hệ ca làm việc (Hành chính T2-T6 / T2-T7, Ca 1, Ca 2), chu kỳ tính công (Thời vụ 01-31 / Chính thức 21-20), phụ cấp PCCC/Độc hại, thử việc và phép năm.
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
                <th className="py-3 px-4 text-center">Thời gian hợp đồng</th>
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
                      {emp.contractTerm && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          {emp.contractTerm === '1_MONTH' ? 'HĐ 1 tháng' : emp.contractTerm === '2_MONTHS' ? 'HĐ 2 tháng' : emp.contractTerm === '1_YEAR' ? 'HĐ 1 năm' : emp.contractTerm === '3_YEARS' ? 'HĐ 3 năm' : 'HĐ vĩnh viễn'}
                          {emp.contractEndDate ? ` • ${emp.contractEndDate}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        const now = new Date();
                        const probDays = emp.probationEndDate ? daysUntil(emp.probationEndDate, now) : null;
                        const isProbation = probDays !== null && probDays >= 0;
                        if (isProbation && emp.probationMonths) {
                          return (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                Thử việc {emp.probationMonths} tháng
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">đến {emp.probationEndDate}</div>
                            </>
                          );
                        }
                        // Qua thử việc: hiển thị thời hạn hợp đồng sắp tới
                        if (emp.contractEndDate) {
                          const d = daysUntil(emp.contractEndDate, now);
                          const label = emp.contractTerm === '1_MONTH' ? 'HĐ 1 tháng' : emp.contractTerm === '2_MONTHS' ? 'HĐ 2 tháng' : emp.contractTerm === '1_YEAR' ? 'HĐ 1 năm' : emp.contractTerm === '3_YEARS' ? 'HĐ 3 năm' : emp.contractTerm === 'PERMANENT' ? 'Vĩnh viễn' : 'HĐ';
                          const isUrgent = d !== null && d >= 0 && d <= 15;
                          const isWarn = d !== null && d >= 0 && d <= 30;
                          return (
                            <>
                              <span className={`px-2 py-0.5 rounded-full border font-semibold ${isUrgent ? 'bg-rose-50 text-rose-700 border-rose-200' : isWarn ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                {label}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">{emp.contractEndDate} {d !== null && d >= 0 ? `• còn ${d} ngày` : d !== null && d < 0 ? '• đã hết hạn' : ''}</div>
                            </>
                          );
                        }
                        if (emp.contractTerm) {
                          const label = emp.contractTerm === '1_MONTH' ? 'HĐ 1 tháng' : emp.contractTerm === '2_MONTHS' ? 'HĐ 2 tháng' : emp.contractTerm === '1_YEAR' ? 'HĐ 1 năm' : emp.contractTerm === '3_YEARS' ? 'HĐ 3 năm' : 'Vĩnh viễn';
                          return <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border font-medium">{label}</span>;
                        }
                        return <span className="text-slate-400 text-[11px]">—</span>;
                      })()}
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
                        {hasPermission('MANAGE_EMPLOYEES') && emp.status !== 'RESIGNED' && (
                          <button
                            onClick={() => handleResignEmployee(emp)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Cho nghỉ việc (tính KPI tỷ lệ nghỉ việc)"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasPermission('MANAGE_EMPLOYEES') && (
                          <button
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Xóa vĩnh viễn (AD System)"
                          >
                            <Trash2 className="w-3 h-3" />
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
                  {showAddDept ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        placeholder="Tên phòng ban mới"
                        className="flex-1 px-3 py-2 bg-white border border-orange-300 rounded-xl focus:outline-none focus:border-orange-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newDeptName.trim();
                          if (trimmed) {
                            setEditingEmployee({ ...editingEmployee, department: trimmed });
                            setShowAddDept(false);
                            setNewDeptName('');
                            success('Đã thêm phòng ban', `"${trimmed}" sẽ xuất hiện trong danh sách và đồng bộ toàn hệ thống.`);
                          }
                        }}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddDept(false); setNewDeptName(''); }}
                        className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const deptOptions = Array.from(new Set([
                        ...(['Finance','EHS','Logistics','WH','Production','QC','Maintenance (PRO)','Purchasing','Admin','HR'] as const),
                        ...rawEmployees.map(e => e.department).filter(Boolean) as string[],
                        ...(editingEmployee.department && !(['Finance','EHS','Logistics','WH','Production','QC','Maintenance (PRO)','Purchasing','Admin','HR'].includes(editingEmployee.department) || rawEmployees.some(e => e.department === editingEmployee.department)) ? [] : editingEmployee.department ? [editingEmployee.department] : [])
                      ]));
                      const uniqueDepts = Array.from(new Set(deptOptions)).sort();
                      return (
                        <div className="flex gap-1">
                          <select
                            value={editingEmployee.department}
                            onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                          >
                            <option value="">-- Chọn phòng ban --</option>
                            {uniqueDepts.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowAddDept(true)}
                            className="px-2.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center shrink-0"
                            title="Thêm phòng ban mới"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chức Vụ (Position)</label>
                  {showAddPos ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newPosName}
                        onChange={(e) => setNewPosName(e.target.value)}
                        placeholder="Tên chức vụ mới"
                        className="flex-1 px-3 py-2 bg-white border border-orange-300 rounded-xl focus:outline-none focus:border-orange-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newPosName.trim();
                          if (trimmed) {
                            setEditingEmployee({ ...editingEmployee, position: trimmed });
                            setShowAddPos(false);
                            setNewPosName('');
                            success('Đã thêm chức vụ', `"${trimmed}" sẽ xuất hiện trong danh sách và đồng bộ toàn hệ thống.`);
                          }
                        }}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddPos(false); setNewPosName(''); }}
                        className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const posOptions = Array.from(new Set(rawEmployees.map(e => e.position).filter(Boolean) as string[])).sort();
                      const allPos = editingEmployee.position && !posOptions.includes(editingEmployee.position) ? [...posOptions, editingEmployee.position] : posOptions;
                      return (
                        <div className="flex gap-1">
                          <select
                            value={editingEmployee.position}
                            onChange={(e) => setEditingEmployee({ ...editingEmployee, position: e.target.value })}
                            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                          >
                            <option value="">-- Chọn chức vụ --</option>
                            {allPos.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowAddPos(true)}
                            className="px-2.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center shrink-0"
                            title="Thêm chức vụ mới"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })()
                  )}
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

              {/* Hợp đồng & Thử việc */}
              <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-200/60 space-y-3">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span>Hợp Đồng & Thời Gian Thử Việc</span>
                  <span className="ml-auto text-[10px] font-normal text-slate-500">Thử việc 1-2 tháng: không tính tăng ca & phép năm đến khi hết thử việc</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Thời hạn hợp đồng</label>
                    <select
                      value={editingEmployee.contractTerm || ''}
                      onChange={(e) => {
                        const term = e.target.value as any;
                        let endDate = editingEmployee.contractEndDate;
                        // Tự tính ngày kết thúc nếu có ngày bắt đầu
                        if (term && editingEmployee.contractStartDate) {
                          const s = editingEmployee.contractStartDate;
                          const parse = (str:string) => {
                            if (str.includes('/')) { const [d,m,y]=str.split('/').map(Number); return new Date(y,m-1,d); }
                            if (str.includes('-')) { const [y,m,d]=str.split('-').map(Number); return new Date(y,m-1,d); }
                            return null;
                          };
                          const sd = parse(s);
                          if (sd) {
                            const ed = new Date(sd);
                            if (term === '1_MONTH') ed.setMonth(ed.getMonth()+1);
                            else if (term === '2_MONTHS') ed.setMonth(ed.getMonth()+2);
                            else if (term === '1_YEAR') ed.setFullYear(ed.getFullYear()+1);
                            else if (term === '3_YEARS') ed.setFullYear(ed.getFullYear()+3);
                            else if (term === 'PERMANENT') endDate = '';
                            if (term !== 'PERMANENT') endDate = `${String(ed.getDate()).padStart(2,'0')}/${String(ed.getMonth()+1).padStart(2,'0')}/${ed.getFullYear()}`;
                          }
                        }
                        setEditingEmployee({ ...editingEmployee, contractTerm: term || undefined, contractEndDate: endDate });
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl"
                    >
                      <option value="">-- Chưa cấu hình --</option>
                      <option value="1_MONTH">1 tháng</option>
                      <option value="2_MONTHS">2 tháng</option>
                      <option value="1_YEAR">1 năm</option>
                      <option value="3_YEARS">3 năm</option>
                      <option value="PERMANENT">Vĩnh viễn</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Thời gian thử việc</label>
                    <select
                      value={editingEmployee.probationMonths || ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value) as 1|2 : undefined;
                        let probEnd = editingEmployee.probationEndDate;
                        if (v && editingEmployee.startDate) {
                          const s = editingEmployee.startDate;
                          const parse = (str:string) => {
                            if (str.includes('/')) { const [d,m,y]=str.split('/').map(Number); return new Date(y,m-1,d); }
                            if (str.includes('-')) { const [y,m,d]=str.split('-').map(Number); return new Date(y,m-1,d); }
                            return null;
                          };
                          const sd = parse(s);
                          if (sd) {
                            const ed = new Date(sd);
                            ed.setMonth(ed.getMonth()+v);
                            probEnd = `${String(ed.getDate()).padStart(2,'0')}/${String(ed.getMonth()+1).padStart(2,'0')}/${ed.getFullYear()}`;
                          }
                        } else if (!v) probEnd = undefined;
                        setEditingEmployee({ ...editingEmployee, probationMonths: v, probationEndDate: probEnd });
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl"
                    >
                      <option value="">Không thử việc</option>
                      <option value="1">1 tháng</option>
                      <option value="2">2 tháng</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ngày bắt đầu HĐ</label>
                    <input type="text" placeholder="DD/MM/YYYY" value={editingEmployee.contractStartDate || ''} onChange={e => setEditingEmployee({ ...editingEmployee, contractStartDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ngày kết thúc HĐ</label>
                    <input type="text" placeholder="DD/MM/YYYY" value={editingEmployee.contractEndDate || ''} onChange={e => setEditingEmployee({ ...editingEmployee, contractEndDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Kết thúc thử việc</label>
                    <input type="text" placeholder="DD/MM/YYYY" value={editingEmployee.probationEndDate || ''} onChange={e => setEditingEmployee({ ...editingEmployee, probationEndDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-amber-700 font-semibold" />
                  </div>
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
                    min={0}
                    value={editingEmployee.annualLeaveBalance?.initialQuota ?? 12}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const init = raw === '' ? 0 : parseFloat(raw) || 0;
                      const used = editingEmployee.annualLeaveBalance?.usedDays ?? 0;
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
                    min={0}
                    value={editingEmployee.annualLeaveBalance?.remainingDays ?? 12}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === '' ? 0 : parseFloat(raw);
                      const num = isNaN(val) ? 0 : val;
                      setEditingEmployee({
                        ...editingEmployee,
                        annualLeaveBalance: {
                          ...editingEmployee.annualLeaveBalance!,
                          remainingDays: num
                        }
                      });
                    }}
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
