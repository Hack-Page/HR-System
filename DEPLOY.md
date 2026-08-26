# HƯỚNG DẪN PHÂN PHỐI — SmartHR Leggett & Platt

Mô hình: **1 máy ADMIN giữ repo gốc → nhiều máy CLIENT tự clone về → build → chạy local**.
Không cần internet, không cài thêm phần mềm ngoài Node.js + Git, không thực thi file .exe nào của dự án.

---

## 1. Nguyên tắc kiến trúc (giữ nguyên 100%)

- Mỗi máy client có **bản sao độc lập**: source code + `dist/` build + dữ liệu IndexedDB riêng
  (`HRSystem_LeggettPlatt_DB`) lưu trong trình duyệt của chính máy đó.
- Máy ADMIN chỉ là **nguồn chuẩn về mã nguồn** (git). Không có dữ liệu nhân sự tập trung ở máy admin
  trừ khi chủ động dùng tính năng Đồng Bộ OneDrive (xuất/nhập file JSON) để trao đổi dữ liệu.
- Toàn bộ tính năng chạy offline trong browser: OCR ONNX, formula engine, export Excel.

## 2. Trên máy ADMIN — tạo kho phát hành (làm 1 lần)

```bash
# Trong thư mục dự án đã có sẵn:
git clone --bare /path/to/hr-system.git          # hoặc init bare từ bản hiện tại
# Ví dụ: git clone --bare . /srv/hr-admin.git
```

Chia sẻ thư mục chứa `hr-admin.git` cho client qua 1 trong 2 cách:

| Cách | Lệnh clone phía client | Ghi chú |
|---|---|---|
| **SMB/Share mạng** (Windows phổ biến) | `git clone \\ADMIN-PC\share\hr-admin.git hr-system` | Không cần cài gì thêm |
| **Git daemon** (đã có git) | `git daemon --base-path=/srv --export-all` rồi `git clone git://ADMIN-IP/hr-admin.git` | Port mặc định 9418 |

> Cấm đẩy nhánh chính trực tiếp nếu muốn kiểm soát: đặt `hr-admin.git/hooks/update.sample`
> thành hook chỉ nhận fast-forward, hoặc quản lý qua tag phiên bản (`v1.x`).

Phát hành phiên bản mới:

```bash
git tag v1.2 -m "Bản phát hành tháng X" && git push origin v1.2
```

## 3. Trên mỗi máy CLIENT — 2 lệnh là chạy được

Yêu cầu máy client: **Git** + **Node.js ≥ 20** (không cần anything else).

```bash
git clone <đường-dẫn-kho-từ-admin> hr-system
cd hr-system
npm run setup        # = npm install + tsc + vite build + copy models vào dist/
npm run serve        # phục vụ tại http://localhost:4173
```

Mở trình duyệt → `http://localhost:4173` → đăng nhập `admin / admin123` → **đổi mật khẩu ngay**.

Tạo icon desktop cho người dùng cuối (tuỳ chọn):

```bash
npm run shortcut -- localhost     # sinh shortcuts/SmartHR.url kèm icon riêng
```

Copy `SmartHR.url` + `smarthr-favicon.ico` ra Desktop là xong.

### Cập nhật lên phiên bản mới

```bash
git pull origin main        # hoặc checkout tag: git fetch && git checkout v1.2
npm run setup               # cài dependency mới (nếu có) + build lại
# khởi động lại npm run serve
```

## 4. Cam kết "không chạy .exe" — kết quả audit thật

Đã quét toàn bộ dự án:

| Hạng mục | Kết quả |
|---|---|
| File `.exe` trong repo / dist | **0** |
| Quy trình runtime của app | Chỉ là trang web tĩnh do trình duyệt mở; engine AI là WASM chạy TRONG tab |
| `npm run build` thực thi cái gì | `node.exe` chạy Vite 8/Rolldown + TypeScript — tất cả là module nạp **trong tiến trình node**, không spawn tiến trình .exe lạ |
| Native binding từ npm | `@rolldown/binding-*`, `@tailwindcss/oxide-*` — là thư viện `.node/.dll` **chính thức có ký số của npm**, được nạp in-process (KHÔNG phải .exe độc lập). Nếu Falcon chặn load DLL chưa duyệt, cần IT whitelist đúng 2 package này |

Lưu ý trung thực: `npm install` luôn tải binding theo hệ điều hành từ registry npm
(máy client cần ra mạng LAN/internet được tới registry, hoặc admin dựng npm mirror nội bộ —
ví dụ Verdaccio — nếu chính sách cấm ra ngoài).

## 5. Dữ liệu & tài khoản — điều bắt buộc phải hiểu

- Tài khoản đăng nhập, danh mục NV, chấm công… nằm trong **IndexedDB của từng máy**.
  Clone repo KHÔNG mang theo dữ liệu (chỉ mang code) — mỗi chi nhánh/máy tự vận hành dữ liệu của mình.
- Muốn chuyển/trộn dữ liệu giữa các máy: dùng nút **Đồng Bộ OneDrive** trong app
  (xuất snapshot JSON → mang file → nhập, có validate + transaction).
- Quên mật khẩu admin trên 1 máy: xoá dữ liệu trình duyệt cho site `localhost:4173`
  (hoặc DevTools → IndexedDB → xoá `HRSystem_LeggettPlatt_DB`) rồi mở lại — hệ thống tự seed lại
  tài khoản `admin/admin123`.

## 6. Khắc phục nhanh

| Hiện tượng | Xử lý |
|---|---|
| `http://localhost:4173` không vào được | Chưa chạy `npm run serve`, hoặc port bị chiếm → `npm run serve -- --port 5000` |
| OCR báo lỗi tải model | Kiểm tra `dist/PaddleOCR-Models/` tồn tại (chạy lại `npm run build`) |
| Falcon cảnh báo lúc `npm install/build` | Chỉ ra với IT: node.exe nạp DLL ký số npm (@rolldown, @tailwindcss/oxide) — không có exe lạ |
