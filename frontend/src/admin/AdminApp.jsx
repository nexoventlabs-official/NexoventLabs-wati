import React, { useEffect, useState, useCallback } from 'react';
import { Admin } from '../api/client';
import AdminLogin from './AdminLogin.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import AdminContactDetail from './AdminContactDetail.jsx';
import AdminReports from './AdminReports.jsx';
import AdminCategories from './AdminCategories.jsx';

const TOKEN_KEY = 'vanigan:adminToken';

// Tiny path-based router. We avoid pulling in react-router-dom for ~80 lines
// of behaviour. Listen for popstate so back/forward buttons work; expose
// `navigate(path)` which uses history.pushState.
function useAdminRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);
  return [path, navigate];
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [verifying, setVerifying] = useState(!!token);
  const [path, navigate] = useAdminRoute();

  // On mount, verify any stored token by calling /admin/me. If it's expired
  // or rejected, drop it and force login.
  useEffect(() => {
    if (!token) { setVerifying(false); return; }
    let cancelled = false;
    Admin.me()
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) setToken(null);
      })
      .finally(() => { if (!cancelled) setVerifying(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    if (path === '/admin/login' || path === '/admin') navigate('/admin/dashboard');
  }, [path, navigate]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    navigate('/admin/login');
  }, [navigate]);

  if (verifying) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Loading admin…
      </div>
    );
  }

  if (!token) {
    return <AdminLogin onLoggedIn={handleLogin} />;
  }

  // Authed routes
  // Match `/admin/contacts/:id` first because it's the most specific.
  const contactMatch = /^\/admin\/contacts\/([^/]+)$/.exec(path);
  if (contactMatch) {
    return (
      <AdminContactDetail
        contactId={contactMatch[1]}
        onBack={() => navigate('/admin/dashboard')}
        onLogout={handleLogout}
      />
    );
  }
  if (path.startsWith('/admin/reports')) {
    return <AdminReports onNavigate={navigate} onLogout={handleLogout} />;
  }
  if (path.startsWith('/admin/categories')) {
    return <AdminCategories onNavigate={navigate} onLogout={handleLogout} />;
  }
  // Default authed route
  return <AdminDashboard onNavigate={navigate} onLogout={handleLogout} />;
}
