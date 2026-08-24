import ExcelJS from 'exceljs';
import { IEmployee, IDailyTimesheetCell, IOvertimeRecord } from '../types';
import { computeEmployeeTimesheetSummary } from './formula-engine';

export async function exportTimesheetToExcel(
  employees: IEmployee[],
  timesheets: IDailyTimesheetCell[],
  overtimes: IOvertimeRecord[],
  month: number = 8,
  year: number = 2026
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmartHR Leggett & Platt';
  workbook.created = new Date();

  // 1. Sheet: Working time
  const ws = workbook.addWorksheet('Working time', {
    views: [{ state: 'frozen', xSplit: 8, ySplit: 7 }]
  });

  // Try to load logo and add image
  try {
    const response = await fetch('/Leggett.jpg');
    if (response.ok) {
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: 'jpeg',
      });
      ws.addImage(imageId, {
        tl: { col: 0.2, row: 0.2 },
        ext: { width: 180, height: 45 }
      });
    }
  } catch (e) {
    console.warn('Could not load logo image for Excel export:', e);
  }

  // Row 2: Title
  ws.mergeCells('F2:AM2');
  const titleCell = ws.getCell('F2');
  titleCell.value = `BẢNG CHẤM CÔNG THÁNG ${month < 10 ? '0' + month : month}/${year} - TIMESHEET`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF002D62' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Headers (Row 5, 6, 7)
  const daysHeaderEn = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  const daysHeaderVi = ['T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3', 'T4', 'T5'];

  const fixedCols = [
    { header: 'No./\nSTT', key: 'stt', width: 6 },
    { header: 'Employee ID /\nMã nhân viên', key: 'empId', width: 14 },
    { header: 'Mã chấm công /\nERP ID', key: 'erpId', width: 14 },
    { header: 'Name /\nTên nhân viên', key: 'name', width: 24 },
    { header: 'Dept/\nBộ phận', key: 'dept', width: 14 },
    { header: 'Position/\nChức vụ', key: 'pos', width: 22 },
    { header: 'Start Date\nNgày bắt đầu', key: 'start', width: 14 },
    { header: 'Khóa\nKey', key: 'key', width: 14 }
  ];

  // Set Row 5 fixed headers
  fixedCols.forEach((col, idx) => {
    ws.mergeCells(5, idx + 1, 7, idx + 1);
    const cell = ws.getCell(5, idx + 1);
    cell.value = col.header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(idx + 1).width = col.width;
  });

  // Calendar 31 days (Columns 9 to 39)
  for (let i = 1; i <= 31; i++) {
    const colIdx = 8 + i;
    const dateNum = i <= 11 ? 20 + i : i - 11;
    const monthNum = i <= 11 ? (month === 1 ? 12 : month - 1) : month;
    
    // Row 5: Date number
    const cell5 = ws.getCell(5, colIdx);
    cell5.value = `${dateNum}/${monthNum}`;
    cell5.font = { name: 'Arial', size: 9, bold: true };
    cell5.alignment = { horizontal: 'center', vertical: 'middle' };
    cell5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    // Row 6: Day EN
    const cell6 = ws.getCell(6, colIdx);
    cell6.value = daysHeaderEn[i - 1] || '';
    cell6.font = { name: 'Arial', size: 8 };
    cell6.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 7: Day VI
    const cell7 = ws.getCell(7, colIdx);
    cell7.value = daysHeaderVi[i - 1] || '';
    cell7.font = { name: 'Arial', size: 8, bold: true };
    cell7.alignment = { horizontal: 'center', vertical: 'middle' };

    if (daysHeaderVi[i - 1] === 'CN') {
      cell5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
      cell6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
      cell7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
    }
    ws.getColumn(colIdx).width = 5.5;
  }

  // Summary Formula Headers (Columns 40 to 58)
  const summaryHeaders = [
    'Total Standard WD\nCông chuẩn',
    'Total WD\nCông thực tế',
    'Total AL\nPhép năm',
    'Total UL\nKhông lương',
    'Total PH\nNghỉ lễ',
    'Total SL\nNghỉ ốm',
    'Total PL\nPhép chế độ',
    'Số ngày làm ban đêm\nNight Shifts',
    'Đi trễ về sớm\nLate/Early',
    'Thưởng năng suất\nProductivity Bonus',
    'Tiền chuyên cần\nDiligence Allowance',
    'Tiền độc hại\nHazardous Allowance',
    'Tiền trợ cấp PCCC\nFirefighting Allowance',
    'Các chi phí khác\nOther fees',
    'Trừ đoàn phí\nTrade Union fee',
    'Tháng\nMonth',
    'Năm\nYear',
    'Ghi chú\nRemarks',
    'Mã NV\nEmployee ID'
  ];

  summaryHeaders.forEach((hdr, idx) => {
    const colIdx = 40 + idx;
    ws.mergeCells(5, colIdx, 7, colIdx);
    const cell = ws.getCell(5, colIdx);
    cell.value = hdr;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002D62' } };
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(colIdx).width = 13;
  });

  // Populate Employee Rows
  let startRow = 8;
  const timesheetCellMap = new Map<string, IDailyTimesheetCell>();
  timesheets.forEach(c => timesheetCellMap.set(c.employeeId_date, c));

  employees.forEach((emp, empIdx) => {
    const r = startRow + empIdx;
    const empCells: IDailyTimesheetCell[] = [];

    // Fixed columns
    ws.getCell(r, 1).value = empIdx + 1;
    ws.getCell(r, 2).value = emp.employeeId;
    ws.getCell(r, 3).value = emp.erpId || '';
    ws.getCell(r, 4).value = emp.fullName;
    ws.getCell(r, 5).value = emp.department;
    ws.getCell(r, 6).value = emp.position;
    ws.getCell(r, 7).value = emp.startDate;
    ws.getCell(r, 8).value = `${emp.employeeId}_${month}`;

    // 31 Calendar cells
    for (let dayIdx = 1; dayIdx <= 31; dayIdx++) {
      const colIdx = 8 + dayIdx;
      const dateNum = dayIdx <= 11 ? 20 + dayIdx : dayIdx - 11;
      const monthNum = dayIdx <= 11 ? (month === 1 ? 12 : month - 1) : month;
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;
      
      const key = `${emp.employeeId}_${dateStr}`;
      const cellData = timesheetCellMap.get(key);
      const val = cellData?.statusCode || '';
      
      const cell = ws.getCell(r, colIdx);
      cell.value = val;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Styling based on code
      if (val === 'W') {
        cell.font = { color: { argb: 'FF065F46' }, bold: true };
      } else if (val === 'N') {
        cell.font = { color: { argb: 'FF3730A3' }, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      } else if (val === 'Off') {
        cell.font = { color: { argb: 'FF991B1B' }, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      }

      if (cellData) empCells.push(cellData);
    }

    // Formulas & summary columns
    const summary = computeEmployeeTimesheetSummary(emp, empCells);
    ws.getCell(r, 40).value = summary.standardWD;
    
    // Excel formulas
    ws.getCell(r, 41).value = { formula: `COUNTIF(I${r}:AM${r},"W")+COUNTIF(I${r}:AM${r},"W/2 AL/2")*0.5+COUNTIF(I${r}:AM${r},"BT")+COUNTIF(I${r}:AM${r},"N")+COUNTIF(I${r}:AM${r},"W/2 UL/2")*0.5`, result: summary.actualWD };
    ws.getCell(r, 42).value = { formula: `COUNTIF(I${r}:AM${r},"AL")+COUNTIF(I${r}:AM${r},"W/2 AL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`, result: summary.annualLeaveAL };
    ws.getCell(r, 43).value = { formula: `COUNTIF(I${r}:AM${r},"UL")+COUNTIF(I${r}:AM${r},"W/2 UL/2")*0.5+COUNTIF(I${r}:AM${r},"AL/2 UL/2")*0.5`, result: summary.unpaidLeaveUL };
    ws.getCell(r, 44).value = { formula: `COUNTIF(I${r}:AM${r},"PH")`, result: summary.publicHolidayPH };
    ws.getCell(r, 45).value = { formula: `COUNTIF(I${r}:AM${r},"SL")`, result: summary.sickLeaveSL };
    ws.getCell(r, 46).value = { formula: `COUNTIF(I${r}:AM${r},"PL")`, result: summary.specialPaidLeavePL };
    ws.getCell(r, 47).value = summary.nightShiftsCount;
    ws.getCell(r, 48).value = summary.lateEarlyMinutes > 0 ? summary.lateEarlyMinutes : '';
    ws.getCell(r, 49).value = summary.productivityBonus || '';
    ws.getCell(r, 50).value = summary.diligenceBonus;
    ws.getCell(r, 51).value = summary.hazardousAllowance || '';
    ws.getCell(r, 52).value = summary.pcccAllowance || '';
    ws.getCell(r, 53).value = summary.otherFees || '';
    ws.getCell(r, 54).value = summary.tradeUnionFee;
    ws.getCell(r, 55).value = month;
    ws.getCell(r, 56).value = year;
    ws.getCell(r, 57).value = emp.notes || '';
    ws.getCell(r, 58).value = emp.employeeId;

    // Apply borders
    for (let c = 1; c <= 58; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
  });

  // Generate buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `KIEM_TRA_CHOT_CONG_THANG_${String(month).padStart(2, '0')}.${year}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
