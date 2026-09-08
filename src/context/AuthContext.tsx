import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RoleType, ISystemSettings, IAccount, SessionUser } from '../types';
import { db, DEFAULT_SETTINGS } from '../db';
import { generateSalt, hashPassword, verifyPassword } from '../services/password';

interface AuthContextType {
  /** Phiên đăng nhập hiện tại; null = chưa đăng nhập */
  session: SessionUser | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  createAccount: (username: string, displayName: string, role: RoleType, password: string) => Promise<{ ok: boolean; error?: string }>;
  currentRole: RoleType | null;
  departmentScope: string | null; // null for company-wide, or 'WH', 'Production', 'QC'
  hasPermission: (action: string) => boolean;
  rolePermissions: ISystemSettings['rolePermissions'];
  systemSettings: ISystemSettings;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'smarthr_session';

/** Tài khoản mặc định khởi tạo lần đầu */
export const DEFAULT_ADMIN_USERNAME = 'vinh';
const DEFAULT_ADMIN_PASSWORD = '123';

export async function ensureDefaultAccounts(): Promise<void> {
  const seedUser = async (username: string, displayName: string, role: RoleType, pass: string) => {
    const existing = await db.accounts.get(username);
    if (!existing) {
      const salt = generateSalt();
      const account: IAccount = {
        username,
        displayName,
        role,
        salt,
        passwordHash: await hashPassword(pass, salt),
        active: true,
        activeFlag: 1,
        createdAt: new Date().toISOString(),
      };
      await db.accounts.put(account);
    } else {
      // Cập nhật đảm bảo mật khẩu & role chính xác theo cấu hình
      const salt = generateSalt();
      await db.accounts.update(username, {
        displayName,
        role,
        salt,
        passwordHash: await hashPassword(pass, salt),
        active: true,
        activeFlag: 1,
      } as any);
    }
  };

  // 1. User: Vinh ; mật khẩu: 123 ; role: Admin system (toàn quyền)
  await seedUser('vinh', 'Vinh', 'AD System', '123');

  // 2. User: Kiều ; mật khẩu: 123 ; role: HR manager (toàn quyền trừ cài đặt)
  await seedUser('kieu', 'Kiều', 'HR Manager', '123');

  // 3. Tài khoản admin legacy
  const existingAdmin = await db.accounts.get('admin');
  if (!existingAdmin) {
    const salt = generateSalt();
    await db.accounts.put({
      username: 'admin',
      displayName: 'Quản trị hệ thống',
      role: 'AD System',
      salt,
      passwordHash: await hashPassword('admin123', salt),
      active: true,
      activeFlag: 1,
      createdAt: new Date().toISOString(),
    });
  }
}

function getDepartmentScope(role: RoleType): string | null {
  switch (role) {
    case 'Warehouse Admin':
      return 'WH';
    case 'Production Admin':
      return 'Production';
    case 'QC Admin':
      return 'QC';
    default:
      return null;
  }
}

/**
 * Kiểm tra quyền NGHIÊM NGẶT theo ma trận RBAC:
 *  - AD System: Toàn quyền hệ thống
 *  - HR Manager: Toàn quyền NGOẠI TRỪ mục Cài đặt (SYSTEM_SETTINGS, MANAGE_ROLES_PERMISSIONS, SETTINGS)
 *  - Các vai trò khác: Theo quyền khai báo trong ma trận
 */
function makeHasPermission(role: RoleType | null, permissions: ISystemSettings['rolePermissions']) {
  return (action: string): boolean => {
    if (!role) return false;

    // Yêu cầu: HR Manager không được thao tác mục Cài đặt trong hệ thống, còn lại toàn quyền
    if (role === 'HR Manager') {
      if (action === 'SYSTEM_SETTINGS' || action === 'MANAGE_ROLES_PERMISSIONS' || action === 'SETTINGS') {
        return false;
      }
      return true; // Toàn quyền các mục còn lại
    }

    // Yêu cầu: AD System toàn quyền hệ thống
    if (role === 'AD System') {
      return true;
    }

    const perms = permissions[role] || [];
    return perms.includes('ALL_ACCESS') || perms.includes(action);
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SessionUser | null>(() => {
    // Khôi phục phiên trong cùng tab (sessionStorage - đóng tab là hết)
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      return null;
    }
  });

  // RBAC từ Dexie settings (hybrid: Dexie > localStorage > DEFAULT)
  const dbSettingsEntry = useLiveQuery(() => db.settings.get('systemSettings'), []);

  const [systemSettings, setSystemSettings] = useState<ISystemSettings>(() => {
    const saved = localStorage.getItem('smarthr_settings');
    if (saved) {
      try { return JSON.parse(saved) as ISystemSettings; } catch { /* ignore */ }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    if (dbSettingsEntry?.value) {
      setSystemSettings(dbSettingsEntry.value as ISystemSettings);
      localStorage.setItem('smarthr_settings', JSON.stringify(dbSettingsEntry.value));
    }
  }, [dbSettingsEntry]);

  // Khởi tạo các tài khoản mặc định (Vinh, Kiều, admin) đúng một lần
  useEffect(() => {
    ensureDefaultAccounts().catch(console.error);
  }, []);

  const persistSession = (s: SessionUser | null) => {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
    setSession(s);
  };

  const currentRole = session?.role ?? null;
  const rolePermissions = systemSettings?.rolePermissions || DEFAULT_SETTINGS.rolePermissions;
  const hasPermission = useCallback(
    makeHasPermission(currentRole, rolePermissions),
    [currentRole, rolePermissions]
  );

  const login = useCallback(async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    let uname = username.trim().toLowerCase();
    if (!uname || !password) return { ok: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' };

    // Hỗ trợ gõ cả Kiều có dấu hoặc kieu không dấu
    if (uname === 'kiều') uname = 'kieu';

    let account = await db.accounts.get(uname);
    if (!account) {
      account = await db.accounts.filter(a => a.username.toLowerCase() === uname || a.displayName.toLowerCase() === uname).first();
    }

    if (!account || !account.active) {
      return { ok: false, error: 'Tài khoản không tồn tại hoặc đã bị khóa' };
    }

    const valid = await verifyPassword(password, account.salt, account.passwordHash);
    if (!valid) return { ok: false, error: 'Mật khẩu không đúng' };

    await db.accounts.update(account.username, { lastLoginAt: new Date().toISOString() });
    const s: SessionUser = { username: account.username, displayName: account.displayName, role: account.role };
    persistSession(s);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    persistSession(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!session) return { ok: false, error: 'Chưa đăng nhập' };
    if (newPassword.length < 6) return { ok: false, error: 'Mật khẩu mới phải tối thiểu 6 ký tự' };

    const account = await db.accounts.get(session.username);
    if (!account) return { ok: false, error: 'Không tìm thấy tài khoản' };

    const valid = await verifyPassword(currentPassword, account.salt, account.passwordHash);
    if (!valid) return { ok: false, error: 'Mật khẩu hiện tại không đúng' };

    const salt = generateSalt();
    await db.accounts.update(session.username, {
      salt,
      passwordHash: await hashPassword(newPassword, salt),
    });
    return { ok: true };
  }, [session]);

  const createAccount = useCallback(async (
    username: string,
    displayName: string,
    role: RoleType,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!makeHasPermission(session?.role ?? null, rolePermissions)('MANAGE_ROLES_PERMISSIONS')) {
      return { ok: false, error: 'Chỉ AD System mới có quyền tạo tài khoản' };
    }
    const uname = username.trim().toLowerCase();
    if (!uname || password.length < 6) return { ok: false, error: 'Tên đăng nhập và mật khẩu >= 6 ký tự là bắt buộc' };
    const existing = await db.accounts.get(uname);
    if (existing) return { ok: false, error: `Tài khoản "${uname}" đã tồn tại` };

    const salt = generateSalt();
    const account: IAccount = {
      username: uname,
      displayName: displayName.trim() || uname,
      role,
      salt,
      passwordHash: await hashPassword(password, salt),
      active: true,
      activeFlag: 1,
      createdAt: new Date().toISOString(),
    };
    await db.accounts.put(account);
    return { ok: true };
  }, [session, rolePermissions]);

  const refreshPermissions = async () => {
    const entry = await db.settings.get('systemSettings');
    if (entry?.value) {
      setSystemSettings(entry.value as ISystemSettings);
      localStorage.setItem('smarthr_settings', JSON.stringify(entry.value));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        login,
        logout,
        changePassword,
        createAccount,
        currentRole,
        departmentScope: currentRole ? getDepartmentScope(currentRole) : null,
        hasPermission,
        rolePermissions,
        systemSettings,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
