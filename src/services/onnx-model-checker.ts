/**
 * Health check ONNX - kiểm tra THẬT các thành phần OCR cục bộ.
 *
 * Offline 100%: không tải bất kỳ script CDN nào. Runtime ORT đã được bundle
 * trong worker (onnx-ocr.worker.ts import 'onnxruntime-web/wasm') nên checker
 * chỉ cần xác minh: WebAssembly + SIMD, file model tồn tại (kèm kích thước thật
 * từ Content-Length), từ điển ký tự (đếm dòng + có dấu tiếng Việt).
 */

export interface IONNXModelHealthReport {
  status: 'READY' | 'WARNING' | 'ERROR';
  mode: 'REAL_ONNX';
  wasmEngine: {
    name: 'ONNX Runtime Web (bundled trong worker)';
    simdSupported: boolean;
    threads: number;
    webgpuSupported: boolean;
  };
  models: {
    name: string;
    path: string;
    loaded: boolean;
    sizeFormatted: string; // kích thước thật đo từ Content-Length
    description: string;
  }[];
  dictionary: {
    path: string;
    charCount: number; // số dòng thật của latin_dict.txt
    vietnameseDiacritics: boolean; // phát hiện ký tự tiếng Việt thật trong dict
  };
  /** Thời gian thực hiện toàn bộ bước kiểm tra (ms) - đo thật */
  checkDurationMs: number;
  timestamp: string;
}

/** Model cần cho pipeline thật (cls đã loại - xem onnx-ocr.worker.ts) */
const MODEL_SPECS = [
  {
    key: 'det',
    name: 'PP-OCRv4 Text Detection (DBNet)',
    path: '/PaddleOCR-Models/onnx/ch_PP-OCRv4_det_infer.onnx',
    desc: 'Phát hiện vùng chữ trên ảnh phiếu tăng ca',
  },
  {
    key: 'rec-latin',
    name: 'PP-OCRv3 Latin Recognition',
    path: '/PaddleOCR-Models/onnx/latin_PP-OCRv3_rec.onnx',
    desc: 'Nhận dạng ký tự Latin & tiếng Việt đa dấu (CTC decode)',
  },
];

const DICT_PATH = '/PaddleOCR-Models/dictionaries/latin_dict.txt';
const ORT_WASM_PATH = '/PaddleOCR-Models/ort/ort-wasm-simd-threaded.wasm';

/**
 * Dò SIMD bằng cách validate một module WASM tối giản dùng instruction
 * v128 - phương pháp chuẩn, không phải "kiểm tra API tồn tại".
 */
function detectSimd(): boolean {
  try {
    // Module rỗng kèm section dùng kiểu v128 (0x7b)
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
      0x03, 0x02, 0x01, 0x00,
      0x0a, 0x0a, 0x01, 0x08, 0x00,
      0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // v128.const 0
    ]);
    return WebAssembly.validate(simdModule);
  } catch {
    return false;
  }
}

async function headInfo(url: string): Promise<{ exists: boolean; size?: number }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return { exists: false };
    const len = res.headers.get('content-length');
    return { exists: true, size: len ? parseInt(len, 10) : undefined };
  } catch {
    return { exists: false };
  }
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'không xác định';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function testONNXModelRuntime(): Promise<IONNXModelHealthReport> {
  const startTime = performance.now();

  const hasWasm = typeof WebAssembly === 'object';
  const simdSupported = hasWasm && detectSimd();
  const webgpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const threads = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 1;

  // 1) Model files + runtime wasm tồn tại cục bộ?
  const [det, recLatin, ortWasm] = await Promise.all([
    headInfo(MODEL_SPECS[0].path),
    headInfo(MODEL_SPECS[1].path),
    headInfo(ORT_WASM_PATH),
  ]);
  const modelResults = [
    { spec: MODEL_SPECS[0], info: det },
    { spec: MODEL_SPECS[1], info: recLatin },
  ];

  // 2) Từ điển: đếm dòng thật + dò dấu tiếng Việt
  let dictExists = false;
  let dictCharCount = 0;
  let hasVietnamese = false;
  try {
    const dictRes = await fetch(DICT_PATH);
    if (dictRes.ok) {
      dictExists = true;
      const lines = (await dictRes.text()).split('\n').map(l => l.replace(/\r$/, ''));
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      dictCharCount = lines.length;
      // Kiểm tra vài ký tự tiếng Việt đặc trưng có trong dict
      const charset = new Set(lines.join('').split(''));
      hasVietnamese = ['ệ', 'ơ', 'ư', 'đ', 'ậ'].every(c => charset.has(c));
    }
  } catch { /* giữ false */ }

  // 3) Trạng thái tổng hợp - trung thực theo điều kiện thật
  const coreReady = hasWasm && simdSupported && det.exists && recLatin.exists && ortWasm.exists && dictExists;
  const status: IONNXModelHealthReport['status'] =
    !hasWasm ? 'ERROR'
      : coreReady ? 'READY'
        : 'WARNING';

  const missing: string[] = [];
  if (!det.exists) missing.push('det model');
  if (!recLatin.exists) missing.push('rec model');
  if (!ortWasm.exists) missing.push('ort-wasm runtime');
  if (!dictExists) missing.push('dictionary');

  return {
    status,
    mode: 'REAL_ONNX',
    wasmEngine: {
      name: 'ONNX Runtime Web (bundled trong worker)',
      simdSupported,
      threads,
      webgpuSupported,
    },
    models: modelResults.map(({ spec, info }) => ({
      name: spec.name,
      path: spec.path,
      loaded: info.exists,
      sizeFormatted: formatSize(info.size),
      description: `${spec.desc} — ${info.exists ? 'File sẵn sàng' : 'KHÔNG tìm thấy'}${!coreReady && missing.length ? '' : ''}`,
    })),
    dictionary: {
      path: DICT_PATH,
      charCount: dictCharCount,
      vietnameseDiacritics: hasVietnamese,
    },
    checkDurationMs: Math.round(performance.now() - startTime),
    timestamp: new Date().toLocaleString('vi-VN'),
  };
}
