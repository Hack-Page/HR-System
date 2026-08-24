import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RoleType } from '../types';

interface AuthContextType {
  currentRole: RoleType;
  setCurrentRole: (role: RoleType) => void;
  departmentScope: string | null; // null for company-wide, or 'WH', 'Production', 'QC'
  hasPermission: (action: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRoleState] = useState<RoleType>(() => {
    return (localStorage.getItem('smarthr_role') as RoleType) || 'HR Manager';
  });

  const setCurrentRole = (role: RoleType) => {
    setCurrentRoleState(role);
    localStorage.setItem('smarthr_role', role);
  };

  const getDepartmentScope = (role: RoleType): string | null => {
    switch (role) {
      case 'Warehouse Admin':
        return 'WH';
      case 'Production Admin':
        return 'Production';
      case 'QC Admin':
        return 'QC';
      case 'HR Manager':
      case 'HR Admin':
      case 'AD System':
      default:
        return null;
    }
  };

  const hasPermission = (action: string): boolean => {
    if (currentRole === 'AD System' || currentRole === 'HR Manager') return true;
    if (action === 'SYSTEM_SETTINGS' || action === 'MANAGE_ROLES_PERMISSIONS') {
      return false;
    }
    if (action === 'IMPORT_LOGS' || action === 'EXPORT_PAYROLL') {
      return currentRole === 'HR Admin';
    }
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        departmentScope: getDepartmentScope(currentRole),
        hasPermission,
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
