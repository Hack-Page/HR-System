# OPENCODE REVIEW — SMART HR (Leggett & Platt) — 2026-09-09

> **Mục đích:** Review toàn codebase, đánh giá rõ 2 nghiệp vụ: (A) Backend/Database vs (B) Frontend logic nghiệp vụ, tìm lỗi tiềm tàng.
> **Quy ước phiên này:** Logic hiện chỉ là tạm thời để test role nên public — **không cần cảnh báo login ở phiên này**. Các vấn đề `vinh/123`, `kieu/123`, quick-login demo được ghi nhận nhưng không tính là P0 bắt fix phiên này.
> **Phạm vi:** `src/db/index.ts`, `src/types/index.ts`, `src/services/*`, `src/workers/*`, `src/context/*`, `src/components/layout/*`, `src/components/auth/*`, `src/pages/*`.
> **Đối tượng đọc tiếp:** agy cli / agent tiếp theo đánh giá lại.

---

## 0. Tổng quan kiến trúc (đã xác minh)

- **Single-File In-Browser Backend:** 100% offline, Dexie.js IndexedDB `HRSystem_LeggettPlatt_DB`, không server. `src/db/index.ts` v2→v7.
- **Schema stores (v7):** `employees`, `rawAttendanceLogs`, `dailyTimesheets`, `overtimeRecords`, `leaveRequests`, `shiftRosters`, `ocrScans`, `settings`, `accounts`, `shiftClasses`, `rbacRoles`, `productionLines`, `productivityQualityRates`.
- **Chuẩn đúng đã làm:** giữ tên store camelCase để không mất data cũ, bump version rebuild index, v6 fix boolean-index bằng shadow Flag `0|1` + `hook creating/updating` + `upgrade modify backfill`, seed-if-empty không đè data.
- **Frontend:** React + `AuthContext` RBAC client-side, `hasPermission(action)`, `departmentScope` (`WH`/`Production`/`QC`/null), `useLiveQuery` Dexie, import Excel qua `timesheet-parser.worker.ts`, export qua `excel-exporter.ts`, OCR qua `onnx-ocr.worker.ts` + `ocr-table-engine.ts` + `ocr-form-parser.ts` + `hr-rag-postprocessor.ts`, formula qua `formula-defs.ts` + `formula-engine.ts` (main) và `workers/formula-engine.worker.ts` (dead code).
- **RBAC thực tế (`src/db/index.ts:350-357` + `src/context/AuthContext.tsx:102-122`):**
  - `HR Manager: ['ALL_ACCESS']` nhưng `makeHasPermission` chặn cứng `SYSTEM_SETTINGS, MANAGE_ROLES_PERMISSIONS, SETTINGS`.
  - `AD System: ['ALL_ACCESS','SYSTEM_SETTINGS','MANAGE_ROLES_PERMISSIONS']` + short-circuit `return true`.
  - Dept roles (`HR Admin`, `Warehouse Admin`, `Production Admin`, `QC Admin`) chỉ có `VIEW_DEPT_*, PROPOSE_DEPT_OT, VIEW_DEPT_LEAVE, MANAGE_DEPT_ROSTER, SCAN_DEPT_OCR` — **không page nào check `VIEW_DEPT_*` / `PROPOSE_DEPT_OT` / `SCAN_DEPT_OCR`**. Dẫn tới dept flow chết (mục 2.3).

---

## A. BACKEND / DATABASE — Chi tiết lỗi tiềm tàng

### A1. Dexie schema / migration / index (`src/db/index.ts`)

**Đúng:**
- v4 `index.ts:93-114` thêm compound indexes cho query nóng Dashboard/Sidebar/Timesheet.
- v5 `index.ts:118-196` thêm `shiftClasses` + `rbacRoles`, seed 4 ca + 6 roles nếu trống.
- v6 `index.ts:202-287` chuyển 5 boolean sang Flag + backfill + hooks. Cover bởi `src/db/db.test.ts:117-196`.
- v7 `index.ts:229-255` thêm `productionLines` + `productivityQualityRates`, seed 2 lines.

**Lỗi / tiềm ẩn:**

- **B1 — `departmentScope` suy diễn giòn (`index.ts:190`, `db-seeder.ts:107`):**
  `roleId.includes('Warehouse'/'Production'/'QC')`. Role custom `Warehouse Auditor` match nhầm `WH`; chuỗi `QC` match chuỗi con. Khuyến nghị: dùng map tường minh hoặc field `departmentScope` trong `rbacRoles`, không suy diễn string.
