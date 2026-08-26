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

/** Tài khoản mặc định khởi tạo lần đầu: admin / admin123 */
export const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

async function ensureDefaultAdmin(): Promise<void> {
  const existing = await db.accounts.get(DEFAULT_ADMIN_USERNAME);
  if (existing) return;
  const salt = generateSalt();
  const account: IAccount = {
    username: DEFAULT_ADMIN_USERNAME,
    displayName: 'Quản trị hệ thống',
    role: 'AD System',
    salt,
    passwordHash: await hashPassword(DEFAULT_ADMIN_PASSWORD, salt),
    active: true,
    createdAt: new Date().toISOString(),
  };
  await db.accounts.put(account);
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
 *  - Chỉ ALL_ACCESS hoặc khớp quyền khai báo
 *  - Mảng rỗng = KHÔNG có quyền gì (không còn fallback "rỗng = full")
 *  - Không còn hard-code "AD System luôn true" (ALL_ACCESS nằm trong ma trận)
 */
function makeHasPermission(role: RoleType | null, permissions: ISystemSettings['rolePermissions']) {
  return (action: string): boolean => {
    if (!role) return false;
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

  // Khởi tạo tài khoản admin mặc định đúng một lần
  useEffect(() => {
    ensureDefaultAdmin().catch(console.error);
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
    const uname = username.trim().toLowerCase();
    if (!uname || !password) return { ok: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' };

    const account = await db.accounts.get(uname);
    if (!account || !account.active) {
      return { ok: false, error: 'Tài khoản không tồn tại hoặc đã bị khóa' };
    }

    const valid = await verifyPassword(password, account.salt, account.passwordHash);
    if (!valid) return { ok: false, error: 'Mật khẩu không đúng' };

    await db.accounts.update(uname, { lastLoginAt: new Date().toISOString() });
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
