import * as XLSX from 'xlsx';

export interface ParseProgressMessage {
  type: 'PROGRESS';
  progress: number; // 0..100
  message: string;
}

export interface ParseCompleteMessage {
  type: 'COMPLETE';
  rawLogsCount: number;
  timesheetCellsCount: number;
  overtimeRecordsCount: number;
  rawLogs: any[];
  timesheets: any[];
  overtimes: any[];
}

export interface ParseErrorMessage {
  type: 'ERROR';
  error: string;
}

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer; month: number; year: number }>) => {
  try {
    const { buffer, month = 8, year = 2026 } = e.data;
    
    self.postMessage({
      type: 'PROGRESS',
      progress: 5,
      message: 'Đang đọc tệp Excel chấm công...'
    } as ParseProgressMessage);

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    
    // Check sheet name
    const sheetName = workbook.SheetNames.includes('XuatLuoi') ? 'XuatLuoi' : workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    self.postMessage({
      type: 'PROGRESS',
      progress: 20,
      message: `Đang phân tích cấu trúc sheet ${sheetName}...`
    } as ParseProgressMessage);

    // Convert sheet to json rows
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (rows.length < 4) {
      throw new Error('Định dạng tệp Excel không hợp lệ hoặc dữ liệu quá ngắn.');
    }

    // Row 3 (index 2) contains headers:
    // ['STT', 'Mã Nhân Viên', 'Tên nhân viên', 'Phòng ban', 'Ngày', 'Thứ', 'Giờ vào', 'Giờ ra', 'Trễ', 'Sớm', 'Công', 'Tổng giờ', 'Tăng ca', 'Tổng toàn bộ', 'Ca']
    const dataRows = rows.slice(3); // Start from row 4
    const totalRows = dataRows.length;

    self.postMessage({
      type: 'PROGRESS',
      progress: 30,
      message: `Tìm thấy ${totalRows.toLocaleString()} dòng quẹt thẻ. Đang chuẩn hóa dữ liệu...`
    } as ParseProgressMessage);

    const rawLogs: any[] = [];
    const timesheetMap = new Map<string, any>();
    const overtimeMap = new Map<string, any>();

    const chunkSize = 2000;
    for (let i = 0; i < totalRows; i++) {
      const row = dataRows[i];
      if (!row || !row[1]) continue; // Require Mã Nhân Viên

      const empId = String(row[1]).trim();
      const rawDate = row[4];
      
      // Parse date to YYYY-MM-DD
      let dateStr = '';
      if (rawDate instanceof Date) {
        const y = rawDate.getFullYear();
        const m = String(rawDate.getMonth() + 1).padStart(2, '0');
        const d = String(rawDate.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
      } else if (typeof rawDate === 'string' && rawDate.trim() !== '') {
        const parts = rawDate.split(/[\/\-\.]/);
        if (parts.length === 3) {
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      if (!dateStr) continue;

      const checkIn = String(row[6] || '').trim();
      const checkOut = String(row[7] || '').trim();
      const lateMins = parseFloat(row[8]) || 0;
      const earlyMins = parseFloat(row[9]) || 0;
      const workUnits = parseFloat(row[10]) || 0;
      const totalHours = parseFloat(row[11]) || 0;
      const otHours = parseFloat(row[12]) || 0;
      const dayOfWeek = String(row[5] || '').trim();
      const shift = String(row[14] || '').trim();

      const logItem = {
        employeeId: empId,
        fullName: String(row[2] || '').trim(),
        departmentCode: String(row[3] || '').trim(),
        date: dateStr,
        dayOfWeek,
        checkIn,
        checkOut,
        lateMinutes: lateMins,
        earlyMinutes: earlyMins,
        workUnits,
        totalHours,
        overtimeHours: otHours,
        shiftName: shift
      };
      rawLogs.push(logItem);

      // Determine timesheet status - cập nhật hỗ trợ LA/ED/MCO/MCI chuẩn theo yêu cầu
      let statusCode = '';
      const isSunday = dayOfWeek === 'CN' || dayOfWeek.toLowerCase().includes('sun') || dayOfWeek === 'Chủ nhật';
      const isSaturday = dayOfWeek === 'Bảy' || dayOfWeek.toLowerCase().includes('sat') || dayOfWeek === 'Thứ 7';

      if (!checkIn && !checkOut) {
        if (!isSunday) {
          // Ngày thường không quẹt (kể cả Thứ 7) -> Off, sẽ được post-process thành PH nếu cả công ty nghỉ
          statusCode = 'Off';
        } else {
          statusCode = ''; // CN nghỉ tuần
        }
      } else if (!checkIn && checkOut) {
        statusCode = 'MCI'; // Không chấm vào - Missing clock-in
      } else if (checkIn && !checkOut) {
        statusCode = 'MCO'; // Không chấm ra - Missing clock-out
      } else {
        // Cả vào và ra đều có: kiểm tra ca đêm trước
        if (shift.includes('N') || shift.toLowerCase().includes('đêm') || (checkIn >= '18:00' || checkIn < '06:00')) {
          statusCode = 'N'; // Ca đêm
        } else {
          // Giữ W mặc định; LA/ED sẽ được Header.tsx tinh chỉnh theo ca đã sắp (SHIFT_1 06:00, SHIFT_2 14:00, HC 07:30)
          // Nếu file đã có lateMins/earlyMins <30p thì vẫn ưu tiên đánh LA/ED ngay tại worker để preview nhanh
          if (lateMins > 0 && lateMins < 30) {
            statusCode = 'LA';
          } else if (earlyMins > 0 && earlyMins < 30) {
            statusCode = 'ED';
          } else if (lateMins >= 30) {
            statusCode = 'LA'; // >=30 vẫn LA nhưng sẽ gắn cờ chờ duyệt phép ở post-process
          } else if (earlyMins >= 30) {
            statusCode = 'ED';
          } else {
            statusCode = 'W'; // Đi làm đủ
          }
        }
      }

      // Ghi chú chi tiết theo mã mới
      let violationNote: string | undefined;
      if (statusCode === 'MCI') violationNote = `Không chấm công vào (Missing clock-in) - ra lúc ${checkOut}`;
      else if (statusCode === 'MCO') violationNote = `Không chấm công ra (Missing clock-out) - vào lúc ${checkIn}`;
      else if (statusCode === 'LA') violationNote = lateMins > 0 ? `Đi trễ ${lateMins} phút (Late arrival)${lateMins >= 30 ? ' - trên 30 phút → chờ duyệt phép' : ''}` : 'Đi trễ (Late arrival)';
      else if (statusCode === 'ED') violationNote = earlyMins > 0 ? `Về sớm ${earlyMins} phút (Early departure)${earlyMins >= 30 ? ' - trên 30 phút → chờ duyệt phép' : ''}` : 'Về sớm (Early departure)';
      else if (lateMins > 0) violationNote = `Đi trễ ${lateMins} phút`;
      else if (earlyMins > 0) violationNote = `Về sớm ${earlyMins} phút`;

      const isViolation = statusCode === 'LA' || statusCode === 'ED' || statusCode === 'MCO' || statusCode === 'MCI' || lateMins > 0 || earlyMins > 0;

      const key = `${empId}_${dateStr}`;
      timesheetMap.set(key, {
        employeeId_date: key,
        employeeId: empId,
        date: dateStr,
        dayIndex: parseInt(dateStr.split('-')[2], 10),
        statusCode,
        checkIn,
        checkOut,
        lateMinutes: lateMins,
        earlyMinutes: earlyMins,
        isViolation,
        violationNote,
        calculatedOvertime: otHours,
        month,
        year
      });

      // Calculate Overtime
      // Sunday OT or weekday OT
      if (otHours > 0 || (isSunday && totalHours > 0)) {
        const finalOT = otHours > 0 ? otHours : totalHours;
        overtimeMap.set(key, {
          employeeId_date: key,
          employeeId: empId,
          date: dateStr,
          dayOfWeek,
          hours: finalOT,
          dayType: isSunday ? 'SUNDAY' : 'WEEKDAY',
          verificationStatus: 'PENDING',
          month,
          year
        });
      }

      // Report progress periodically
      if (i % chunkSize === 0 || i === totalRows - 1) {
        const pct = Math.round(30 + (i / totalRows) * 65);
        self.postMessage({
          type: 'PROGRESS',
          progress: pct,
          message: `Đã xử lý ${i.toLocaleString()} / ${totalRows.toLocaleString()} dòng...`
        } as ParseProgressMessage);
      }
    }

    self.postMessage({
      type: 'COMPLETE',
      rawLogsCount: rawLogs.length,
      timesheetCellsCount: timesheetMap.size,
      overtimeRecordsCount: overtimeMap.size,
      rawLogs,
      timesheets: Array.from(timesheetMap.values()),
      overtimes: Array.from(overtimeMap.values())
    } as ParseCompleteMessage);

  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err.message || 'Lỗi không xác định khi xử lý tệp Excel.'
    } as ParseErrorMessage);
  }
};
