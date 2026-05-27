import React from 'react';
import { LogOut, LayoutDashboard, FileBarChart2, ArrowLeft, MessageSquare } from 'lucide-react';

// Shared chrome (sidebar + topbar) for the authenticated admin pages.
// Every admin route renders inside this shell so logout / nav are consistent.
export default function AdminShell({ active, onNavigate, onLogout, title, children, onBack }) {
  return (
    <div className="h-screen flex bg-admin-bg text-admin-text font-sans">
      <aside className="w-64 shrink-0 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20">
        <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-admin-accent to-admin-accentHover flex items-center justify-center font-bold text-white shadow-premium">
            N
          </div>
          <div>
            <div className="text-[14px] font-bold text-white tracking-wide">Nexovent Labs - Wati</div>
            <div className="text-[12px] opacity-60 font-medium tracking-wider uppercase">Admin Panel</div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          <NavItem
            icon={LayoutDashboard}
            label="Dashboard"
            active={active === 'dashboard'}
            onClick={() => onNavigate('/admin/dashboard')}
          />
          <NavItem
            icon={FileBarChart2}
            label="Reports"
            active={active === 'reports'}
            onClick={() => onNavigate('/admin/reports')}
          />
          <div className="pt-4 mt-4 border-t border-white/5">
            <a
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium hover:bg-white/5 hover:text-white transition-all duration-200"
            >
              <MessageSquare size={18} className="opacity-70" />
              <span>Chat panel</span>
            </a>
          </div>
        </nav>
        <button
          onClick={onLogout}
          className="m-4 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-[13.5px] font-medium transition-all duration-200"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col relative">
        <header className="sticky top-0 z-10 px-8 py-4 admin-glass flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="font-semibold text-[18px] text-slate-800 flex-1">{title}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-8 animate-fade-in-up">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-200 ' +
        (active
          ? 'bg-admin-accent text-white shadow-md'
          : 'hover:bg-white/5 hover:text-white')
      }
    >
      <Icon size={18} className={active ? 'opacity-100' : 'opacity-70'} />
      <span>{label}</span>
    </button>
  );
}
