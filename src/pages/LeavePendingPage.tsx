import React, { useState } from 'react';
import { 
  CalendarCheck, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  FileText,
  ShieldAlert,
  ArrowRight,
  Filter
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ILeaveRequest, LeaveType, AttendanceStatusCode } from '../types';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';

export const LeavePendingPage: React.FC = () => {
  const { success, warning, error } = useToast();
  const { alertModal, confirm } = useModal();
  const { departmentScope, hasPermission } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedLeaveType, setSelectedLeaveType] = useState<Record<string, LeaveType>>({});

  // Live queries
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const pendingRequests = useLiveQuery(() => db.leaveRequests.toArray(), []) || [];
  const timesheets = useLiveQuery(() => db.dailyTimesheets.toArray(), []) || [];

  // Filter pending requests
  const filteredRequests = pendingRequests.filter(req => {
    if (departmentScope && req.department !== departmentScope) return false;
    if (selectedDept !== 'ALL' && req.department !== selectedDept) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const m1 = req.employeeId.toLowerCase().includes(q);
      const m2 = req.fullName.toLowerCase().includes(q);
      if (!m1 && !m2) return false;
    }
    return true;
  });

  const departments = Array.from(new Set(employees.map(e => e.department))).filter(Boolean);

  // Handle approving leave compensation
  const handleApproveLeave = async (req: ILeaveRequest, chosenType: LeaveType) => {
    const emp = employees.find(e => e.employeeId === req.employeeId);
    if (!emp) {
      error('Không tìm thấy nhân viên', `Mã NV: ${req.employeeId}`);
      return;
    }

    // ANNUAL LEAVE QUOTA ENFORCEMENT
    if (chosenType === 'AL') {
      const remainingQuota = emp.annualLeaveBalance?.remainingDays ?? 0;
      if (remainingQuota < req.durationDays) {
        await alertModal(
          'Từ Chối Phê Duyệt Phép Năm (Hết Hạn Mức)',
          (
            <div className="space-y-2">
              <p className="text-slate-800 font-semibold">
                Nhân viên <span className="text-orange-600 font-bold">[{emp.employeeId}] {emp.fullName}</span> hiện chỉ còn <span className="text-rose-600 font-bold">{remainingQuota}</span> ngày phép năm trong hồ sơ.
              </p>
              <p className="text-slate-600 text-xs">
                Yêu cầu bù phép {req.durationDays} ngày phép năm đã bị từ chối do vượt quá hạn mức. Vui lòng chọn loại nghỉ <b>Không Lương (UL)</b> hoặc điều chỉnh hạn mức phép trong Menu Danh Mục Nhân Viên.
              </p>
            </div>
          ),
          'danger'
        );
        return;
      }

      // Deduct annual leave balance
      await db.employees.update(emp.employeeId, {
        annualLeaveBalance: {
          ...emp.annualLeaveBalance,
          usedDays: (emp.annualLeaveBalance?.usedDays ?? 0) + req.durationDays,
          remainingDays: remainingQuota - req.durationDays
        }
      });
    }

    // Map LeaveType to AttendanceStatusCode
    let newStatusCode: AttendanceStatusCode = 'UL';
    if (chosenType === 'AL') newStatusCode = req.durationDays === 0.5 ? 'W/2 AL/2' : 'AL';
    else if (chosenType === 'SL') newStatusCode = 'SL';
    else if (chosenType === 'PL') newStatusCode = 'PL';
    else if (chosenType === 'BT') newStatusCode = 'BT';
    else if (chosenType === 'MATERNITY') newStatusCode = 'MATERNITY LEAVE';
    else if (chosenType === 'UL') newStatusCode = req.durationDays === 0.5 ? 'W/2 UL/2' : 'UL';

    // Update Timesheet cell
    const cellKey = `${req.employeeId}_${req.date}`;
    await db.dailyTimesheets.put({
      employeeId_date: cellKey,
      employeeId: req.employeeId,
      date: req.date,
      dayIndex: parseInt(req.date.split('-')[2], 10),
      statusCode: newStatusCode,
      calculatedOvertime: 0,
      month: 8,
      year: 2026
    });

    // Update Leave Request status
    await db.leaveRequests.update(req.id, {
      status: 'APPROVED',
      leaveType: chosenType,
      processedBy: 'HR Admin',
      processedAt: new Date().toISOString()
    });

    success(
      'Phê duyệt bù phép thành công!',
      `Đã chuyển trạng thái ngày ${req.date} của ${emp.fullName} sang mã "${newStatusCode}".`
    );
  };

  // Reject / mark unauthorized
  const handleRejectLeave = async (req: ILeaveRequest) => {
    const ok = await confirm({
      title: 'Xác nhận ghi nhận Không Phép',
      message: `Bạn có chắc chắn muốn ghi nhận vi phạm nghỉ không phép cho nhân viên [${req.employeeId}] ${req.fullName} vào ngày ${req.date}?`,
      type: 'warning',
      confirmText: 'Xác nhận vi phạm',
      cancelText: 'Hủy'
    });

    if (ok) {
      await db.leaveRequests.update(req.id, {
        status: 'REJECTED',
        rejectionReason: 'Vắng mặt không phép vi phạm nội quy'
      });
      success('Đã cập nhật trạng thái', 'Bản ghi đã được xử lý.');
    }
  };

  return (
    <div className="p-6 w-full space-y-6 flex-1 flex flex-col">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-orange-500" />
            <span>Danh Sách Chờ Bù Phép & Ràng Buộc Hạn Mức (Pending Leave)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Thu gom tự động các trường hợp nhân viên không chấm công vào/ra trong ngày làm việc quy định (đánh dấu "Off" ở bảng công). Kiểm tra số dư phép năm thực tế trước khi phê duyệt.
          </p>
        </div>

        <div className="px-3.5 py-2 rounded-xl bg-orange-50 text-orange-800 border border-orange-200 text-xs font-bold flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-600" />
          <span>{filteredRequests.filter(r => r.status === 'PENDING').length} trường hợp cần xử lý</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Mã NV & Họ Tên</th>
                <th className="py-3 px-4">Bộ Phận</th>
                <th className="py-3 px-4 text-center">Ngày Vắng Mặt</th>
                <th className="py-3 px-4 text-center">Số Dư Phép Năm</th>
                <th className="py-3 px-4 text-center">Loại Nghỉ Bù Đề Xuất</th>
                <th className="py-3 px-4 text-center">Trạng Thái</th>
                <th className="py-3 px-4 text-right">Phê Duyệt & Chốt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req, idx) => {
                const emp = employees.find(e => e.employeeId === req.employeeId);
                const remainingAL = emp?.annualLeaveBalance?.remainingDays ?? 0;
                const chosenType = selectedLeaveType[req.id] || req.leaveType || 'AL';

                return (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 text-slate-400 font-semibold">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{req.fullName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{req.employeeId}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">{req.department}</td>
                    <td className="py-3 px-4 text-center font-bold text-rose-600">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200">
                        {req.date} (1 ngày)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        remainingAL <= 0
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {remainingAL} ngày còn lại
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {req.status === 'PENDING' ? (
                        <select
                          value={chosenType}
                          onChange={(e) => setSelectedLeaveType({ ...selectedLeaveType, [req.id]: e.target.value as LeaveType })}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="AL">Phép năm (AL) - Trừ số dư</option>
                          <option value="UL">Nghỉ không lương (UL)</option>
                          <option value="SL">Nghỉ ốm / bệnh (SL)</option>
                          <option value="PL">Nghỉ chế độ: tang/cưới (PL)</option>
                          <option value="BT">Công tác ngoài (BT)</option>
                          <option value="MATERNITY">Nghỉ thai sản</option>
                        </select>
                      ) : (
                        <span className="font-bold text-slate-700">{req.leaveType}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {req.status === 'PENDING' && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px] inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Chờ duyệt
                        </span>
                      )}
                      {req.status === 'APPROVED' && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Đã duyệt
                        </span>
                      )}
                      {req.status === 'REJECTED' && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Từ chối
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApproveLeave(req, chosenType)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm shadow-emerald-200"
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => handleRejectLeave(req)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition"
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                    <p className="font-semibold text-slate-600">Không có trường hợp vắng mặt nào đang chờ bù phép.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
