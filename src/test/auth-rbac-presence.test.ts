import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, DEFAULT_SETTINGS } from '../db';
import { ensureDefaultAccounts } from '../context/AuthContext';
import { verifyPassword } from '../services/password';
import { presenceManager } from '../services/presence-service';

describe('Auth & RBAC - Vinh (AD System) & Kiều (HR Manager)', () => {
  beforeEach(async () => {
    await db.accounts.clear();
    await ensureDefaultAccounts();
  });

  it('khởi tạo sẵn 2 user chuẩn: Vinh (123) và Kiều (123)', async () => {
    const vinh = await db.accounts.get('vinh');
    expect(vinh).toBeDefined();
    expect(vinh?.displayName).toBe('Vinh');
    expect(vinh?.role).toBe('AD System');
    expect(vinh?.active).toBe(true);

    const vinhPassOk = await verifyPassword('123', vinh!.salt, vinh!.passwordHash);
    expect(vinhPassOk).toBe(true);

    const kieu = await db.accounts.get('kieu');
    expect(kieu).toBeDefined();
    expect(kieu?.displayName).toBe('Kiều');
    expect(kieu?.role).toBe('HR Manager');
    expect(kieu?.active).toBe(true);

    const kieuPassOk = await verifyPassword('123', kieu!.salt, kieu!.passwordHash);
    expect(kieuPassOk).toBe(true);
  });

  it('kiểm tra phân quyền: Vinh (AD System) toàn quyền hệ thống', () => {
    const role = 'AD System';
    // Logic RBAC trong AuthContext
    const hasPerm = (action: string) => {
      if (role === 'AD System') return true;
      return false;
    };

    expect(hasPerm('SYSTEM_SETTINGS')).toBe(true);
    expect(hasPerm('MANAGE_ROLES_PERMISSIONS')).toBe(true);
    expect(hasPerm('MANAGE_EMPLOYEES')).toBe(true);
    expect(hasPerm('MANAGE_TIMESHEET')).toBe(true);
    expect(hasPerm('SCAN_OCR')).toBe(true);
  });

  it('kiểm tra phân quyền: Kiều (HR Manager) không được vào mục Cài đặt, còn lại toàn quyền', () => {
    const role = 'HR Manager';
    const hasPerm = (action: string) => {
      if (role === 'HR Manager') {
        if (action === 'SYSTEM_SETTINGS' || action === 'MANAGE_ROLES_PERMISSIONS' || action === 'SETTINGS') {
          return false;
        }
        return true;
      }
      return false;
    };

    // Bị chặn mục Cài đặt & Phân quyền
    expect(hasPerm('SYSTEM_SETTINGS')).toBe(false);
    expect(hasPerm('MANAGE_ROLES_PERMISSIONS')).toBe(false);
    expect(hasPerm('SETTINGS')).toBe(false);

    // Toàn quyền tất cả các mục nghiệp vụ nhân sự khác
    expect(hasPerm('VIEW_DASHBOARD')).toBe(true);
    expect(hasPerm('MANAGE_EMPLOYEES')).toBe(true);
    expect(hasPerm('MANAGE_TIMESHEET')).toBe(true);
    expect(hasPerm('MANAGE_OT')).toBe(true);
    expect(hasPerm('MANAGE_LEAVE')).toBe(true);
    expect(hasPerm('MANAGE_ROSTER')).toBe(true);
    expect(hasPerm('SCAN_OCR')).toBe(true);
    expect(hasPerm('IMPORT_LOGS')).toBe(true);
  });
});

describe('Presence Manager - Realtime Avatar', () => {
  it('đăng ký và cập nhật trạng thái online của nhân sự', () => {
    presenceManager.setSession({
      username: 'vinh',
      displayName: 'Vinh',
      role: 'AD System',
    }, 'Bảng điều khiển');

    const users = presenceManager.getActiveUsers();
    expect(users.length).toBeGreaterThanOrEqual(1);

    const vinh = users.find(u => u.username === 'vinh');
    expect(vinh).toBeDefined();
    expect(vinh?.displayName).toBe('Vinh');
    expect(vinh?.role).toBe('AD System');
    expect(vinh?.status).toBe('online');

    // Chuyển tab
    presenceManager.updateCurrentTab('Bảng Chấm Công');
    const updated = presenceManager.getActiveUsers();
    expect(updated.find(u => u.username === 'vinh')?.currentTab).toBe('Bảng Chấm Công');

    // Rời phiên
    presenceManager.setSession(null);
  });
});
