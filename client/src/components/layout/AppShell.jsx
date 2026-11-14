/**
 * components/layout/AppShell.jsx
 * Root layout: sidebar + main content area.
 * All route outlets are rendered inside <main>.
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
