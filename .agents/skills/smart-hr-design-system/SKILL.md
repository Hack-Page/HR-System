---
name: smart-hr-design-system
description: Design tokens, UI component specifications, color palettes, charts, and typography extracted from SmartHR Figma Kit and Leggett & Platt standards.
---

# SmartHR Design System Specification

## 1. Typography System
- **Primary Font Family**: `'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Scale Hierarchy**:
  - **Display (Hero/KPI)**: `32px`, `font-bold` (`font-weight: 700`), `line-height: 1.2`
  - **Heading 1 (Page Title)**: `24px`, `font-semibold` (`font-weight: 600`), `line-height: 1.3`
  - **Heading 2 (Card Title)**: `18px` - `20px`, `font-semibold` (`font-weight: 600`), `line-height: 1.4`
  - **Heading 3 (Section Header)**: `15px` - `16px`, `font-semibold` (`font-weight: 600`), `line-height: 1.4`
  - **Body 1 (Table cells, Inputs)**: `14px`, `font-normal` (`font-weight: 400` / `500`), `line-height: 1.5`
  - **Body 2 (Secondary text)**: `13px`, `font-normal` (`font-weight: 400`), `line-height: 1.4`
  - **Caption / Badges**: `11px` - `12px`, `font-medium` (`font-weight: 500`), `letter-spacing: 0.02em`

## 2. Color Palette & Semantic Tokens
- **Brand Identity**:
  - Primary Accent: `#FF902F` to `#FC6075` (SmartHR Coral Gradient)
  - Primary Corporate: `#002D62` (Leggett Corporate Navy)
  - Sidebar / Header Dark: `#1E293B` (Slate-800) / `#0F172A` (Slate-900)
  - App Background: `#F8FAFC` (Slate-50)
  - Card / Panel Surface: `#FFFFFF` with Border `#E2E8F0`
- **Attendance & Timesheet Status Badges (as seen in `image.png` & Excel)**:
  - **'W' (Present / Full Day)**: Text `#065F46`, Bg `#D1FAE5`, Border `#A7F3D0`
  - **'N' (Night Shift)**: Text `#3730A3`, Bg `#E0E7FF`, Border `#C7D2FE`
  - **'Off' (Absent / No Punch)**: Text `#991B1B`, Bg `#FEE2E2`, Border `#FECACA`
  - **'WO' (Weekly Off / Weekend)**: Text `#5B21B6`, Bg `#EDE9FE`, Border `#DDD6FE`
  - **'AL' (Annual Leave)**: Text `#1E40AF`, Bg `#DBEAFE`, Border `#BFDBFE`
  - **'UL' (Unpaid Leave)**: Text `#475569`, Bg `#F1F5F9`, Border `#E2E8F0`
  - **'SL' (Sick Leave)**: Text `#9D174D`, Bg `#FCE7F3`, Border `#FBCFE8`
  - **'PL' (Paid Special Leave)**: Text `#065F46`, Bg `#CCFBF1`, Border `#99F6E4`
  - **'BT' (Business Trip)**: Text `#075985`, Bg `#E0F2FE`, Border `#BAE6FD`
- **Overtime Verification State Colors**:
  - **Pending Verification (Raw Import)**: Bg `#FEF3C7` (Soft Amber), Text `#92400E`
  - **OCR Verified / Matched**: Bg `#D1FAE5` (Soft Emerald), Text `#065F46`
  - **OCR Discrepancy / Mismatch**: Bg `#FEE2E2` (Soft Rose), Text `#991B1B`
- **Shift Violation (<12h Rest)**:
  - Badge: Pulsing `#DC2626` (Red-600) with Tooltip warning `Nghỉ < 12h giữa 2 ca`

## 3. UI Component Patterns
- **Timesheet Matrix Table**:
  - Sticky left columns: `#` (STT Badge), `Mã NV`, `Họ tên & Avatar badge`, `Phòng ban Pill`.
  - Horizontal scrollable 31 calendar day columns.
  - Sticky right formula summary columns (`Công chuẩn`, `Công thực tế`, `Phép năm`, `Không lương`, `Phụ cấp`, v.v.).
- **Zero Browser Dialogs Rule**:
  - All alerts, confirms, and errors must render as Toast notifications (Top-right stackable) or Modal Dialogs with backdrop blur.
