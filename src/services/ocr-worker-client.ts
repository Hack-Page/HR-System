/**
 * OCR Worker Client - Promise-based wrapper cho onnx-ocr.worker.ts
 *
 * Điểm quan trọng:
 *  - Mỗi lần chạy có requestId riêng -> progress/kết quả không bị trộn giữa các lần gọi
 *  - Các lần gọi được xếp hàng tuần tự (worker chỉ xử lý 1 ảnh tại một thời điểm)
 *  - terminateOcrWorker() huỷ worker và từ chối mọi tác vụ đang chờ
 */
import type {
  OCRWorkerRequest,
  OCRWorkerProgress,
  OCRWorkerResult,
  OCRWorkerError,
} from '../types/ocr-worker-protocol';

export interface OcrRunHandlers {
  onProgress?: (progress: number, step: string, message: string) => void;
}

export interface OcrRunOptions extends OcrRunHandlers {
  fileName?: string;
}

export type { OCRWorkerResult as OcrRunResult };

let workerInstance: Worker | null = null;

/** Hàng đợi tuần tự: mỗi phần tử là continuation của cái trước */
let queueTail: Promise<unknown> = Promise.resolve();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/onnx-ocr.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return workerInstance;
}

function runOnce(imageBytes: ArrayBuffer, options: OcrRunOptions): Promise<OCRWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const requestId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.requestId !== requestId) return; // tin nhắn của lần chạy khác - bỏ qua

      switch (msg.type) {
        case 'PROGRESS':
          options.onProgress?.((msg as OCRWorkerProgress).progress, (msg as OCRWorkerProgress).step, (msg as OCRWorkerProgress).message);
          break;
        case 'COMPLETE':
          cleanup();
          resolve(msg as OCRWorkerResult);
          break;
        case 'ERROR':
          cleanup();
          reject(new Error((msg as OCRWorkerError).error));
          break;
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || 'OCR Worker crashed'));
    };
    function cleanup() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const request: OCRWorkerRequest = {
      type: 'RUN_OCR',
      requestId,
      payload: { imageBytes, fileName: options.fileName },
    };
    worker.postMessage(request, [imageBytes]); // transferable - tránh copy bộ nhớ
  });
}

/**
 * Chạy pipeline OCR thật trên một ảnh. Các lời gọi chồng nhau được xếp hàng,
 * kết quả luôn gắn đúng requestId của lần gọi.
 */
export function runOcrPipeline(
  imageBlob: Blob | ArrayBuffer,
  options: OcrRunOptions = {}
): Promise<OCRWorkerResult> {
  const job = async (): Promise<ArrayBuffer> =>
    imageBlob instanceof ArrayBuffer ? imageBlob : await imageBlob.arrayBuffer();

  // Xếp hàng tuần tự để worker không bao giờ nhận 2 tác vụ cùng lúc
  const run = queueTail.then(() => job()).then(bytes => runOnce(bytes, options));
  // Nếu 1 job lỗi vẫn phải tiếp tục hàng đợi cho các job sau
  queueTail = run.catch(() => undefined);
  return run;
}

export function terminateOcrWorker() {
  workerInstance?.terminate();
  workerInstance = null;
}