- **B3 — Hook Flag che giấu data bẩn (`index.ts:258-287`):**
  `bulkPut` object thiếu cả `isViolation` + `isViolationFlag` → hook set `0` vì `undefined` falsy, biến record bẩn thành “không vi phạm”. Khuyến nghị: validate trước `bulkPut`, hoặc log khi cả 2 undefined.
- **B4 — Index không bao giờ dùng:**
  Mọi page `db.<table>.toArray()` rồi `filter` in-memory (`DashboardPage.tsx:47-51`, `TimesheetCalendarPage.tsx:56-59`). Compound `[month+year]`, `[employeeId+month+year]` chỉ dùng ở `Sidebar.tsx:46-51` + test. Scale >100k rows full-scan mỗi render. Thiếu index cho filter thật: `employees.productionLine/productivityGroup` (`EmployeeListPage.tsx:70`), `dailyTimesheets.month/year` đơn lẻ.
- **B5 — Type fallback vô hiệu check (`types/index.ts:108-131`):**
  `AttendanceStatusCode` có `(string & {})` → mọi string hợp lệ, vô hiệu type-check cho `buildCountBag`.

### A2. Seeder (`src/services/db-seeder.ts`)

- **B6 — Không transaction (`db-seeder.ts:7-85`):** 4x `bulkPut` rời rạc. Fail giữa chừng (quota, đóng tab) → DB nửa-seed. Fix: `db.transaction('rw', [employees, dailyTimesheets, overtimeRecords, shiftRosters, leaveRequests], ...)`.
- **B7 — Sample cứng chạy trên prod (`db-seeder.ts:26,63`):** `slice(0,15)`, `idx<3` violation giả, `slice(0,8)` Off/UL → tạo 30 rosters + 8 leaves giả mạo trên data thật lần đầu. Cần flag `isSample` hoặc tách seed demo vs prod.
- **B8 — PK collision (`db-seeder.ts:68,118`):** `id: LEAVE_${employeeId}_${date}` — 1 NV 2 đơn cùng ngày (sáng/chiều) → `bulkPut` đè im lặng. Dùng UUID hoặc `${emp}_${date}_${leaveType}_${session}`.
- **B9 — Seed lặp 3 nơi:** `index.ts` upgrade + `db-seeder.ts:89-122` + `db-sync.ts:217-247`. Idempotent nhờ cùng PK nhưng 2 tab đồng thời `count===0` → double-put race (vô hại nhưng phí).
- **B10 — Nuốt lỗi (`db-seeder.ts:124-128`):** `.modify(...).catch(()=>{})` nuốt lỗi quota/schema thật. Log tối thiểu.

### A3. Formula engine (`formula-engine.ts` vs `formula-defs.ts` vs `workers/formula-engine.worker.ts`)

**Đúng:** `buildCountBag` tách `Off` riêng khỏi `UL` (`formula-defs.ts:104-106`), fractional `W6/AL2` parse `formula-defs.ts:90-101`.

- **B11 — Probation sai format (`formula-engine.ts:184-194`):** chỉ `split('/')` hiểu `DD/MM/YYYY`. `EmployeeListPage.tsx:233-235,259` + `input[type=date]` lưu `YYYY-MM-DD`; `contractTerm` auto-calc ra `DD/MM/YYYY` (`EmployeeListPage.tsx:932`). Format lẫn → probation luôn `false` → tính thừa bonus nhóm 2 cho NV thử việc. Fix: dùng `parseDateLoose` chung, chuẩn hoá mọi date lưu `YYYY-MM-DD`.
- **B12 — Double-count Off (`formula-engine.ts:108-131`):** `missingPunchCnt` cộng `bag.countOff` khi `countedOff < bag.countOff` mà không trừ trường hợp `Off` đã đếm ở loop `95-96`, lệch case `Off` vs `OFF` → đếm 2 lần.
- **B13 — Lệch cột + mất live formula (`formula-defs.ts:121,123` vs `excel-exporter.ts:280-285`):** defs `colIndex 43=UL,43.5=Off` nhưng exporter header `43=Total Off,44=Total UL` + ghi `r43=Off,r44=UL`. Exporter ghi giá trị tĩnh, không ghi `FORMULA_DEFS.excelFormula` (`excel-exporter.ts:280-311`) → mất live `COUNTIF`. `DILIGENCE_FORMULA` default `J:AM` nhưng `CALENDAR_RANGE='I:AM'` (`formula-defs.ts:110,247`) lệch 1 cột; đã có setting `countRange` để vá nhưng default rủi ro.
- **B14 — Worker drift (P1 nặng):** `workers/formula-engine.worker.ts:78-179` thiếu `countOffAsUL`, `diligenceBaseOverride/productivityBaseOverride`, `productivityConfig` (`probationGetsBonus`, `deductULGroup2Rule`, `applyLineRates`, `useDepartmentOverride`), `lineRates`, `extraBonus/tradeUnionFee`, logic `Math.max(bag)`, thiếu alias `CT/TS/WO`. Hiện dead code (không ai import). Nếu bật sẽ cho số khác main thread. Fix: inline `formula-defs` chung hoặc xóa worker.
- **B15 — `||` thay `??` (`formula-engine.ts:161,177-178`, `excel-exporter.ts:228-230,237-239`, `TimesheetCalendarPage.tsx:237-240`):** `customAllowances.productivityBonus || defaultBaseRate` → `0` (ý không thưởng) bị ép thành `1.000.000`. Dùng `??` + check `>0` rõ ràng cho nhóm 2, `??` cho nhóm 1.
- **B16 — Regex fractional (`formula-defs.ts:90`):** `/^W(\d+)\/([A-Z]+)(\d+)$/i` không match `W/2 AL/2` có space (may handle riêng) và `W7/SL1` viết thường có space → rơi `countOff=0`, mất công/phép lẻ.

