import React, { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { ModalProvider } from './context/ModalContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { Layout } from './components/layout/Layout';
import { LoginScreen } from './components/auth/LoginScreen';
import { NavPageId } from './components/layout/Sidebar';
import { seedDatabaseIfEmpty } from './services/db-seeder';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { EmployeeListPage } from './pages/EmployeeListPage';
import { TimesheetCalendarPage } from './pages/TimesheetCalendarPage';
import { ProductivityQualityPage } from './pages/ProductivityQualityPage';
import { OvertimePage } from './pages/OvertimePage';
import { LeavePendingPage } from './pages/LeavePendingPage';
import { ShiftRosterPage } from './pages/ShiftRosterPage';
import { ShiftAssignmentPage } from './pages/ShiftAssignmentPage';
import { AttendanceViolationPage } from './pages/AttendanceViolationPage';
import { OCRVerificationPage } from './pages/OCRVerificationPage';
import { SettingsPage } from './pages/SettingsPage';

import { presenceManager } from './services/presence-service';

const Shell: React.FC = () => {
  const { session, hasPermission } = useAuth();
  const [activePage, setActivePage] = useState<NavPageId>('dashboard');

  useEffect(() => {
    // Seed initial data on startup if database is empty
    seedDatabaseIfEmpty().catch(console.error);
  }, []);

  useEffect(() => {
    presenceManager.updateCurrentTab(activePage);
  }, [activePage]);

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Layout activePage={activePage} onSelectPage={setActivePage}>
      {activePage === 'dashboard' && <DashboardPage onNavigate={setActivePage} />}
      {activePage === 'employees' && <EmployeeListPage />}
      {activePage === 'timesheet' && <TimesheetCalendarPage />}
      {activePage === 'productivityQuality' && <ProductivityQualityPage />}
      {activePage === 'overtime' && <OvertimePage onNavigate={setActivePage} />}
      {activePage === 'leavePending' && <LeavePendingPage />}
      {activePage === 'shiftRoster' && <ShiftRosterPage />}
      {activePage === 'shiftAssignment' && <ShiftAssignmentPage />}
      {activePage === 'attendanceViolation' && <AttendanceViolationPage />}
      {activePage === 'ocrVerification' && <OCRVerificationPage onNavigate={setActivePage} />}
      {activePage === 'settings' && (
        hasPermission('SYSTEM_SETTINGS') ? (
          <SettingsPage />
        ) : (
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4 border border-rose-200">
              <span className="text-2xl font-bold">🔒</span>
            </div>
            <h2 className="text-base font-bold text-slate-900">Quyền truy cập bị giới hạn</h2>
            <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed">
              Tài khoản vai trò <b>HR Manager (Kiều)</b> không được phép thao tác mục Cài đặt hệ thống. Vui lòng đăng nhập với tài khoản <b>Vinh (Admin System)</b>.
            </p>
            <button
              onClick={() => setActivePage('dashboard')}
              className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-slate-800 transition"
            >
              Về Bảng điều khiển
            </button>
          </div>
        )
      )}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <ToastProvider>
            <ModalProvider>
              <Shell />
            </ModalProvider>
          </ToastProvider>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
