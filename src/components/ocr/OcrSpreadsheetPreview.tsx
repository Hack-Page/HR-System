/**
 * OcrSpreadsheetPreview - Bảng tính kiểu Excel tái tạo đúng bố cục ảnh scan.
 *
 * - Hàng đánh số, cột đánh địa chỉ chữ (A, B, C...) như bảng tính văn phòng
 * - Mỗi ô là một input có thể sửa trực tiếp (nội dung nhận dạng thật từ ONNX)
 * - Ô có độ tin cậy thấp (<0.75) được tô vàng cảnh báo người dùng rà soát
 */
import React from 'react';

export interface SpreadsheetCell {
  text: string;
  confidence: number;
}

export interface SpreadsheetRow {
  yCenter: number;
  cells: SpreadsheetCell[];
}

interface OcrSpreadsheetPreviewProps {
  rows: SpreadsheetRow[];
  activeRowIdx?: number | null;
  onSelectRow?: (idx: number) => void;
  onChangeCell?: (rowIdx: number, cellIdx: number, text: string) => void;
}

function colLabel(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export const OcrSpreadsheetPreview: React.FC<OcrSpreadsheetPreviewProps> = ({
  rows,
  activeRowIdx,
  onSelectRow,
  onChangeCell,
}) => {
  const columnCount = Math.max(1, ...rows.map(r => r.cells.length));

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
        Chưa có dữ liệu lưới - hãy quét một ảnh phiếu tăng ca
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[340px] border border-slate-200 rounded-xl">
      <table className="border-collapse text-xs bg-white" style={{ minWidth: '100%' }}>
        <thead>
          <tr className="bg-slate-100 sticky top-0 z-10">
            <th className="w-9 px-1 py-1 border-r border-b border-slate-300 text-[10px] font-bold text-slate-400">#</th>
            {Array.from({ length: columnCount }, (_, ci) => (
              <th key={ci} className="min-w-[72px] px-2 py-1 border-r border-b border-slate-300 text-[10px] font-bold text-slate-500 text-center">
                {colLabel(ci)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              onClick={() => onSelectRow?.(ri)}
              className={`${activeRowIdx === ri ? 'bg-orange-50/60' : 'hover:bg-slate-50'} transition`}
            >
              <td className="px-1 py-0.5 border-r border-b border-slate-200 text-center text-[10px] font-bold text-slate-400 bg-slate-50 sticky left-0">
                {ri + 1}
              </td>
              {Array.from({ length: Math.max(row.cells.length, columnCount) }, (_, ci) => {
                const cell = row.cells[ci];
                if (!cell) {
                  return <td key={ci} className="border-r border-b border-slate-200 min-h-[24px]">&nbsp;</td>;
                }
                const lowConf = cell.confidence > 0 && cell.confidence < 0.75;
                return (
                  <td key={ci} className="border-r border-b border-slate-200 p-0">
                    <input
                      type="text"
                      value={cell.text}
                      aria-label={`Ô ${colLabel(ci)}${ri + 1}`}
                      onChange={(e) => onChangeCell?.(ri, ci, e.target.value)}
                      title={`Độ tin cậy nhận dạng: ${(cell.confidence * 100).toFixed(0)}%`}
                      className={`w-full px-2 py-1 text-[11px] bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/60 ${
                        lowConf ? 'bg-amber-50/80 text-amber-900 font-semibold' : 'text-slate-700'
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