### A4. Pay-period / Calendar / Timezone

- **B17 — `pay-period.ts:8-21,104-109`:** `parseDateLoose` chuỗi có cả `/` và `-` (ISO datetime `2026-08-01T00:00`) → rẽ `/` trước → `NaN` → `null`. `daysUntil` dùng `Math.ceil((d-now)/864e5)` trên local-midnight → lệch ±1 quanh DST/giờ hiện tại. `Header.tsx:51,730-738` “còn N ngày” có thể sai 1.
- **B18 — So sánh string ngày:** `Header.tsx:322-336` (`ts.date >= maternityStartDate`), `DashboardPage.tsx:127,149` (`isInPayPeriod`) giả định `YYYY-MM-DD` lexicographic. Nếu `maternity/businessTrip` lưu `DD/MM/YYYY` (`EmployeeListPage.tsx:917-932`) → sai hoàn toàn.
- **B19 — Calendar tràn tháng (`calendar-utils.ts:43-65`):** OFFICIAL tháng trước ngắn (T3/2026, T2 28 ngày → `prevDaysCount=8`): cột `i=29,30,31` tràn sang tháng kế (`month+1`). Kỳ 21/02–20/03 chứa 01–03/04 → double-count aggregate theo `month/year` + hiển thị sai kỳ. SEASONAL `68-79` cũng tràn nhưng ít hại hơn.
- **B20 — Parser UTC/local lẫn (`workers/timesheet-parser.worker.ts:30-64,66-88`):** `parseExcelDate` `Date` +12h lấy `getUTC*` (hack pre-1975) vs `parseExcelTime` dùng `getHours` local → lệch 1 ngày/giờ khác múi giờ. `cellDates:false` nên nhánh `Date` hiếm chạy (code chết). `parseExcelTime` chỉ match `^(\d{1,2}):(\d{2})` → `7h30`, `0730`, `7.5` → `''` → thành MCO/MCI oan.
- **B21 — `month/year` 2 nguồn (`Header.tsx:313-320` vs `LeavePendingPage.tsx:102,141`):** Header gán theo `detectedMonth/Year` (kỳ detect từ `maxDate`), Leave gán theo calendar date. Query `[month+year]` (`db.test.ts:85-103`) trả khác nhau tùy đường ghi.

### A5. Import Excel — data-loss & race nặng nhất (`src/components/layout/Header.tsx:81-654`)

