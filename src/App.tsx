import React, { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { ModalProvider } from './context/ModalContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { Layout } from './components/layout/Layout';
import { NavPageId } from './components/layout/Sidebar';
import { seedDatabaseIfEmpty } from './services/db-seeder';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { EmployeeListPage } from './pages/EmployeeListPage';
import { TimesheetCalendarPage } from './pages/TimesheetCalendarPage';
import { OvertimePage } from './pages/OvertimePage';
import { LeavePendingPage } from './pages/LeavePendingPage';
import { ShiftRosterPage } from './pages/ShiftRosterPage';
import { OCRVerificationPage } from './pages/OCRVerificationPage';
import { SettingsPage } from './pages/SettingsPage';

export const AppContent: React.FC = () => {
  const [activePage, setActivePage] = useState<NavPageId>('dashboard');

  useEffect(() => {
    // Seed initial data on startup if database is empty
    seedDatabaseIfEmpty().catch(console.error);
  }, []);

  return (
    <Layout activePage={activePage} onSelectPage={setActivePage}>
      {activePage === 'dashboard' && <DashboardPage onNavigate={setActivePage} />}
      {activePage === 'employees' && <EmployeeListPage />}
      {activePage === 'timesheet' && <TimesheetCalendarPage />}
      {activePage === 'overtime' && <OvertimePage onNavigate={setActivePage} />}
      {activePage === 'leavePending' && <LeavePendingPage />}
      {activePage === 'shiftRoster' && <ShiftRosterPage />}
      {activePage === 'ocrVerification' && <OCRVerificationPage onNavigate={setActivePage} />}
      {activePage === 'settings' && <SettingsPage />}
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
              <AppContent />
            </ModalProvider>
          </ToastProvider>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
