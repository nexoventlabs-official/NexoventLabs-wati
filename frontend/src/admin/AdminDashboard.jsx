import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, RefreshCw } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Admin } from '../api/client';
import { CALL_STATUSES, statusColor } from '../utils/callStatus';
import { ist } from '../utils/time';
import { formatPhone } from '../utils/country';

const STATUS_LABEL = Object.fromEntries(CALL_STATUSES.map((s) => [s.value, s.label]));

export default function AdminDashboard({ onNavigate, onLogout }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await Admin.listContacts();
      setContacts(list);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const re = q.trim() ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return contacts.filter((c) => {
      if (statusFilter !== 'all' && (c.callStatus || 'none') !== statusFilter) return false;
      if (!re) return true;
      return (
        re.test(c.name || '') ||
        re.test(c.profileName || '') ||
        re.test(c.waId || '')
      );
    });
  }, [contacts, q, statusFilter]);

  // Quick stats over the unfiltered list so the cards don't shift while typing.
  const stats = useMemo(() => {
    const total = contacts.length;
    const interested = contacts.filter((c) => c.callStatus === 'interested').length;
    const notInterested = contacts.filter((c) => c.callStatus === 'not_interested').length;
    const pending = contacts.filter((c) => !c.callStatus || c.callStatus === 'none').length;
    return { total, interested, notInterested, pending };
  }, [contacts]);

  return (
    <AdminShell
      active="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Dashboard"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 animate-fade-in-up">
        <StatCard label="Total contacts" value={stats.total} accent="from-blue-500 to-indigo-600" delay="stagger-1" />
        <StatCard label="Interested" value={stats.interested} accent="from-emerald-400 to-teal-500" delay="stagger-2" />
        <StatCard label="Not interested" value={stats.notInterested} accent="from-rose-400 to-red-500" delay="stagger-3" />
        <StatCard label="No status yet" value={stats.pending} accent="from-amber-400 to-orange-500" delay="stagger-4" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in-up stagger-2">
        <div className="flex flex-wrap items-center gap-4 p-5 border-b border-slate-100">
          <div className="relative flex-1 min-w-[200px] group">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-admin-accent transition-colors" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or mobile…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:bg-white focus:border-admin-accent focus:ring-4 focus:ring-admin-accent/10 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-admin-accent focus:ring-4 focus:ring-admin-accent/10 transition-all cursor-pointer"
          >
            <option value="all">All statuses</option>
            {CALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium transition-all hover:shadow-sm"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-admin-accent' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="px-5 py-3.5 text-[13px] text-red-700 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-[12px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <Th>Contact</Th>
                <Th>Mobile</Th>
                <Th>Call status</Th>
                <Th>First message</Th>
                <Th>Last message</Th>
                <Th className="text-center">Notes</Th>
                <Th className="text-center">Changes</Th>
                <Th aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {loading && contacts.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <Td><div className="h-10 w-40 animate-shimmer rounded-lg" /></Td>
                    <Td><div className="h-5 w-24 animate-shimmer rounded" /></Td>
                    <Td><div className="h-6 w-20 animate-shimmer rounded-full" /></Td>
                    <Td><div className="h-5 w-24 animate-shimmer rounded" /></Td>
                    <Td><div className="h-5 w-24 animate-shimmer rounded" /></Td>
                    <Td><div className="h-5 w-8 animate-shimmer rounded mx-auto" /></Td>
                    <Td><div className="h-5 w-8 animate-shimmer rounded mx-auto" /></Td>
                    <Td></Td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search size={32} className="opacity-20 mb-2" />
                      <div className="font-medium text-slate-500">No contacts found</div>
                      <div className="text-[13px]">Try adjusting your search or filters.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => onNavigate(`/admin/contacts/${c._id}`)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors group"
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium text-[13px] shrink-0 border border-slate-200">
                          {(c.name || c.profileName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 group-hover:text-admin-accent transition-colors">
                            {c.name || c.profileName || '(unnamed)'}
                          </div>
                          {c.profileName && c.profileName !== c.name && (
                            <div className="text-[12px] text-slate-500 truncate max-w-[150px]">
                              WA: {c.profileName}
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px] text-slate-600">{formatPhone(c.waId)}</span>
                    </Td>
                    <Td>
                      <span
                        className={
                          'inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold tracking-wide ' +
                          (statusColor[c.callStatus || 'none'] || 'bg-slate-100 text-slate-600')
                        }
                      >
                        {STATUS_LABEL[c.callStatus || 'none'] || c.callStatus || '—'}
                      </span>
                    </Td>
                    <Td className="text-slate-600">{c.firstMessageAt ? ist(c.firstMessageAt).format('DD MMM, h:mm A') : '—'}</Td>
                    <Td className="text-slate-600">{c.lastMessageAt ? ist(c.lastMessageAt).format('DD MMM, h:mm A') : '—'}</Td>
                    <Td className="text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-600 text-[12px] font-medium">
                        {(c.notes || []).length}
                      </span>
                    </Td>
                    <Td className="text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-600 text-[12px] font-medium">
                        {(c.callStatusHistory || []).length}
                      </span>
                    </Td>
                    <Td className="text-right pr-4">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-admin-accent/10 transition-colors ml-auto">
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-admin-accent transition-colors" />
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

function Th({ children, className = '', ...rest }) {
  return <th className={`text-left font-semibold px-4 py-3.5 whitespace-nowrap ${className}`} {...rest}>{children}</th>;
}
function Td({ children, className = '', ...rest }) {
  return <td className={`px-4 py-3 align-middle whitespace-nowrap ${className}`} {...rest}>{children}</td>;
}
function StatCard({ label, value, accent, delay = '' }) {
  return (
    <div className={`relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-premium transition-shadow duration-300 ${delay}`}>
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${accent} opacity-10 rounded-bl-full -mr-10 -mt-10`}></div>
      <div className="relative z-10">
        <div className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">{label}</div>
        <div className="text-3xl font-bold text-slate-800 tracking-tight">
          {value}
        </div>
      </div>
    </div>
  );
}