- **B22 — Xóa trước tính sau, không transaction (`Header.tsx:120-124`):** `clear()` 5 bảng (`dailyTimesheets, overtimeRecords, rawAttendanceLogs, leaveRequests, shiftRosters`) trước post-process. `try post-process catch` (`603-606`) chỉ `warning`, vẫn `bulkPut` partial `615-623` → mất kỳ cũ, mới dở dang. Fix P0: tính xong hết vào biến rồi mới `transaction` replace.
- **B23 — Không re-check quyền handler (`Header.tsx:81`):** nút Import ẩn bằng `hasPermission('IMPORT_LOGS')` (`761`) nhưng `handleFileChange` không re-check → gọi trực tiếp qua console bypass. OneDrive Export/Import (`791-867`) không check quyền gì → mọi role xuất/nhập snapshot đè toàn DB.
- **B24 — PK collision im lặng:** `timesheetMap.set(key)` (`timesheet-parser.worker.ts:273`), `overtimeMap.set` (`:295`), `overtimesToCreate.push` cùng `employeeId_date` (`Header.tsx:376-390,465-482`) rồi `bulkPut` → sau đè trước, mất giờ OT (2 dòng cùng NV-ngày: vào sớm + sau ca). `rawAttendanceLogs` `bulkAdd` `++id` nên OK.
- **B25 — Rest-violation O(N²) (`Header.tsx:540-595`):** khối 12h trong `for(ts)` rebuild `empTimesheetMap` mỗi vòng + push trùng N lần. `bulkPut` cùng PK nên KQ cuối 1 record nhưng phí + `restHours` từ `checkOut||shift.end` sai khi thiếu quẹt.
- **B26 — Sunday detect sai:** CN có in/out → `statusCode=''` (`366`) + OT Sunday (`374-391`). `isSunday` từ string `dayOfWeek` Excel (`timesheet-parser.worker.ts:224`), không phải từ `date` thật → file thiếu cột thứ → CN tính như ngày thường và ngược lại.
- **B27 — OT early-in cứng (`Header.tsx:454`):** `[start-90,start-60]` chỉ đúng ca 07:30 (06:00-06:30). Ca 06:00/14:00 sai. Note cứng `khung 6h-6h30` (`478`) gây hiểu nhầm.

### A6. DB sync snapshot (`src/services/db-sync.ts`)

**Đúng:** validate version 1.x–3.x, `pickArray` + đếm `skipped`, 1 transaction replace, `accounts` local-only không sync (`103-262`).

- **B28 — Resurrect sau clear (`187-211,217-247`):** snapshot thiếu `shiftClasses/rbacRoles/productionLines` (v2 cũ) → `clear()` xóa sạch rồi re-seed default → user cố xóa trống bị resurrect 4 ca + 2 lines ngoài ý muốn.
- **B29 — Inject quyền (`142-146`):** merge `{...DEFAULT,...imported}` chỉ check `rolePermissions` là object, không validate values → snapshot độc `{'QC Admin':['ALL_ACCESS']}` leo quyền sau `refreshPermissions()` (`Header.tsx:841`). Cần whitelist IDs như `SettingsPage.tsx:74-84`.
- **B30 — `scanTimestamp` locale string (`ocr-form-parser.ts:131`):** `toLocaleString('vi-VN')` trong khi index `[matchStatus+scanTimestamp]` sort lexicographic → `20/01/2026 > 03/12/2026` sai thứ tự. Lưu ISO + field display riêng.

### A7. OCR pipeline

- **B31 — `hr-rag-postprocessor.ts:120-124`:** `applyHRCorrections` replace toàn cục `O→0,l→1,S→5,Z→2` trên mọi cell (gọi ở `OCRVerificationPage.tsx:47-58,218` cho cả tên/lý do). Tên `Nguyen Van Long`, lý do `Bổ sung` bị corrupt. Chỉ áp dụng cho cell `employeeId/hours/date`.
- **B32 — `ocr-table-engine.ts:239-247`:** `_gridKey` cắt 2000 chars + hash 12 chars đầu mỗi cell → collision. Cache LRU 50 vĩnh viễn với key yếu.
- **B33 — `ocr-table-engine.ts:197-207`:** `classifyByContent` `/^\d{1,2}$/` → `stt` nuốt `hours=8`; `/^\d+(\.\d+)?$/` → `hours` nuốt `STT`; `HH:MM` đơn lẻ → `unknown` drop. Không header → sai cột, sửa tay.
- **B34 — `ocr-form-parser.ts:102-147`:** `commitVerifiedRows` chỉ `update` khi `existing` có, không `put` mới (`115-126`). `MISMATCH` vắng mặt (`reconcileRows:63-65`) → `scansWritten` tăng nhưng `updated` không → toast `OCRVerificationPage.tsx:498` báo `N dòng đã ghi` gây tưởng đã tạo OT. Quyết định: có tạo mới OT hay không + sửa message.
- **B35 — `ocr-form-parser.ts:111-124`:** `for...of await get/update` từng dòng trong transaction → chậm lô lớn; `mismatchReason: ... ? details : undefined` không xóa reason cũ khi sang MATCHED (Dexie `update` `undefined` = không xóa, cần `null`/delete tường minh).
- **B36 — `ocr-worker-client.ts:103-106`:** `terminateOcrWorker()` không reject queue chờ → promise treo. Worker `running` flag (`onnx-ocr.worker.ts:558-561`) từ chối chồng trong khi client xếp hàng tuần tự — dư nhưng an toàn.
- **B37 — `onnx-model-checker.ts:99-108,122-129`:** `HEAD` bị chặn ở nhiều host → WARNING giả dù `GET` OK. `accelSupported = simd || threads>=2 || webgpu` rồi UI `Hoạt động tốt` (`OCRVerificationPage.tsx:703`) ngay cả khi SIMD fail — che hiệu năng thật.
- **B38 — `OCRVerificationPage.tsx:156-203`:** persist `gridRows/formRows/batchMeta` vào `localStorage` (vài MB) → `QuotaExceededError` `catch{}` im lặng; restore `new File([],fileName)` (`172-178`) mất bytes gốc nhưng status `done` gây tưởng xong. `ocrCacheRef` `useRef(Map)` mất khi rời trang → quét lại từ đầu.

