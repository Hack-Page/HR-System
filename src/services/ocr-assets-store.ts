/**
 * OCR Assets Store — cache file model PaddleOCR cho chế độ OFFLINE file://
 *
 * Bối cảnh: khi mở dist/index.html trực tiếp bằng double-click trong thư mục
 * OneDrive (C:\...\HR-System), trang chạy trên giao thức file://. Trên file://:
 *   - Web Worker dạng module riêng file không khởi tạo được (CORS file),
 *   - fetch() tới file tương đối bị trình duyệt chặn,
 *   - CacheStorage ('caches') không khả dụng.
 * Còn IndexedDB vẫn hoạt động trên file:// nên dùng nó làm nơi chứa model.
 *
 * Luồng dùng:
 *   1. Lần đầu: user bấm "Nạp model offline" -> chọn các file trong
 *      PaddleOCR-Models (det .onnx, rec .onnx, latin_dict.txt, vi_dict.txt,
 *      ort-wasm-simd-threaded.wasm) -> lưu ArrayBuffer vào store này.
 *   2. Các lần sau: ocr-engine-direct.ts đọc thẳng từ đây, không cần fetch.
 * Trên http://localhost mọi thứ vẫn ưu tiên fetch tương đối như cũ.
 *
 * DB riêng 'HRSystem_OCRAssets' để không phải bump version schema chính.
 */
import Dexie, { Table } from 'dexie';

export type OcrAssetKey =
  | 'det'        // ch_PP-OCRv4_det_infer.onnx
  | 'rec'        // latin_PP-OCRv3_rec.onnx
  | 'latin_dict' // dictionaries/latin_dict.txt
  | 'vi_dict'    // dictionaries/vi_dict.txt
  | 'ort-wasm'   // ort/ort-wasm-simd-threaded.wasm
  | 'ort-mjs';   // ort/ort-wasm-simd-threaded.mjs (dự phòng)

export interface IOcrAssetRow {
  key: OcrAssetKey;
  name: string;      // tên file gốc để hiển thị
  mime: string;
  bytes: ArrayBuffer;
  size: number;
  savedAt: string;   // ISO
}

class OCRAssetsDatabase extends Dexie {
  assets!: Table<IOcrAssetRow, string>;

  constructor() {
    super('HRSystem_OCRAssets');
    this.version(1).stores({ assets: 'key' });
  }
}

export const ocrAssetsDb = new OCRAssetsDatabase();

/** Trang có đang chạy bằng file:// (mở trực tiếp, không qua localhost)? */
export function isFileProtocol(): boolean {
  try {
    return typeof window !== 'undefined' && window.location?.protocol === 'file:';
  } catch {
    return false;
  }
}

/** Web Worker module có khả năng chạy không? file:// coi như không. */
export function canUseWorker(): boolean {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return false;
  if (isFileProtocol()) return false;
  return true;
}

export async function getOcrAsset(key: OcrAssetKey): Promise<IOcrAssetRow | undefined> {
  try {
    return await ocrAssetsDb.assets.get(key);
  } catch {
    return undefined;
  }
}

export async function putOcrAsset(key: OcrAssetKey, file: File | Blob, name?: string): Promise<void> {
  const bytes = await file.arrayBuffer();
  await ocrAssetsDb.assets.put({
    key,
    name: name || (file instanceof File ? file.name : key),
    mime: file.type || 'application/octet-stream',
    bytes,
    size: bytes.byteLength,
    savedAt: new Date().toISOString(),
  });
}

/** Các key bắt buộc để pipeline direct chạy được (mjs chỉ dự phòng). */
export const REQUIRED_OCR_ASSET_KEYS: OcrAssetKey[] = ['det', 'rec', 'latin_dict', 'ort-wasm'];

export async function getStoredOcrAssetKeys(): Promise<OcrAssetKey[]> {
  try {
    const rows = await ocrAssetsDb.assets.toArray();
    return rows.map(r => r.key);
  } catch {
    return [];
  }
}

export async function hasAllRequiredOcrAssets(): Promise<boolean> {
  const keys = await getStoredOcrAssetKeys();
  return REQUIRED_OCR_ASSET_KEYS.every(k => keys.includes(k));
}

export async function clearOcrAssets(): Promise<void> {
  try {
    await ocrAssetsDb.assets.clear();
  } catch { /* ignore */ }
}

/**
 * Đoán asset key từ tên file user chọn trong thư mục PaddleOCR-Models.
 * Trả về undefined nếu không nhận ra (bỏ qua file đó).
 */
export function guessOcrAssetKey(fileName: string): OcrAssetKey | undefined {
  const n = fileName.toLowerCase();
  if (n.includes('ch_pp-ocrv4_det') && n.endsWith('.onnx')) return 'det';
  if (n.includes('latin_pp-ocrv3_rec') && n.endsWith('.onnx')) return 'rec';
  if (n === 'latin_dict.txt' || (n.includes('latin_dict') && n.endsWith('.txt'))) return 'latin_dict';
  if (n === 'vi_dict.txt' || (n.includes('vi_dict') && n.endsWith('.txt'))) return 'vi_dict';
  if (n.includes('ort-wasm-simd-threaded') && n.endsWith('.wasm')) return 'ort-wasm';
  if (n.includes('ort-wasm-simd-threaded') && n.endsWith('.mjs')) return 'ort-mjs';
  return undefined;
}
