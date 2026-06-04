import React, { useCallback, useEffect, useState } from 'react';
import { Save, KeyRound, Phone } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Admin } from '../api/client';

export default function AdminStaff({ onNavigate, onLogout }) {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await Admin.getStaffCredentials();
      setMobile(data.mobile || '');
      setLastUpdated(data.updatedAt || null);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load staff credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await Admin.updateStaffCredentials({ mobile: mobile.trim(), password: password.trim() });
      setPassword('');
      setLastUpdated(data.updatedAt || null);
      setNotice('Staff login updated. Use the mobile number and password to sign in.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to update staff credentials');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      active="staff"
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Staff Login"
    >
      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-admin-accent/10 text-admin-accent flex items-center justify-center">
              <KeyRound size={20} />
            </div>
            <div>
              <div className="text-slate-800 font-semibold">Staff credentials</div>
              <div className="text-[13px] text-slate-500">Set the mobile number and password used to access the admin panel.</div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading staff settings…</div>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <label className="block">
                <span className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Mobile number</span>
                <div className="relative group">
                  <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-admin-accent transition-colors" />
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-admin-accent focus:ring-4 focus:ring-admin-accent/10 transition-all"
                    placeholder="e.g. 15551234567"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Password</span>
                <div className="relative group">
                  <KeyRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-admin-accent transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-admin-accent focus:ring-4 focus:ring-admin-accent/10 transition-all"
                    placeholder="Set a new password"
                  />
                </div>
              </label>

              {error && (
                <div className="text-[13px] text-red-600 bg-red-50/80 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              {notice && (
                <div className="text-[13px] text-emerald-700 bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {notice}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={saving || !mobile.trim() || !password.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-admin-accent text-white text-sm font-medium shadow-md hover:shadow-premium-hover disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save credentials
                </button>
                {lastUpdated && (
                  <div className="text-[12px] text-slate-400">Last updated: {new Date(lastUpdated).toLocaleString()}</div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