### A8. Misc backend

- `password.ts:10-14,84-104`: `generateSalt` `getRandomValues` OK, nhưng `sha256Hex` check `if(crypto.subtle)` — nếu `crypto` undefined (SSR/test) throw trước fallback. Single-round `SHA-256(salt:password)`, không iteration/pepper → brute-force nhanh. So sánh hằng thời gian tốt nhưng vô nghĩa khi hash nhanh.
- `presence-service.ts:16-17,72-74,178-197`: presence `localStorage` + `BroadcastChannel`, tin hoàn toàn, không auth — tab khác giả mạo `vinh/online`. `setInterval 8s` vĩnh viễn ngay cả chưa login, re-render `PresenceBar` mỗi 8s.
- `workers/onnx-ocr.worker.ts:80-97`: `fetchWithCache` nuốt lỗi `catch{}` rồi fallback `fetchArrayBuffer` → double-fetch khi cache miss.

---

## B. FRONTEND LOGIC NGHIỆP VỤ — RBAC, scope, flows

### B1. Guard tổng (`src/App.tsx:40-76`)

- Chỉ guard `settings`. Mọi page còn lại render cho bất kỳ session nào, không check `VIEW_*`. Dept admin thấy được nhưng không thao tác (fail-closed ở nút) — vừa leak view, vừa denial cho flow `PROPOSE`. Chưa login → `LoginScreen` (`40-42`), không có public bypass hiện tại.
- Tamper `sessionStorage.smarthr_session` (`AuthContext.tsx:128-133,158-162`, role plaintext không ký) → tự nâng `AD System` client là qua hết guard UI. Không server để chặn — chấp nhận local-first, ghi threat model.

### B2. Scope filtering — có vs thiếu

**Có scope đúng:** `TimesheetCalendarPage.tsx:85`, `OvertimePage.tsx:80`, `LeavePendingPage.tsx:39`, `ShiftRosterPage.tsx:40`, `ShiftAssignmentPage.tsx:125-126` (+ loại `OFFICE_M_F` + whitelist `SHIFT_ELIGIBLE_DEPARTMENTS` `ShiftAssignmentPage.tsx:44-45,122-124` — Finance/EHS/Logistics biến mất khỏi sắp ca, đúng yêu cầu hiện tại nhưng phải document), `EmployeeListPage.tsx:67`, `AttendanceViolationPage.tsx:45` (list only).

**Thiếu scope (leak):** Dashboard KPIs/dept chart/pending/top-violators toàn cty (`DashboardPage.tsx:83-281`), Sidebar badges (`Sidebar.tsx:46-51`), Header chuông HĐ (`Header.tsx:44,45-73`), export ALL không scope (`Header.tsx:659`), Attendance stats (`AttendanceViolationPage.tsx:77-84` đếm global trong khi list có scope → KPI global nhưng list rỗng, mâu thuẫn), ShiftRoster total (`ShiftRosterPage.tsx:28,54-56`), OCR load toàn bộ (`OCRVerificationPage.tsx:146-147`, `reconcileRows` không lọc dept), ProductivityQuality (mục B3).

### B3. Vượt quyền / thiếu quyền từng page

