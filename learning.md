# LEARNING & FAST-FIX LOGBOOK (LEARNING.MD)

Sổ tay ghi nhận toàn bộ các lỗi phát sinh trong quá trình phát triển, nguyên nhân gốc rễ, phương án khắc phục và bài học kinh nghiệm để Coder (Agy CLI) tra cứu và xử lý nhanh chóng nếu gặp lại.

---

## Mục lục lỗi & bài học

- [KB-001: Lỗi tràn chữ / rớt dòng badge trên màn hình laptop (13-15.6 inch)](#kb-001-lỗi-tràn-chữ--rớt-dòng-badge-trên-màn-hình-laptop-13-156-inch)
- [KB-002: Lỗi IndexedDB không cho phép Boolean làm Index Key](#kb-002-lỗi-indexeddb-không-cho-phép-boolean-làm-index-key)
- [KB-003: Dexie.js upgrade() không chạy trên Fresh Database Install](#kb-003-dexiejs-upgrade-không-chạy-trên-fresh-database-install)

---

### KB-001: Lỗi tràn chữ / rớt dòng badge trên màn hình laptop (13-15.6 inch)
- **Ngày ghi nhận**: 2026-09-09
- **Vị trí**: `src/pages/EmployeeListPage.tsx` (cột Nhóm Ca Làm Việc, Hợp Đồng & Kỳ Công)
- **Triệu chứng (Symptom)**: 
  - Trên màn hình lớn 27 inch hiển thị bình thường: `Chính thức (21-20)`, `HC T2-T6 (23 công)`.
  - Khi mở hệ thống trên laptop (13 – 15.6 inch), bảng tính bị co hẹp, trình duyệt tự động ngắt dòng tại khoảng trắng trước số `20` hoặc chữ `công`, làm rớt chữ xuống dòng thứ 2 trông rất phản cảm và giảm trải nghiệm.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Các phần tử badge `<span>` chưa có class `whitespace-nowrap inline-block`.
  - Thẻ `<th>` và `<td>` của cột chưa được khai báo độ rộng tối thiểu an toàn (`min-w-[155px]`, `min-w-[165px]`).
- **Giải pháp xử lý (Resolution)**:
  - Thêm `whitespace-nowrap inline-block` vào mọi thẻ badge.
  - Bổ sung `min-w-[...]` cho cả `th` và `td` tương ứng.
  - Bao bọc toàn bảng trong container `overflow-x-auto` để cuộn ngang an toàn khi màn hình thu nhỏ thay vì ép hẹp nội dung cột.
- **Bài học kinh nghiệm (Key Takeaway)**:
  - Mọi cột bảng hiển thị các cụm từ quan trọng kèm số trong ngoặc (vd `(21-20)`, `(23 công)`) BẮT BUỘC phải có `whitespace-nowrap` ngay từ khi dựng UI, không phụ thuộc vào kích thước màn hình test ban đầu.

---

### KB-002: Lỗi IndexedDB không cho phép Boolean làm Index Key
- **Ngày ghi nhận**: 2026-08-28
- **Vị trí**: `src/db/index.ts`
- **Triệu chứng (Symptom)**:
  - IndexedDB báo lỗi `DataError: The data provided to an operation does not meet requirements` khi truy vấn index trên các trường boolean (`isViolation`, `isRestViolation`, `active`).
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Chuẩn W3C IndexedDB spec chỉ cho phép kiểu dữ liệu: Number, String, Date, Binary, Array làm Index Key. Kiểu `Boolean` không phải là valid key path trong IndexedDB.
- **Giải pháp xử lý (Resolution)**:
  - Tạo shadow flag dạng số `0 | 1` (như `isViolationFlag: 0 | 1`, `activeFlag: 0 | 1`) để dùng cho index.
  - Giữ nguyên trường boolean gốc để React UI binding tự nhiên mà không bị gãy.
  - Dùng Dexie hooks (`creating`, `updating`) hoặc upgrade transform tự động gán `flag = bool ? 1 : 0`.
- **Bài học kinh nghiệm (Key Takeaway)**:
  - Khi thiết kế schema Dexie.js, tuyệt đối không đặt index trên trường boolean thuần túy. Luôn chuẩn bị sẵn shadow flag số `0 | 1`.

### KB-003: Dexie.js upgrade() không chạy trên Fresh Database Install
- **Ngày ghi nhận**: 2026-09-09
- **Vị trí**: `src/db/index.ts` & `src/services/db-seeder.ts`
- **Triệu chứng (Symptom)**: 
  - Khách hàng mới mở web app lần đầu trên trình duyệt sạch (chưa có IndexedDB từ trước), các bảng mới (`productionLines`, `shiftClasses`, `rbacRoles`) bị trống rỗng dữ liệu seed ban đầu mặc dù đã viết hàm `.upgrade()` rất cẩn thận.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Cơ chế của Dexie.js: Hàm `.upgrade()` chỉ được trigger khi database đang ở version cũ (ví dụ client đã có DB v6) và mở mã nguồn mới có schema v7. Nếu trình duyệt chưa từng có DB (fresh install), Dexie khởi tạo thẳng version cao nhất hiện tại (v7) và bỏ qua toàn bộ chuỗi `.upgrade()`.
- **Giải pháp xử lý (Resolution)**:
  - Luôn đồng bộ 2 tầng:
    1. Tầng 1: Viết `.upgrade()` trong `src/db/index.ts` cho các client cũ nâng cấp.
    2. Tầng 2: Thêm kiểm tra `count === 0` trong `seedDatabaseIfEmpty()` (`src/services/db-seeder.ts`) cho các client mới truy cập lần đầu.
- **Bài học kinh nghiệm (Key Takeaway)**:
  - Bất cứ khi nào tạo store mới cần seed mặc định, phải bổ sung cả trong `.upgrade()` và `seedDatabaseIfEmpty()`.

- [KB-004: Giá trị số 0 bị coi là truthy trong Nullish Coalescing (??) khi tính phụ cấp](#kb-004-giá-trị-số-0-bị-coi-là-truthy-trong-nullish-coalescing--khi-tính-phụ-cấp)
- [KB-005: Tách riêng Off và UL: Cần cập nhật cả test suite cũ (timesheet-rules.test.ts)](#kb-005-tách-riêng-off-và-ul-cần-cập-nhật-cả-test-suite-cũ-timesheet-rulestestts)
- [KB-006: Thiếu polyfill fake-indexeddb/auto khi chạy file unit test Dexie độc lập](#kb-006-thiếu-polyfill-fake-indexeddbauto-khi-chạy-file-unit-test-dexie-độc-lập)

---

### KB-004: Giá trị số 0 bị coi là truthy trong Nullish Coalescing (??) khi tính phụ cấp
- **Ngày ghi nhận**: 2026-09-09
- **Vị trí**: `src/services/formula-engine.ts`
- **Triệu chứng (Symptom)**: 
  - Nhân viên có `customAllowances.productivityBonus = 0` (chưa cấu hình thưởng riêng), khi tính năng suất Nhóm 2 hệ thống lấy luôn `baseRate = 0` thay vì fallback về mức chuẩn `1.000.000đ`, dẫn đến kết quả tính ra `0đ`.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Toán tử `??` (Nullish Coalescing) chỉ coi `null` và `undefined` là nullish. Số `0` được coi là một giá trị hợp lệ. Khi một nhân viên có `productivityBonus: 0` được khởi tạo mặc định trong mock object, biểu thức `opts.base ?? emp.allowance ?? 1000000` sẽ trả về `0`.
- **Giải pháp xử lý (Resolution)**:
  - Với các trường số tiền mà `0` có nghĩa là "chưa thiết lập / áp dụng mức chuẩn", phải kiểm tra rõ `allowance > 0` trước khi gán: `allowance && allowance > 0 ? allowance : defaultRate`.
- **Bài học kinh nghiệm (Key Takeaway)**:
  - Cẩn trọng khi dùng toán tử `??` với các trường số học có giá trị mặc định là 0.

---

### KB-005: Tách riêng Off và UL: Cần cập nhật cả test suite cũ (timesheet-rules.test.ts)
- **Ngày ghi nhận**: 2026-09-09
- **Vị trí**: `src/test/timesheet-rules.test.ts`
- **Triệu chứng (Symptom)**: 
  - Test cũ `handles OFF, Off, ML, LA, ED, MCO, MCI correctly` bị fail vì assert `bag.countUL` kỳ vọng = 2 do ngày trước `Off` được cộng dồn vào `UL`.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Khi tách riêng `Off` (không phép) và `UL` (có phép), `bag.countUL` chỉ đếm số ngày `UL` thực tế. Test cũ đưa vào `OFF` và `Off` mà không có cell `UL` nào, nên `countUL` = 0 và `countOff` = 2.
- **Giải pháp xử lý (Resolution)**:
  - Cập nhật test case legacy sang kỳ vọng chuẩn mới: `bag.countOff === 2` và `bag.countUL === 0`, đồng thời kiểm tra thêm `bag.countML === 1`.

---

### KB-006: Thiếu polyfill fake-indexeddb/auto khi chạy file unit test Dexie độc lập
- **Ngày ghi nhận**: 2026-09-09
- **Vị trí**: `src/test/productivity-quality.test.ts`
- **Triệu chứng (Symptom)**:
  - Chạy toàn bộ test suite (`npm test`) thì pass do file `src/db/db.test.ts` chạy trước và inject `fake-indexeddb/auto` vào global scope của worker. Tuy nhiên khi chạy riêng file test đơn lẻ `npx vitest run src/test/productivity-quality.test.ts`, test fail 100% với lỗi `DatabaseClosedError: MissingAPIError IndexedDB API missing`.
- **Nguyên nhân gốc rễ (Root Cause)**:
  - Vitest chạy các file test trong môi trường độc lập (isolated processes/threads). File test mới thao tác trực tiếp với Dexie nhưng không import polyfill `fake-indexeddb/auto` ở đầu file.
- **Giải pháp xử lý (Resolution)**:
  - Thêm `import 'fake-indexeddb/auto';` ngay tại dòng đầu tiên của mọi file test có tương tác với Dexie / IndexedDB.
  - Bổ sung kiểm tra `if (!db.isOpen()) await db.open();` trong `beforeEach`.
- **Bài học kinh nghiệm (Key Takeaway)**:
  - Mọi test file liên quan đến Dexie BẮT BUỘC phải import `fake-indexeddb/auto` và luôn test thử bằng lệnh chạy đơn lẻ `npx vitest run <test-file>` trước khi bàn giao cho Subagent QC.
