# HR-System: Kế Hoạch Triển Khai Chi Tiết & Check-list Step-by-Step

## 1. Tổng Quan Mục Tiêu
Phát triển hệ thống phân tích và quản lý nhân sự - chấm công - tăng ca - OCR - xuất báo cáo chốt công hoàn chỉnh (**HR-System**):
- **Giao diện**: Clone nguyên bản bố cục, UX/UI, animation từ `Modern HRMS Attendance Dashboard (Community).zip`, chuyển toàn bộ bảng màu sang gam màu **Gold & Wood Hoàng Gia / Sang Trọng** (`#1e1915`, `#2b241e`, `#c59724`, `#d4af37`, `#fbf9f5`).
- **Logo thương hiệu**: `Leggett.jpg` đặt tại góc trái Header và nhúng vào Header file Excel xuất ra.
- **Đa ngôn ngữ**: Chuyển đổi linh hoạt **Tiếng Việt 🇻🇳 / English 🇬🇧** bằng nút gạt nhanh ở header.
- **Xử lý dữ liệu & Bộ đệm (Cache)**: Hoạt động 100% Offline, tích hợp IndexedDB + in-memory cache để load tức thì và truy xuất siêu tốc trên tập dữ liệu lớn (>20.000 dòng chấm công).
- **Bộ máy tính toán**: Bám sát 100% logic công thức từ `KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx` và dữ liệu đầu vào `2107-20082026.xlsx`.
- **Phân loại ca & Cảnh báo bất thường**:
  - Ca hành chính (07:30 - 16:00), Ca 1 (06:00 - 14:00), Ca 2 (14:00 - 22:00), Ca Đêm (22:00 - 06:00).
  - Tự động phát hiện đi trễ / về sớm, cảnh báo không bấm giờ vào/ra, cảnh báo nghỉ không phép.
  - Phân tách linh hoạt kỳ công: Kỳ 21–20 (Chính thức) và Kỳ 1–31 (Thời vụ) cùng danh sách Thai sản / Nghỉ đặc biệt.
- **Quản lý Nhân viên & Phụ cấp & Phép năm**:
  - Quản lý số dư phép năm còn lại. Cảnh báo ngay trên bảng chấm công nếu chấm phép `AL` khi nhân viên đã hết phép.
  - Cấu hình phụ cấp theo chức vụ / đặc thù (Phụ cấp PCCC 992.000đ, Độc hại 13.000đ/ngày, Năng suất, Chuyên cần 500.000đ giảm trừ theo ngày nghỉ UL, Đoàn phí -40.000đ).
- **Phân hệ Tăng ca (OT) & Tích hợp PaddleOCR**:
  - Bảng OT theo dõi số giờ làm thêm sau 16:00 và ngày Chủ nhật (màu vàng chờ đối soát).
  - Module OCR bốc tách tự động giấy thỏa thuận tăng ca (`image.png`), trích xuất Mã NV, Ngày OT, Giờ bắt đầu/kết thúc, Số giờ OT.
  - Đối soát tự động: Khớp lệnh giấy tờ hợp lệ -> **Báo Xanh**. Sai lệch -> Animation nhấp nháy / cảnh báo hover tooltip chi tiết.
- **Xuất file Excel chuẩn**: Xuất ra file Excel đa sheet đúng 100% cấu trúc file mẫu với logo Leggett & Platt ở góc trái.

---

## 2. Danh Sách Công Việc Chi Tiết (Checklist Đã Hoàn Thành)

- [x] **Bước 1**: Khảo sát & phân tích cấu trúc dữ liệu input (`2107-20082026.xlsx`), output (`KIỂM TRA CHÔT CÔNG THÁNG 08.2026.xlsx`), UI template zip, ảnh OT (`image.png`), và logo (`Leggett.jpg`).
- [x] **Bước 2**: Thiết lập `agent.md`, `plan.md`, `state.json` và quy chuẩn chất lượng code.
- [x] **Bước 3**: Khởi tạo cấu trúc dự án Next.js / Vite React với Tailwind CSS v4, bộ icon Lucide, Radix UI và Theme Gold & Wood sang trọng.
- [x] **Bước 4**: Xây dựng Engine Data Parser & Offline Cache (IndexedDB + In-Memory) hỗ trợ đọc file Excel tự động hoặc tải lên thủ công, bốc tách mã nhân viên làm UUID.
- [x] **Bước 5**: Xây dựng Engine Chấm Công (Attendance Engine) xử lý ca làm việc (Hành chính, Ca 1, Ca 2), kiểm tra đi trễ / về sớm, thiếu bấm giờ, tính toán đầy đủ các loại công (W, AL, UL, SL, PL, PH, BT, N, Maternity) và kỳ công (21–20 vs 1–31).
- [x] **Bước 6**: Xây dựng Giao diện Dashboard & Bảng Chấm Công Tháng (Monthly Attendance Report) với đầy đủ bộ lọc, chuyển đổi chế độ xem Tổng hợp / Chi tiết, bảng ký hiệu, trạng thái cảnh báo và nút đổi ngôn ngữ EN/VI.
- [x] **Bước 7**: Xây dựng Phân hệ Quản Lý Nhân Viên, Phụ Cấp (PCCC, Độc hại, Chuyên cần, Năng suất) và Quản Lý / Cảnh Báo Số Dư Phép Năm.
- [x] **Bước 8**: Xây dựng Phân hệ Bảng Tăng Ca (Monthly Overtime Report) tính toán tự động giờ làm thêm sau 16:00 và Chủ nhật.
- [x] **Bước 9**: Xây dựng Module OCR Scan & Thuật toán bốc tách dữ liệu phiếu tăng ca (`image.png`), tự động đối soát và đổi màu xanh / cảnh báo animation khi sai lệch.
- [x] **Bước 10**: Xây dựng Module Xuất Excel chuẩn 100% khớp file mẫu gốc kèm chèn logo `Leggett.jpg` ở Header.
- [x] **Bước 11**: Kiểm thử toàn diện (End-to-End Testing), tối ưu hóa hiệu năng cache, xác thực công thức đối chiếu với dữ liệu thực tế và hoàn thiện tài liệu hướng dẫn.