| # | Vị trí | Vấn đề |
|---|---|---|
| F3 | Overtime/Leave/OCR/Attendance | Dept propose-flow chết: `OvertimePage.tsx:143` đòi `MANAGE_OT` (dept có `PROPOSE_DEPT_OT`), `LeavePendingPage.tsx:54,167` đòi `MANAGE_LEAVE` (dept có `VIEW_DEPT_LEAVE`), `OCRVerificationPage.tsx:143,490,603` đòi `SCAN_OCR` (dept có `SCAN_DEPT_OCR`), `AttendanceViolationPage.tsx:87` đòi `MANAGE_TIMESHEET\|\|MANAGE_LEAVE` → dept không duyệt được NV mình. Chỉ `ShiftAssignmentPage.tsx:178,251` check đúng cả 2 (`MANAGE_ROSTER\|\|MANAGE_DEPT_ROSTER`). |
| F4 | `ShiftRosterPage.tsx:60` vs `ShiftAssignmentPage.tsx:178` | Fix violation đòi `MANAGE_ROSTER` duy nhất → dept có `MANAGE_DEPT_ROSTER` không fix được ca của chính mình. Không nhất quán. |
| F5 | `SettingsPage.tsx:97-123,157,280` | Toggle RBAC: `isGranted = includes(perm)\|\|includes('ALL_ACCESS')`; revoke 1 quyền khỏi role có `ALL_ACCESS` thì filter bỏ cả `ALL_ACCESS` (`108`) → 1 click hạ cả role. Nút `AD System/SYSTEM_SETTINGS` `disabled` (`280`) nhưng `handleTogglePermission` không re-check ngoài `canManageRBAC` → gọi trực tiếp vẫn đổi. Guard `157` `if(!canManageSystem && currentRole!=='AD System')` → `AD System` custom bị xóa SYSTEM_SETTINGS vẫn lọt qua nhờ OR. |
| F6 | `EmployeeListPage.tsx:580-586,123-142` | **P0 vượt quyền rõ ràng:** nút Edit bút chì không `hasPermission`, `handleSaveEmployee` không check → dept sửa được lương/phụ cấp/hợp đồng/shift. Add/Resign/Delete có check (`284,571,587,596`). Scope filter `65-69` chỉ lọc view. |
| F7 | `ProductivityQualityPage.tsx:91-180,237,416-418` | **P0:** `handleSaveRate/CreateLine/BatchFill/DeleteLine` không check gì. Chỉ nút Thêm Line ẩn bằng `MANAGE_EMPLOYEES` (`237`). Ai vào page cũng `put/delete` qua console/blur. Rates per-line không per-dept — chấp nhận được nhưng phải ghi rõ. |
| F8 | `OvertimePage.tsx:185-207` | `handleOpenCellModal` check `MANAGE_OT` nhưng `handleSaveOtRecord` không re-check → TOCTOU. `verifiedAt` giờ client, `verifiedBy` không lưu ở đây (chỉ OCR commit) → mất audit. `hours<=0` record mới `return` im lặng (`196-199`). |
| F9 | `TimesheetCalendarPage.tsx:61-81,142-181,418-459` | `handleClear` check `MANAGE_TIMESHEET` đúng nhưng không scope — xóa 5 bảng toàn cty. `handleCellClick/SaveCell` check đúng + filter có scope (`85`) nên dept chỉ sửa dept mình — đúng. Nhưng `isVio` (`168`) gồm `Off/OFF`, modal cho chuyển sang `W` xóa violation không audit ngoài `violationNote`. |
| F10 | Xem B2 | Stats global vs list scope mâu thuẫn. `onlyPending` (`68-71`) `isViolation!==false` trong khi `handleApprove` set `false` (`91-97`) — cell `W` `undefined` cũng `!==false` (may filter code LA/ED/MCO/MCI trước nên OK, nhưng giòn). |
| F11 | `ShiftRosterPage.tsx:27-28` | `selectedDate` không dùng; `selectedDept` default `Production` trong khi WH/QC bị scope ép → mở trang rỗng, phải tự đổi (filter vẫn cho ALL dù bị scope — UX nhầm). |
| F12 | `LeavePendingPage.tsx:65-68,71-122,102` | `dayIndex: parseInt(date.split('-')[2])` đúng SEASONAL, sai OFFICIAL (cần `generateCalendarDays`). `month/year` từ calendar date trong khi Timesheet OFFICIAL nhóm pay-period → cell sau duyệt rơi ngoài 31 cột đang xem. Quota check 2 lớp UI + transaction re-check là **đúng** (chống race 2 tab trừ âm). `durationDays` có thể `0.25` (2h/8) nhưng type comment `1 hoặc 0.5` (`types/index.ts:183`) — doc sai. |
| F13 | `EmployeeListPage.tsx:94-100,98` | `employeeId: LEP${(length+1).padStart(3)}` → xóa rồi thêm → PK trùng → `put` đè NV cũ. `startDate` default `toLocaleDateString('en-GB')` = `DD/MM/YYYY` (`100`) lẫn format (B11/B18). Tạo NV `department: departmentScope\|\|'Production'` đúng scope nhưng select modal vẫn cho dept khác → vượt scope. |
| F14 | `DashboardPage.tsx:291` | `displayName = session?.displayName \|\| 'Mia Kiều'` — fallback tên thật khi chưa login (không hiển thị vì guard, nhưng lộ tên trong bundle/snapshot). |
| F15 | `Header.tsx:656-684` | `handleExportExcel` dùng `now` thay vì `selectedMonth` đang xem → xem T8 xuất ra T9. `exportTimesheetToExcel(...,curMonth,curYear,'ALL',...)` luôn ALL 2 sheets toàn `emps` không scope (`659`) → dept xuất toàn cty. |

