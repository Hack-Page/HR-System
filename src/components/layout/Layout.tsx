import React from 'react';
import { Header } from './Header';
import { Sidebar, NavPageId } from './Sidebar';

interface LayoutProps {
  activePage: NavPageId;
  onSelectPage: (page: NavPageId) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ activePage, onSelectPage, children }) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePage={activePage} onSelectPage={onSelectPage} />
        <main className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};
