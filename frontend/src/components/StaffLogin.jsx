import React, { useState } from 'react';
import { Lock, User, LogIn } from 'lucide-react';
import { Staff } from '../api/client';

export default function StaffLogin({ onLoggedIn }) {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!mobile || !password) return;
    setSubmitting(true);
    setError('');
    try {
      const { token } = await Staff.login(mobile.trim(), password);
      onLoggedIn(token);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Login failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-screen w-screen overflow-y-auto flex items-center justify-center bg-slate-50 p-4 relative font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-cyan-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <div className="admin-glass rounded-2xl shadow-premium p-8 w-full max-w-[400px] relative z-10 animate-fade-in-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4 shadow-lg transform -rotate-3 hover:rotate-0 transition-transform duration-300">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Staff Login</h1>
          <p className="text-[14px] text-slate-500 mt-1.5 font-medium">Nexovent Labs - Wati panel</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Mobile number</span>
            <div className="relative group">
              <User
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors"
              />
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm"
                placeholder="e.g. 15551234567"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Password</span>
            <div className="relative group">
              <Lock
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm"
                placeholder="Enter your password"
              />
            </div>
          </label>

          {error && (
            <div className="text-[13px] text-red-600 bg-red-50/80 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !mobile || !password}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm shadow-md hover:shadow-premium-hover disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Sign in to panel</span>
              </>
            )}
          </button>
        </form>

        <div className="text-[12px] text-slate-400 font-medium text-center mt-8">
          Authorized staff only.
        </div>
      </div>
    </div>
  );
}