---

## C. LOGIC TẠM TEST-ROLE / PUBLIC — Không cảnh báo phiên này (theo yêu cầu user)

- **Không có public bypass:** `App.tsx:40-42` bắt buộc session; không route ẩn/test-role switcher. Sidebar Settings ẩn bằng permission (`Sidebar.tsx:203`), App double-guard (`56-76`).
- **Không có TODO/FIXME/XXX/HACK trong `src` (grep 0 hit).**
- **Hardcoded / weak creds — ghi nhận, để lại để test, không fix phiên này:**
  - `AuthContext.tsx:27-28,60-80`: `DEFAULT_ADMIN_USERNAME='vinh'`, `DEFAULT_ADMIN_PASSWORD='123'` (const sau không dùng). Seed `vinh/123 (AD System)`, `kieu/123 (HR Manager)`, `admin/admin123`.
  - `AuthContext.tsx:46-57`: nhánh `else` ghi đè pass+role về `123` mỗi boot (làm `changePassword` vô nghĩa) — để lại phiên này, khi lên prod chỉ seed khi `!existing`.
  - `LoginScreen.tsx:110-145`: quick-login điền sẵn `vinh/123`, `kieu/123` + text quyền + footer. Khi prod bọc `import.meta.env.DEV` hoặc xóa. Placeholder `ví dụ: admin` (`54`) gợi ý account legacy.
  - `presence-service.ts:19-23`: `USER_COLORS` cứng `vinh/kieu/admin` — chuyển hash-based khi prod. `PresenceBar.tsx:136` gợi ý “đăng nhập Vinh hoặc Kiều”.
  - Test assert `vinh/123`, `kieu/123` (`test/auth-rbac-presence.test.ts:14-31`, `db.test.ts`), message `App.tsx:66`, `SettingsPage.tsx:165-166` nhắc tên — khi đổi seed prod phải update sang role generic.
  - `AuthContext.tsx:176,228`: alias `kiều→kieu`, `createAccount` đòi `>=6` nhưng seed `123` bypass. Khi prod enforce `>=8` + khác `123/admin123`.
  - Sample/demo còn sót: `db-seeder.ts:25` comment sample, `OCRVerificationPage.tsx:510-526` `handleSampleImage` fetch `/image.png` (nút đã ẩn, dead code nên xóa khi prod), `OcrSpreadsheetPreview.tsx` threshold `<0.75` magic constant cần document.

---

## D. Checklist fix đề xuất (ưu tiên cho agy cli)

1. **P0 — Data loss:** bọc import Header “tính xong mới clear” trong `transaction` (B22); bọc seeder trong `transaction` (B6); re-check quyền trong `handleFileChange`/OneDrive (B23).
2. **P0 — Vượt quyền (làm ngay cả khi test-role):** thêm `hasPermission` vào nút Edit + `handleSaveEmployee` (F6); 4 handlers ProductivityQuality (F7); re-check trong `handleSaveOtRecord` (F8).
3. **P0 — Auth (defer theo yêu cầu phiên này, bắt buộc trước prod):** bỏ ghi đè pass mỗi boot (H2); gate quick-login sau `DEV` (H3); đổi seed `123` → random + bắt đổi lần đầu.
4. **P1 — Scope leak:** thêm `departmentScope` vào Dashboard KPIs, Sidebar badges (badge theo scope), Header export/notifs, Attendance stats, OCR reconcile (F2/F10/F15).
5. **P1 — RBAC dept:** định nghĩa `PROPOSE_DEPT_OT/SCAN_DEPT_OCR/VIEW_DEPT_*` trong mọi `hasPermission` check hoặc map `MANAGE_DEPT_*` → `MANAGE_*` khi cùng dept (F3/F4). Validate `rolePermissions` import whitelist (B29).
6. **P1 — Date/format:** chuẩn hoá mọi date lưu `YYYY-MM-DD` (maternity/trip/contract/probation), sửa probation split + string-compare (B11/B18); fix `parseDateLoose` với datetime có `T` (B17); fix calendar OFFICIAL tràn tháng (B19).
7. **P2 — Formula/worker:** xóa hoặc đồng bộ `formula-engine.worker.ts` (B14); exporter ghi Excel formulas hoặc document “static values” (B13); `??` thay `||` cho baseRate 0 (B15).
8. **P2 — OCR correctness:** giới hạn `applyHRCorrections` cho field code/date/hours (B31); tăng cường `_gridKey` hash toàn grid (B32); quyết định `commitVerifiedRows` có tạo mới OT + sửa message (B34); lưu `scanTimestamp` ISO (B30); `terminateOcrWorker` reject queue (B36).
9. **P2 — Settings reset lockout:** `handleResetDatabase` (`SettingsPage.tsx:135-155`) sau `db.delete/open` không reseed accounts → lockout. Gọi `ensureDefaultAccounts()` (bản đã fix H2) + `seedDatabaseIfEmpty` cùng flow, hoặc chặn khi chưa backup.

