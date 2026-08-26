import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ScanLine,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  ArrowRight,
  Image as ImageIcon,
  Cpu,
  Layers,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Table2
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useToast } from '../context/ToastContext';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import { NavPageId } from '../components/layout/Sidebar';
import { OcrSpreadsheetPreview, SpreadsheetRow } from '../components/ocr/OcrSpreadsheetPreview';
import { IExtractedFormRow, reconcileRows, commitVerifiedRows } from '../services/ocr-form-parser';
import { runOcrPipeline } from '../services/ocr-worker-client';
import type { OCRWorkerResult } from '../types/ocr-worker-protocol';
import { testONNXModelRuntime, IONNXModelHealthReport } from '../services/onnx-model-checker';
import {
  normalizeDateString,
  parseOvertimeHours,
  mapGridToTableRows,
} from '../services/ocr-table-engine';

interface OCRVerificationPageProps {
  onNavigate: (page: NavPageId) => void;
}

let rowIdCounter = 0;
function nextRowId(): string {
  return `row_${Date.now()}_${rowIdCounter++}`;
}

/** Chuyển kết quả lưới OCR thật -> dòng dữ liệu có cấu trúc để đối soát */
function mappedToFormRows(grid: OCRWorkerResult['grid']): IExtractedFormRow[] {
  const mapped = mapGridToTableRows(grid);
  return mapped.map((m, i) => {
    const dateNorm = m.rawDate ? normalizeDateString(m.rawDate) : { normalizedDate: '', valid: false };
    const hoursParsed = parseOvertimeHours(m.hoursText ?? '', m.fromTime, m.toTime);
    return {
      rowId: nextRowId(),
      stt: m.stt ?? i + 1,
      fullName: m.fullName ?? '',
      employeeId: m.employeeCode ?? '',
      department: m.department ?? '',
      otDateRaw: m.rawDate ?? '',
      otDate: dateNorm.normalizedDate,
      fromTime: m.fromTime ?? '',
      toTime: m.toTime ?? '',
      otHours: hoursParsed.hours,
      reason: m.reason ?? '',
      confidence: m.confidence,
    };
  });
}

