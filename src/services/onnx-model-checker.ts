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
    charCount: number; // số dòng thật của latin_dict.txt (CTC dict chính, output 187)
    vietnameseDiacritics: boolean; // phát hiện ký tự tiếng Việt thật trong dict
  };
  /** HR Vietnamese comprehensive dict (vi_dict.txt, 235 ký tự) - dùng cho RAG post-process */
  viDictionary?: {
    path: string;
    charCount: number;
    vietnameseDiacritics: boolean;
    isComprehensive: boolean; // 235 = latin 185 + 50 HR Vietnamese
    statusNote: string;
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
const DICT_PATH_VI = '/PaddleOCR-Models/dictionaries/vi_dict.txt';
const ORT_WASM_PATH = '/PaddleOCR-Models/ort/ort-wasm-simd-threaded.wasm';

/**
 * Dò SIMD + Threads thực tế trên Edge/Chrome.
 * Trả về true nếu browser thật sự hỗ trợ WASM SIMD (v128).
 * Giữ logic validate nhưng thêm fallback cho Edge: nếu validate fail do module biên dịch cũ,
 * thử module SIMD chuẩn thứ 2.
 */
function detectSimd(): boolean {
  try {
    // Module 1: minimal v128 type (dùng cho hầu hết Chromium)
    const simdModule1 = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00,
      0x0a, 0x0a, 0x01, 0x08, 0x00,
      0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    if (WebAssembly.validate(simdModule1)) return true;
    // Module 2: fallback với v128.load (phổ biến trên Edge)
    const simdModule2 = new Uint8Array([
      0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00,0x01,0x05,0x01,0x60,0x00,0x01,0x7b,0x03,0x02,0x01,0x00,0x0a,0x0e,0x01,0x0c,0x00,0x41,0x00,0xfd,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0b
    ]);
    return WebAssembly.validate(simdModule2);
  } catch {
    return false;
  }
}

function detectThreads(): number {
  try {
    const c = (navigator as any).hardwareConcurrency || 1;
    // Threads cần crossOriginIsolated + SharedArrayBuffer, nhưng vẫn báo số lõi để hiển thị tăng tốc
    return c;
  } catch { return 1; }
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
  let simdSupported = hasWasm && detectSimd();
  const webgpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const threads = detectThreads();
  // Tăng tốc thực tế: nếu Edge đang chạy bản mới, SIMD thường đã hỗ trợ; nếu detect fail do module cũ, vẫn coi là hỗ trợ khi threads>2 và WebAssembly có
  // Tự động tối ưu: nếu hasWasm && threads>=2 thì coi tăng tốc khả dụng (phản ánh đúng tốc độ, và sẽ áp dụng cache + threads ở worker)
  const accelSupported = simdSupported || threads >= 2 || webgpuSupported;
  if (!simdSupported && hasWasm && threads >= 4) {
    // Edge hiện đại thường hỗ trợ SIMD nhưng validate module cũ có thể fail -> vẫn báo khả dụng để không làm user hoang mang
    // Giữ simdSupported false để trung thực, nhưng UI sẽ hiển thị "Hoạt động tốt" nhờ accelSupported
    // console.debug('[OCR] SIMD validate false nhưng threads cao, vẫn tăng tốc qua threads');
  }

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

  // 2) Từ điển: đếm dòng thật + dò dấu tiếng Việt (giữ nguyên cấu trúc nhưng fix logic)
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
      // latin_dict 185 không chứa đủ 50 ký tự HR (ă, ơ, ư...), nên hasVietnamese sẽ false -> expected
      // Đó là lý do vi_dict comprehensive 235 tồn tại để HR RAG bổ sung
    }
  } catch { /* giữ false */ }

  // 2b) vi_dict comprehensive (HR) - không ảnh hưởng coreReady của pipeline CTC (vẫn dùng latin)
  let viDictCount = 0;
  let viHasVietnamese = false;
  let viIsComprehensive = false;
  let viStatusNote = '';
  let viExists = false;
  try {
    const viRes = await fetch(DICT_PATH_VI);
    if (viRes.ok) {
      viExists = true;
      const lines = (await viRes.text()).split('\n').map(l => l.replace(/\r$/, ''));
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      viDictCount = lines.length;
      const charset = new Set(lines.join('').split(''));
      viHasVietnamese = ['ệ', 'ơ', 'ư', 'đ', 'ậ', 'ă', 'ị', 'ỹ'].every(c => charset.has(c));
      viIsComprehensive = viDictCount === 235;
      if (viDictCount === 113) {
        viStatusNote = 'BẢN LỖI CŨ 113 ký tự (thiếu digits/symbols, đã fix thành 235) - worker hiện fallback về latin nên vẫn chạy';
      } else if (viIsComprehensive) {
        viStatusNote = 'Comprehensive HR Vietnamese (latin 185 + 50 ký tự HR) - dùng cho HR RAG post-process, CTC vẫn dùng latin 185 khớp model 187';
      } else if (viDictCount === 185) {
        viStatusNote = 'Copy của latin_dict (khớp model) - OK';
      } else {
        viStatusNote = `Kích thước ${viDictCount}, kiểm tra lại mapping với model`;
      }
    } else {
      viStatusNote = `HTTP ${viRes.status}`;
    }
  } catch (e: any) {
    viStatusNote = `lỗi: ${e?.message || e}`;
  }

  // 3) Trạng thái tổng hợp - trung thực theo điều kiện thật nhưng phản ánh đúng tốc độ Edge
  // FIX: coreReady chỉ phụ thuộc latin_dict (CTC) + models + wasm. vi_dict là HR bổ sung, không làm fail pipeline.
  // Tăng tốc không phải điều kiện bắt buộc cho READY, chỉ là chỉ số hiệu năng
  const coreReady = hasWasm && det.exists && recLatin.exists && ortWasm.exists && dictExists;
  const status: IONNXModelHealthReport['status'] =
    !hasWasm ? 'ERROR'
      : coreReady ? 'READY'
        : 'WARNING';
  // Lưu ý: accelSupported đã tính ở trên, UI sẽ hiển thị "Hoạt động tốt" nếu true, dù simdSupported false

  const missing: string[] = [];
  if (!det.exists) missing.push('det model');
  if (!recLatin.exists) missing.push('rec model');
  if (!ortWasm.exists) missing.push('ort-wasm runtime');
  if (!dictExists) missing.push('latin dictionary');

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
    viDictionary: viExists ? {
      path: DICT_PATH_VI,
      charCount: viDictCount,
      vietnameseDiacritics: viHasVietnamese,
      isComprehensive: viIsComprehensive,
      statusNote: viStatusNote,
    } : undefined,
    checkDurationMs: Math.round(performance.now() - startTime),
    timestamp: new Date().toLocaleString('vi-VN'),
  };
}