---

## E. Phụ lục — File đã đọc để kết luận

`src/db/index.ts`, `src/types/index.ts`, `src/App.tsx`, `src/context/AuthContext.tsx`, `src/services/db-seeder.ts`, `src/services/formula-engine.ts`, `src/services/formula-defs.ts`, `src/services/pay-period.ts`, `src/services/calendar-utils.ts`, `src/services/presence-service.ts`, `src/services/db-sync.ts`, `src/services/excel-exporter.ts`, `src/services/password.ts`, `src/services/ocr-table-engine.ts`, `src/services/ocr-form-parser.ts`, `src/services/hr-rag-postprocessor.ts`, `src/services/ocr-worker-client.ts`, `src/services/onnx-model-checker.ts`, `src/components/layout/Header.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/auth/LoginScreen.tsx`, `src/pages/*` (Dashboard, EmployeeList, TimesheetCalendar, ProductivityQuality, Overtime, LeavePending, ShiftRoster, ShiftAssignment, AttendanceViolation, OCRVerification, Settings), `src/workers/*`, `src/db/db.test.ts`, `src/test/*`.

---

## F. FIX OFFLINE FILE:// — Paddle trực tiếp không Worker (2026-09-09, đã build + test qua)

**Mục tiêu:** đặt `dist/` + `PaddleOCR-Models/` vào `C:\Users\bbuvqp1\OneDrive - Leggett & Platt, Incorporated\HR-System`, double-click `index.html` (file://) chạy offline đầy đủ, Paddle lấy model trực tiếp từ file/IndexedDB, không qua Web Worker.

**Đã sửa:**
- `vite.config.ts`: thêm `base: './'`; `index.html`: mọi asset về `./` tương đối.
- `src/services/onnx-model-checker.ts`: bỏ 8 path tuyệt đối `/PaddleOCR-Models` → `./` tương đối; HEAD → GET (đọc header rồi hủy body, tránh host chặn HEAD); cộng kiểm tra kho IndexedDB; thêm field `protocol/assetSource/needsOfflineAssets`. dist verify: 0 ref tuyệt đối.
- Mới `src/services/ocr-assets-store.ts`: DB riêng `HRSystem_OCRAssets` (không bump schema chính), `isFileProtocol/canUseWorker/guessOcrAssetKey`, cache det/rec/dict/wasm.
- Mới `src/services/ocr-engine-direct.ts`: pipeline DBNet+CTC thật trên main thread (canvas document, model IDB → fetch tương đối, vá fetch wasm runtime khi file://, ép 1 luồng khi thiếu COOP/COEP).
- `src/services/ocr-worker-client.ts`: `runOcrPipeline` tự chọn Worker (http) / direct (file://, Worker hỏng, `forceDirect`); giữ buffer backup vì postMessage detach; `terminateOcrWorker` reject queue đang chờ (fix luôn B36).
- `src/pages/OCRVerificationPage.tsx`: nút "Nạp model offline (N mục)" chỉ hiện trên file://; Test OCR cảnh báo khi `needsOfflineAssets`; modal hiện nguồn model; `handleSampleImage` `/image.png` → `./image.png`.
- Verify: `npm run build` qua (tsc+vite, index.html 2.29MB), `npx vitest run` 8 files/118 tests pass.

**Vận hành:** copy `dist/*` vào thư mục OneDrive HR-System (giữ cấu trúc `PaddleOCR-Models/` cạnh `index.html`). Lần đầu trên máy mới: mở trang OCR → bấm "Nạp model offline" → chọn 5 file (det/rec .onnx, latin_dict.txt, vi_dict.txt, ort-wasm .wasm) → các lần sau quét luôn. Trên `npm run dev` (localhost) mọi thứ như cũ qua Worker.
**Còn lại (ngoài scope đợt này):** `timesheet-parser.worker.ts` (import Excel ở Header) cũng không chạy được trên file:// — khi offline file:// mà import Excel lỗi thì làm fallback main-thread tương tự.