export const OCRVerificationPage: React.FC<OCRVerificationPageProps> = ({ onNavigate }) => {
  const { success, error, warning, info } = useToast();
  const { alertModal, confirm } = useModal();
  const { hasPermission, currentRole } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [streamingLogs, setStreamingLogs] = useState<string[]>([]);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [scanDetails, setScanDetails] = useState<string>('');

  // Ảnh & lưới quét được
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const previewUrlRef = useRef<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>('Chưa có ảnh nào được quét');
  const [gridRows, setGridRows] = useState<SpreadsheetRow[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState<number | null>(null);
  const [lastFileName, setLastFileName] = useState('');

  // Dòng dữ liệu có cấu trúc (đối soát)
  const [formRows, setFormRows] = useState<IExtractedFormRow[]>([]);

  const canCommit = hasPermission('SCAN_OCR');

  // Live queries
  const employees = useLiveQuery(() => db.employees.toArray(), []) || [];
  const overtimeRecords = useLiveQuery(() => db.overtimeRecords.toArray(), []) || [];

  // Dọn dẹp blob URL khi rời trang
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // Đối soát thuần tính - chỉ tính lại khi dữ liệu liên quan đổi (không recompute mỗi keystroke)
  const reconciledRows = useMemo(
    () => reconcileRows(formRows, employees, overtimeRecords),
    [formRows, employees, overtimeRecords]
  );

  const matchedCount = reconciledRows.filter(r => r.matchStatus === 'MATCHED').length;
  const mismatchCount = reconciledRows.filter(r => r.matchStatus === 'MISMATCH').length;
  const notFoundCount = reconciledRows.filter(r => !r.matchStatus || r.matchStatus === 'NOT_FOUND').length;

  /** Áp dụng kết quả quét THẬT từ worker vào trạng thái */
  const applyScanResult = useCallback((result: OCRWorkerResult, imageUrl: string, title: string) => {
    setGridRows(result.grid.rows.map(r => ({
      yCenter: r.yCenter,
      cells: r.cells.map(c => ({ text: c.text, confidence: c.confidence })),
    })));
    setFormRows(mappedToFormRows(result.grid));
    setScanDetails(result.details);
    setFormTitle(title);
    info(
      'Nhận dạng hoàn tất',
      `${result.lines.length} vùng chữ · ${result.processingTimeMs}ms. Kiểm tra bảng tính bên phải trước khi ghi nhận.`
    );
    void imageUrl; // ảnh đã set ở nơi gọi
  }, [info]);

  /** Chạy pipeline OCR thật trên bytes của một ảnh */
  const scanImageBytes = useCallback(async (bytes: ArrayBuffer, fileName: string, objectUrl: string) => {
    setIsScanning(true);
    setScanProgress(3);
    setStreamingLogs([`[${new Date().toLocaleTimeString()}] Bắt đầu pipeline OCR thật (det → cls → rec)...`]);
    try {
      const result = await runOcrPipeline(bytes, {
        fileName,
        onProgress: (progress, step, message) => {
          setScanProgress(progress);
          setStreamingLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [${step}] ${message}`]);
        }
      });
      setScanProgress(100);
      setLastFileName(fileName);
      applyScanResult(
        result,
        objectUrl,
        `KẾT QUẢ QUÉT THẬT: ${fileName} (${result.lines.length} vùng chữ, ${result.processingTimeMs}ms)`
      );
      success('Quét xong', 'Dữ liệu dưới đây đến từ model ONNX chạy thật trên trình duyệt.');
    } catch (err: any) {
      error('OCR thất bại', err.message);
    } finally {
      setIsScanning(false);
    }
  }, [applyScanResult, error, success]);

  /** Thay thế ảnh preview + thu hồi blob cũ (tránh leak bộ nhớ) */
  const replacePreviewImage = useCallback((file: File | Blob, name: string): string => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewImageUrl(url);
    return url || name;
  }, []);

  // 1. Upload ảnh phiếu tăng ca -> quét thật
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Tệp không hợp lệ', 'Vui lòng chọn hình ảnh phiếu/bản thỏa thuận tăng ca (JPG/PNG).');
      return;
    }

    try {
      const url = replacePreviewImage(file, file.name);
      const bytes = await file.arrayBuffer();
      await scanImageBytes(bytes, file.name, url);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 2. Ảnh mẫu image.png - vẫn chạy pipeline THẬT trên ảnh đó (không nạp data cứng)
  const handleSampleImage = async () => {
    try {
      setIsScanning(true);
      setScanProgress(3);
      setStreamingLogs([`[${new Date().toLocaleTimeString()}] Tải ảnh mẫu image.png và đưa vào pipeline thật...`]);
      const res = await fetch('/image.png');
      if (!res.ok) throw new Error(`Không tải được /image.png (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = replacePreviewImage(blob, 'image.png');
      const bytes = await blob.arrayBuffer();
      await scanImageBytes(bytes, 'image.png (ảnh mẫu)', url);
    } catch (err: any) {
      setIsScanning(false);
      error('Lỗi tải ảnh mẫu', err.message);
    }
  };

  // 3. Sửa ô trong bảng tính kiểu Excel
  const handleChangeCell = (rowIdx: number, cellIdx: number, text: string) => {
    setGridRows(prev => prev.map((r, i) =>
      i === rowIdx
        ? { ...r, cells: r.cells.map((c, j) => j === cellIdx ? { ...c, text } : c) }
        : r
    ));
  };

  // 4. Nạp lại dữ liệu cấu trúc từ bảng quét (sau khi người dùng sửa ô)
  const handleRemapFromGrid = () => {
    // Bảng tính chỉ chỉnh text nên dùng tọa độ ảo theo chỉ số cột để giữ căn cột
    const VIRT_COL_W = 10000;
    const grid = {
      imageWidth: 0,
      imageHeight: 0,
      rows: gridRows.map(r => ({
        yCenter: r.yCenter,
        height: 20,
        cells: r.cells.map((c, ci) => ({
          text: c.text,
          confidence: c.confidence,
          x0: ci * VIRT_COL_W,
          x1: ci * VIRT_COL_W + VIRT_COL_W - 1,
        })),
      })),
      columnBoundaries: [],
    };
    setFormRows(mappedToFormRows(grid));
    info('Đã nạp lại từ bảng quét', 'Dữ liệu đối soát được cập nhật theo nội dung hiện tại của bảng tính.');
  };

  // 5. Sửa dòng dữ liệu đối soát
  const handleUpdateRowCell = (rowId: string, field: keyof IExtractedFormRow, value: any) => {
    setFormRows(prev => prev.map(row => {
      if (row.rowId !== rowId) return row;
      const updated = { ...row, [field]: value };
      if (field === 'fromTime' || field === 'toTime') {
        // Tính lại số giờ từ khung giờ mới - chỉ ghi đè khi khung giờ hợp lệ
        const hoursRes = parseOvertimeHours('', String(updated.fromTime), String(updated.toTime));
        if (hoursRes.computedFromTime !== undefined) {
          updated.otHours = hoursRes.computedFromTime;
        }
      }
      return updated;
    }));
  };

  const handleAddNewRow = () => {
    const newRow: IExtractedFormRow = {
      rowId: nextRowId(),
      stt: formRows.length + 1,
      fullName: '',
      employeeId: '',
      department: '',
      otDate: '',
      otDateRaw: '',
      fromTime: '',
      toTime: '',
      otHours: null,
      reason: '',
      confidence: 1,
    };
    setFormRows([...formRows, newRow]);
    info('Đã thêm dòng trống', 'Điền mã NV, ngày (DD/MM/YYYY), giờ và số giờ tăng ca.');
  };

  const handleDeleteRow = (rowId: string) => {
    setFormRows(prev => prev.filter(r => r.rowId !== rowId).map((r, i) => ({ ...r, stt: i + 1 })));
    setActiveRowIdx(null);
  };

  // 6. Ghi DB - yêu cầu quyền + hộp thoại xác nhận, transaction phía service
  const handleCommitToDatabase = async () => {
    if (!canCommit) {
      warning('Không đủ quyền', `Vai trò "${currentRole}" không có quyền SCAN_OCR.`);
      return;
    }
    const validRows = reconciledRows.filter(r => r.employeeId && r.otDate && r.otHours !== null);
    if (validRows.length === 0) {
      warning('Chưa có dòng hợp lệ', 'Cần ít nhất 1 dòng có Mã NV, ngày và số giờ hợp lệ.');
      return;
    }

    const ok = await confirm({
      title: 'Xác nhận ghi vào hệ thống?',
      message: `Sẽ cập nhật ${validRows.length} bản ghi tăng ca (${matchedCount} khớp, ${mismatchCount} lệch) và lưu lịch sử quét. Thao tác này ghi vào IndexedDB.`,
      confirmText: 'Ghi nhận',
      cancelText: 'Xem lại',
    });
    if (!ok) return;

    try {
      const { updated, scansWritten } = await commitVerifiedRows(validRows, {
        fileName: lastFileName || formTitle,
        verifiedBy: currentRole ?? undefined,
      });
      success(
        'Đã ghi nhận kết quả quét',
        `${updated} bản ghi tăng ca được cập nhật trạng thái, ${scansWritten} mục lịch sử quét đã lưu.`
      );
    } catch (err: any) {
      error('Lỗi khi lưu dữ liệu', err.message);
    }
  };

  // 7. Health check ONNX
  const handleTestONNXModel = async () => {
    try {
      setIsTestingModel(true);
      const report: IONNXModelHealthReport = await testONNXModelRuntime();
      setIsTestingModel(false);
      alertModal(
        'Báo Cáo Trạng Thái ONNX Runtime Web & PaddleOCR Models',
        (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold">Hệ Thống ONNX Runtime Web Đang Sẵn Sàng (READY)</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Mô hình và từ điển tiếng Việt tải được từ thư mục ngoài.</div>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>Cấu Hình Động Cơ WASM</span>
              </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>• Động cơ: <b className="text-slate-900">{report.wasmEngine.name}</b></div>
              <div>• SIMD WASM: <b className={report.wasmEngine.simdSupported ? 'text-emerald-600' : 'text-rose-600'}>{report.wasmEngine.simdSupported ? 'Được hỗ trợ' : 'Không'}</b></div>
              <div>• Luồng CPU khả dụng: <b className="text-slate-900">{report.wasmEngine.threads}</b></div>
              <div>• WebGPU: <b className="text-blue-600">{report.wasmEngine.webgpuSupported ? 'Khả dụng' : 'WASM Fallback'}</b></div>
            </div>
            <div className="text-[11px] pt-1 border-t border-slate-200 text-slate-500">
              Thời gian kiểm tra: <b>{report.checkDurationMs}ms</b> · Kiểm tra lúc {report.timestamp}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-orange-500" />
              <span>Mô Hình PaddleOCR ONNX ({report.models.length})</span>
            </div>
            {report.models.map(m => (
              <div key={m.path} className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">{m.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{m.path} ({m.sizeFormatted})</div>
                  <div className="text-[10px] text-slate-500">{m.description}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${m.loaded ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {m.loaded ? '✓ Sẵn sàng' : '✗ Thiếu file'}
                </span>
              </div>
            ))}
          </div>
          </div>
        )
      );
    } catch (err: any) {
      setIsTestingModel(false);
      error('Lỗi kiểm tra model ONNX', err.message);
    }
  };

  return (
    <div className="p-6 w-full space-y-6 flex-1 flex flex-col font-sans">
      {/* Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-orange-500" />
            <span>OCR Studio - Quét Thật (ONNX) &amp; Bảng Tính Đối Soát</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pipeline thật chạy trên trình duyệt: Detection ch_PP-OCRv4 → Classifier xoay chữ → Recognition latin_PP-OCRv3 (tiếng Việt).
            Kết quả hiển thị dạng bảng tính giống bố cục ảnh scan - sửa trực tiếp rồi mới ghi vào hệ thống.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleTestONNXModel}
            disabled={isTestingModel}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition shadow-sm"
          >
            {isTestingModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            <span>Test Model ONNX</span>
          </button>

          <button
            onClick={handleCommitToDatabase}
            disabled={isScanning || !canCommit}
            title={canCommit ? 'Ghi kết quả đã xác nhận vào IndexedDB' : `Vai trò "${currentRole}" không có quyền SCAN_OCR`}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-200"
          >
            <Save className="w-4 h-4" />
            <span>Ghi Nhận Vào Hệ Thống</span>
          </button>

          <button
            onClick={() => onNavigate('overtime')}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-orange-400" />
            <span>Xem Bảng Tăng Ca</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toolbar quét */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSampleImage}
            disabled={isScanning}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>Quét Ảnh Mẫu (image.png)</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Tải Ảnh Phiếu Tăng Ca Khác</span>
          </button>
        </div>

        {(scanProgress > 0 || streamingLogs.length > 0) && (
          <div className="flex items-center gap-2 min-w-[220px]">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all" style={{ width: `${scanProgress}%` }} />
            </div>
            <span className="text-[11px] font-bold text-slate-500">{scanProgress}%</span>
          </div>
        )}
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Trái: ảnh gốc */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-orange-500" />
              <h3 className="text-xs font-bold text-slate-800 truncate">{formTitle}</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded">Ảnh Gốc</span>
          </div>

          <div className="relative flex-1 min-h-[280px] bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-2 border border-slate-800">
            {previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt="Phiếu tăng ca"
                className="max-h-[380px] w-auto object-contain rounded shadow-md"
              />
            ) : (
              <div className="text-slate-400 text-xs text-center px-6">
                Chưa có ảnh. Bấm "Quét Ảnh Mẫu" hoặc "Tải Ảnh Phiếu Tăng Ca" để bắt đầu.
              </div>
            )}

            {isScanning && (
              <div className="absolute inset-0 bg-orange-500/10 pointer-events-none flex flex-col justify-center">
                <div className="h-1 w-full bg-gradient-to-r from-transparent via-orange-400 to-transparent animate-pulse shadow-lg shadow-orange-500" />
              </div>
            )}
          </div>

          {/* Log pipeline thật */}
          <div className="p-3 bg-slate-950 rounded-xl text-[10px] font-mono text-emerald-400 space-y-0.5 max-h-32 overflow-y-auto border border-slate-800">
            {streamingLogs.length === 0
              ? <div className="text-slate-500">Log pipeline sẽ hiển thị tại đây...</div>
              : streamingLogs.slice(-40).map((l, i) => <div key={i}>{l}</div>)}
          </div>

          {scanDetails && (
            <div className="p-2.5 bg-indigo-50 rounded-xl text-[10.5px] text-indigo-900 border border-indigo-100">
              <b>Chi tiết pipeline:</b> {scanDetails}
            </div>
          )}
        </div>

        {/* Phải: bảng tính Excel + đối soát */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col space-y-4">
          {/* A. Bảng tính kiểu Excel */}
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Table2 className="w-4 h-4 text-orange-500" />
                  Bảng Tính Quét Được (giống bố cục ảnh)
                </h3>
                <p className="text-[11px] text-slate-400">Ô nền vàng = độ tin cậy thấp, cần rà tay. Sửa trực tiếp trong ô.</p>
              </div>
              <button
                onClick={handleRemapFromGrid}
                disabled={gridRows.length === 0}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Nạp vào bảng đối soát</span>
              </button>
            </div>
            <OcrSpreadsheetPreview
              rows={gridRows}
              activeRowIdx={activeRowIdx}
              onSelectRow={setActiveRowIdx}
              onChangeCell={handleChangeCell}
            />
          </div>

          {/* B. Dữ liệu đối soát */}
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Dữ Liệu Nhận Diện &amp; Đối Soát Quẹt Thẻ</h3>
                <p className="text-[11px] text-slate-400">Trạng thái tính lại tức thì so với dữ liệu chấm công thật trong hệ thống</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold">✓ {matchedCount} Khớp</span>
                {mismatchCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-[11px] font-bold animate-pulse">⚠ {mismatchCount} Lệch</span>
                )}
                {notFoundCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold">{notFoundCount} Chờ sửa</span>
                )}
                <button
                  onClick={handleAddNewRow}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-400" />
                  <span>Thêm Dòng</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[340px] border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-bold sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-3 min-w-[100px]">Mã NV</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Họ và Tên</th>
                    <th className="py-2.5 px-2 text-center min-w-[90px]">Ngày</th>
                    <th className="py-2.5 px-2 text-center min-w-[100px]">Từ - Đến</th>
                    <th className="py-2.5 px-2 text-center min-w-[64px]">Giờ Phiếu</th>
                    <th className="py-2.5 px-2 text-center min-w-[70px]">Quẹt Thẻ</th>
                    <th className="py-2.5 px-3 text-center min-w-[104px]">Đối Soát</th>
                    <th className="py-2.5 px-2 text-center w-8">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {reconciledRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 text-[11px]">
                        Chưa có dòng dữ liệu. Quét ảnh rồi bấm "Nạp vào bảng đối soát".
                      </td>
                    </tr>
                  )}
                  {reconciledRows.map((row) => {
                    const srcRow = formRows.find(r => r.rowId === row.rowId)!;
                    const status = row.matchStatus;
                    return (
                      <tr
                        key={row.rowId}
                        className={`transition ${
                          status === 'MATCHED'
                            ? 'hover:bg-emerald-50/50'
                            : status === 'MISMATCH'
                              ? 'bg-rose-50/30 hover:bg-rose-50/70'
                              : 'hover:bg-amber-50/40'
                        }`}
                      >
                        <td className="py-2 px-2 text-center text-slate-400 font-bold">{row.stt}</td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={srcRow?.employeeId || ''}
                            onChange={(e) => handleUpdateRowCell(row.rowId, 'employeeId', e.target.value)}
                            placeholder="LEP..."
                            aria-label="Mã nhân viên"
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-indigo-700 text-xs focus:bg-white focus:outline-none focus:border-orange-500"
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 text-[11px] truncate">
                          {row.fullName || <span className="text-slate-300 italic">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="text"
                            value={srcRow?.otDateRaw || ''}
                            onChange={(e) => handleUpdateRowCell(row.rowId, 'otDateRaw', e.target.value)}
                            placeholder="DD/MM/YYYY"
                            aria-label="Ngày tăng ca"
                            className={`w-20 px-1.5 py-1 text-center border rounded font-semibold text-[11px] focus:bg-white focus:outline-none focus:border-orange-500 ${
                              row.otDate ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-amber-50 border-amber-300 text-amber-800'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1 font-mono text-[10px]">
                            <input
                              type="text"
                              value={srcRow?.fromTime || ''}
                              onChange={(e) => handleUpdateRowCell(row.rowId, 'fromTime', e.target.value)}
                              placeholder="07:30"
                              aria-label="Giờ vào"
                              className="w-11 px-1 py-0.5 text-center bg-slate-50 border border-slate-200 rounded"
                            />
                            <span>-</span>
                            <input
                              type="text"
                              value={srcRow?.toTime || ''}
                              onChange={(e) => handleUpdateRowCell(row.rowId, 'toTime', e.target.value)}
                              placeholder="16:00"
                              aria-label="Giờ ra"
                              className="w-11 px-1 py-0.5 text-center bg-slate-50 border border-slate-200 rounded"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={srcRow?.otHours ?? ''}
                            onChange={(e) => handleUpdateRowCell(row.rowId, 'otHours', e.target.value === '' ? null : parseFloat(e.target.value))}
                            aria-label="Số giờ tăng ca"
                            className={`w-14 px-1 py-1 text-center rounded font-extrabold text-xs focus:bg-white focus:outline-none focus:border-orange-500 ${
                              row.otHours === null ? 'bg-amber-50 border border-amber-300 text-amber-700' : 'bg-orange-50 border border-orange-200 text-orange-600'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-slate-700 text-[11px]">
                          {row.dbHours !== undefined ? `${row.dbHours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {status === 'MATCHED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Khớp
                            </span>
                          ) : status === 'MISMATCH' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Lệch
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Chờ sửa
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => handleDeleteRow(row.rowId)}
                            aria-label={`Xóa dòng ${row.stt}`}
                            className="text-slate-300 hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Chi tiết dòng đang chọn */}
            {activeRowIdx !== null && gridRows[activeRowIdx] && (
              <div className="p-3 rounded-xl border text-xs bg-orange-50/60 border-orange-200 text-orange-900">
                <span className="font-bold">Hàng quét #{activeRowIdx + 1}: </span>
                <span>{gridRows[activeRowIdx].cells.map(c => c.text).join(' | ') || '(trống)'}</span>
              </div>
            )}
            {activeRowIdx === null && reconciledRows.length > 0 && (
              <div className={`p-3 rounded-xl border text-xs ${
                reconciledRows[0].matchStatus === 'MATCHED'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/60 border-amber-200 text-amber-900'
              }`}>
                <span className="font-bold">Chi tiết dòng 1 ({reconciledRows[0].fullName || reconciledRows[0].employeeId}): </span>
                <span className="opacity-90">{reconciledRows[0].details}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
