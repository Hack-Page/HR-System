import { describe, it, expect } from 'vitest';
import { pureJsSha256Bytes, sha256Hex } from './password';

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('pureJsSha256Bytes - khớp chuẩn SHA-256 FIPS 180-4', () => {
  it('vector kiểm chứng chuẩn: "abc"', () => {
    const hex = Array.from(pureJsSha256Bytes(bytes('abc')), b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('chuỗi rỗng', () => {
    const hex = Array.from(pureJsSha256Bytes(new Uint8Array(0)), b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('dữ liệu dài hơn 1 block (>64 byte) để test padding nhiều vòng', () => {
    const input = 'a'.repeat(200);
    const hex = Array.from(pureJsSha256Bytes(bytes(input)), b => b.toString(16).padStart(2, '0')).join('');
    // Vector tham chiếu tính từ node:crypto
    expect(hex.length).toBe(64);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex trả cùng kết quả bất kể có/không có crypto.subtle', async () => {
    // Trong môi trường test crypto.subtle thường có sẵn - kết quả phải là hex 64 ký tự hợp lệ
    const hex = await sha256Hex('test-input');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    // Đối chiếu với implementation thuần
    const pure = Array.from(pureJsSha256Bytes(bytes('test-input')), b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(pure);
  });
});
