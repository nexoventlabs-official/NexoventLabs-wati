import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, X, Send, RefreshCw, Megaphone, CheckCircle2, Clock, XCircle,
  AlertTriangle, Phone, CalendarClock, CalendarCheck, BanIcon, Users,
  BarChart2, WifiOff,
} from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Campaigns } from '../api/client';
import { socket } from '../api/socket';

const STATUS = {
  queued:       { label: 'Queued',           icon: <Clock size={13} />,         cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  scheduled:    { label: 'Scheduled',        icon: <CalendarClock size={13} />, cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  sent:         { label: 'Sent',             icon: <CheckCircle2 size={13} />,  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  delivered:    { label: 'Delivered',        icon: <CheckCircle2 size={13} />,  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  read:         { label: 'Read',             icon: <CheckCircle2 size={13} />,  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  not_whatsapp: { label: 'No WhatsApp',      icon: <WifiOff size={13} />,       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  rate_limited: { label: 'Auto-retry',       icon: <RefreshCw size={13} />,     cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  failed:       { label: 'Failed',           icon: <XCircle size={13} />,       cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function fmtPhone(waId) {
  return waId ? `+${waId}` : '';
}

export default function AdminCampaigns({ onNavigate, onLogout }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState(null);
  const [selected, setSelected]     = useState(() => new Set());
  const [adding, setAdding]         = useState(false);
  const [sending, setSending]       = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await Campaigns.list());
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load campaign contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpd = (c) => setItems((prev) => {
      const idx = prev.findIndex((x) => x._id === c._id);
      if (idx === -1) return [c, ...prev];
      const copy = prev.slice();
      copy[idx] = c;
      return copy;
    });
    const onDel = ({ id }) => setItems((prev) => prev.filter((x) => x._id !== id));
    socket.on('campaign:update', onUpd);
    socket.on('campaign:delete', onDel);
    return () => { socket.off('campaign:update', onUpd); socket.off('campaign:delete', onDel); };
  }, []);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i._id))));
  }

  async function del(item) {
    if (!confirm(`Remove ${fmtPhone(item.waId)} from the campaign list?`)) return;
    try {
      await Campaigns.remove(item._id);
      setItems((prev) => prev.filter((x) => x._id !== item._id));
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) { showToast('error', 'Select at least one contact.'); return; }
    if (!confirm(`Delete ${ids.length} selected contact(s) from the campaign list?`)) return;
    setDeleting(true);
    try {
      const r = await Campaigns.removeMany(ids);
      setItems((prev) => prev.filter((x) => !selected.has(x._id)));
      setSelected(new Set());
      showToast('success', `Deleted ${r.deleted} contact(s).`);
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function cancelScheduleSelected() {
    const ids = [...selected];
    if (!ids.length) { showToast('error', 'Select at least one contact.'); return; }
    if (!confirm(`Cancel scheduled send for ${ids.length} contact(s)?`)) return;
    try {
      const r = await Campaigns.cancelSchedule(ids);
      showToast('success', `Cancelled schedule for ${r.cancelled} contact(s).`);
      load();
      setSelected(new Set());
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    }
  }

  // Called after the send/schedule modal confirms
  async function handleSendOrSchedule({ mode, scheduledAt }) {
    const ids = [...selected];
    setSending(true);
    setShowSendModal(false);
    try {
      if (mode === 'now') {
        const r = await Campaigns.send(ids);
        const parts = [`Sent ${r.sent}/${r.total}`];
        if (r.failed)      parts.push(`${r.failed} failed`);
        if (r.rateLimited) parts.push(`${r.rateLimited} queued for auto-retry (Meta marketing cap)`);
        if (r.skipped)     parts.push(`${r.skipped} skipped (already sent recently)`);
        showToast('success', parts.join(', ') + '.');
      } else {
        const r = await Campaigns.schedule(ids, scheduledAt);
        const dt = new Date(scheduledAt).toLocaleString();
        showToast('success', `Scheduled ${r.scheduled} contact(s) for ${dt}.`);
      }
      setSelected(new Set());
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      showToast('error', msg);
    } finally {
      setSending(false);
    } = items.length > 0 && selected.size === items.length;
  const anyScheduled = [...selected].some((id) => {
    const item = items.find((x) => x._id === id);
    return item?.lastStatus === 'scheduled';
  });

  // Compute status stats for the summary bar
  const stats = useMemo(() => {
    const counts = {
      total: items.length,
      queued: 0, scheduled: 0, sent: 0, delivered: 0, read: 0,
      not_whatsapp: 0, rate_limited: 0, failed: 0,
    };
    for (const item of items) counts[item.lastStatus] = (counts[item.lastStatus] || 0) + 1;
    counts.success = counts.sent + counts.delivered + counts.read;
    counts.issues  = counts.not_whatsapp + counts.failed;
    return counts;
  }, [items]);

  return (
    <AdminShell active="campaigns" onNavigate={onNavigate} onLogout={onLogout} title="Campaign">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6 animate-fade-in-up">
        <div>
          <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Welcome campaign</h2>
          <p className="text-[14px] text-slate-500 font-medium mt-1 max-w-2xl">
            Add WhatsApp numbers and send the approved welcome template to them. Duplicates are skipped automatically.
            Numbers that aren't on WhatsApp are flagged so you don't waste sends. Every contact also appears in the chat panel.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white font-semibold text-sm shadow-md hover:shadow-premium-hover transition-all"
        >
          <Plus size={16} /> Add numbers
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Stats bar ── */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5 animate-fade-in-up stagger-1">
          <StatCard label="Total" value={stats.total}        icon={<Users size={16}/>}        color="slate" />
          <StatCard label="Delivered" value={stats.success}  icon={<CheckCircle2 size={16}/>} color="emerald" />
          <StatCard label="Sent"     value={stats.sent}      icon={<Send size={16}/>}          color="blue" />
          <StatCard label="Queued"   value={stats.queued}    icon={<Clock size={16}/>}         color="slate" />
          <StatCard label="Auto-retry" value={stats.rate_limited} icon={<RefreshCw size={16}/>} color="orange" />
          <StatCard label="No WhatsApp" value={stats.not_whatsapp} icon={<WifiOff size={16}/>} color="amber" />
          <StatCard label="Failed"   value={stats.failed}    icon={<XCircle size={16}/>}       color="rose" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in-up stagger-2">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <div className="text-[13px] text-slate-500 font-medium">
            {items.length} contact{items.length === 1 ? '' : 's'}{selected.size > 0 ? ` · ${selected.size} selected` : ''}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>

            {/* Cancel Schedule button — only when any selected contacts are scheduled */}
            {anyScheduled && (
              <button
                onClick={cancelScheduleSelected}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 disabled:opacity-50"
              >
                <BanIcon size={15} /> Cancel schedule
              </button>
            )}

            <button
              onClick={() => {
                if (selected.size === 0) { showToast('error', 'Select at least one contact.'); return; }
                setShowSendModal(true);
              }}
              disabled={sending || selected.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              <Send size={15} /> {sending ? 'Processing…' : `Send to selected (${selected.size})`}
            </button>

            <button
              onClick={deleteSelected}
              disabled={deleting || selected.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-200 text-rose-600 text-sm font-semibold hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={15} /> {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-[12px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-admin-accent cursor-pointer" />
                </th>
                <th className="text-left font-semibold px-4 py-3">Contact</th>
                <th className="text-left font-semibold px-4 py-3">Mobile</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Last sent / Scheduled</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {loading && items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><div className="h-4 w-4 animate-shimmer rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-32 animate-shimmer rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-28 animate-shimmer rounded" /></td>
                    <td className="px-4 py-3"><div className="h-6 w-24 animate-shimmer rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-24 animate-shimmer rounded" /></td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Megaphone size={32} className="opacity-20 mb-2" />
                      <div className="font-medium text-slate-500">No numbers yet</div>
                      <div className="text-[13px]">Click "Add numbers" to start a campaign list.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((c) => {
                  const st = STATUS[c.lastStatus] || STATUS.queued;
                  const isSel = selected.has(c._id);
                  return (
                    <tr key={c._id} className={isSel ? 'bg-admin-accent/5' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggle(c._id)} className="w-4 h-4 accent-admin-accent cursor-pointer" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
                            <Phone size={14} />
                          </div>
                          <span className="font-medium text-slate-800">{c.name || '(unnamed)'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{fmtPhone(c.waId)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${st.cls}`} title={c.lastError || ''}>
                          {st.icon} {st.label}
                        </span>
                        {c.lastStatus === 'not_whatsapp' && (
                          <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                            <WifiOff size={11} />
                            {c.lastError && /block/i.test(c.lastError)
                              ? 'Number has blocked your business'
                              : 'Not reachable on WhatsApp'}
                          </div>
                        )}
                        {c.lastStatus === 'rate_limited' && (
                          <div className="text-[11px] text-orange-600 mt-1">Meta marketing cap — auto-retrying</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[13px]">
                        {c.lastStatus === 'scheduled' && c.scheduledAt
                          ? <span className="text-violet-600 font-medium flex items-center gap-1"><CalendarCheck size={13} />{new Date(c.scheduledAt).toLocaleString()}</span>
                          : c.lastStatus === 'rate_limited' && c.retryAfter
                          ? <span className="text-orange-600 font-medium flex items-center gap-1"><RefreshCw size={13} />Retry after {new Date(c.retryAfter).toLocaleString()}</span>
                          : c.lastSentAt ? new Date(c.lastSentAt).toLocaleString() : '—'}
                        {/* Warn if re-sending within 23h is blocked */}
                        {['sent', 'delivered', 'read'].includes(c.lastStatus) && c.lastSentAt &&
                          (Date.now() - new Date(c.lastSentAt).getTime() < 23 * 60 * 60 * 1000) && (
                          <div className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle size={11} /> Re-send blocked for 23h
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => del(c)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onAdded={(r) => {
            setAdding(false);
            load();
            showToast('success', `Added ${r.added} number(s)${r.duplicates ? `, ${r.duplicates} duplicate(s) skipped` : ''}.`);
          }}
          onError={(m) => showToast('error', m)}
        />
      )}

      {showSendModal && (
        <SendOrScheduleModal
          count={selected.size}
          selectedIds={[...selected]}
          items={items}
          onClose={() => setShowSendModal(false)}
          onConfirm={handleSendOrSchedule}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm flex items-start gap-2 max-w-sm ${toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          <span className="flex-1 whitespace-pre-line">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </AdminShell>
  );
}

/* ─────────────────────────────────────────────────────────
   Stat card
   ───────────────────────────────────────────────────────── */
const STAT_COLORS = {
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-200', text: 'text-slate-700',  val: 'text-slate-800'  },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', val: 'text-emerald-800' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',   val: 'text-blue-800'   },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', val: 'text-orange-800' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  val: 'text-amber-800'  },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-700',   val: 'text-rose-800'   },
};

function StatCard({ label, value, icon, color = 'slate' }) {
  const c = STAT_COLORS[color] || STAT_COLORS.slate;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${c.bg} ${c.border}`}>
      <div className={`shrink-0 ${c.text}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-[20px] font-bold leading-none ${c.val}`}>{value}</div>
        <div className={`text-[11px] font-medium mt-0.5 truncate ${c.text}`}>{label}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Send-or-Schedule modal
   ───────────────────────────────────────────────────────── */
function SendOrScheduleModal({ count, selectedIds, items, onClose, onConfirm }) {
  const [mode, setMode] = useState('now'); // 'now' | 'schedule'

  // Compute how many selected contacts will be skipped (already sent within 23h)
  const GUARD_MS = 23 * 60 * 60 * 1000;
  const now = Date.now();
  const skippableCount = (selectedIds || []).filter((id) => {
    const item = (items || []).find((x) => x._id === id);
    if (!item) return false;
    if (!['sent', 'delivered', 'read'].includes(item.lastStatus)) return false;
    if (!item.lastSentAt) return false;
    return now - new Date(item.lastSentAt).getTime() < GUARD_MS;
  }).length;
  const willSend = count - skippableCount;
  // Build min datetime: 1 minute from now, rounded up to the next minute.
  function getMinDateTime() {
    const d = new Date(Date.now() + 60 * 1000);
    d.setSeconds(0, 0);
    // Format as "YYYY-MM-DDTHH:MM" for datetime-local input
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [minDT] = useState(getMinDateTime);
  const [scheduledDT, setScheduledDT] = useState('');
  const [dtError, setDtError] = useState('');

  function validate() {
    if (mode === 'now') return true;
    if (!scheduledDT) { setDtError('Please pick a date and time.'); return false; }

    const chosen = new Date(scheduledDT);
    const now = new Date();

    if (isNaN(chosen.getTime())) { setDtError('Invalid date/time.'); return false; }
    if (chosen <= now) { setDtError('Scheduled time must be in the future.'); return false; }
    if (chosen.getTime() - now.getTime() < 60 * 1000) {
      setDtError('Schedule at least 1 minute ahead.'); return false;
    }
    setDtError('');
    return true;
  }

  function handleConfirm() {
    if (!validate()) return;
    onConfirm({
      mode,
      scheduledAt: mode === 'schedule' ? new Date(scheduledDT).toISOString() : null,
    });
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-premium-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">Send template</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-[14px] text-slate-600">
            You're about to send the welcome template to <span className="font-semibold text-slate-800">{count} contact{count !== 1 ? 's' : ''}</span>. Choose when to send it.
          </p>

          {/* Warn about contacts that will be skipped due to 23h guard */}
          {skippableCount > 0 && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-800">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">{skippableCount} contact{skippableCount !== 1 ? 's' : ''}</span> were already sent to within the last 23 hours and will be skipped to prevent duplicate messages.{' '}
                {willSend > 0
                  ? <span className="font-semibold">{willSend} will be sent.</span>
                  : <span className="font-semibold text-red-700">No new sends will occur.</span>}
              </span>
            </div>
          )}

          {/* Mode cards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('now')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                mode === 'now'
                  ? 'border-admin-accent bg-admin-accent/5 text-admin-accent'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <Send size={22} />
              <span className="font-semibold text-[13px]">Send now</span>
              <span className="text-[12px] opacity-70">Deliver immediately</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('schedule')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                mode === 'schedule'
                  ? 'border-violet-500 bg-violet-50 text-violet-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <CalendarClock size={22} />
              <span className="font-semibold text-[13px]">Schedule</span>
              <span className="text-[12px] opacity-70">Pick a future time</span>
            </button>
          </div>

          {/* Date/time picker — only when schedule mode */}
          {mode === 'schedule' && (
            <div className="space-y-2">
              <label className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 block">
                Date &amp; time
              </label>
              <input
                type="datetime-local"
                min={minDT}
                value={scheduledDT}
                onChange={(e) => { setScheduledDT(e.target.value); setDtError(''); }}
                className="adm-input w-full"
              />
              {dtError && (
                <p className="text-[12px] text-rose-600 flex items-center gap-1">
                  <XCircle size={13} /> {dtError}
                </p>
              )}
              {scheduledDT && !dtError && (
                <p className="text-[12px] text-violet-600 flex items-center gap-1">
                  <CalendarCheck size={13} />
                  Will send on {new Date(scheduledDT).toLocaleString()}
                </p>
              )}
              <p className="text-[12px] text-slate-400">
                Times are shown in your local timezone. Schedule must be at least 1 minute from now.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md transition-all ${
              mode === 'now'
                ? 'bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900'
                : 'bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800'
            }`}
          >
            {mode === 'now' ? <span className="flex items-center gap-2"><Send size={14} /> Send now</span>
                            : <span className="flex items-center gap-2"><CalendarClock size={14} /> Confirm schedule</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Add-numbers modal (unchanged)
   ───────────────────────────────────────────────────────── */
function AddModal({ onClose, onAdded, onError }) {
  const [numberInput, setNumberInput] = useState('');
  const [queuedNumbers, setQueuedNumbers] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const countryCode = '91';

  // Strip everything except digits, then remove all leading zeros.
  function sanitizeInput(value) {
    return String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  }

  function normalizeNumber(value) {
    return sanitizeInput(value);
  }

  function addNumber() {
    const digits = normalizeNumber(numberInput);
    const normalized = digits.startsWith(countryCode) ? digits : `${countryCode}${digits}`;

    if (!digits || digits === countryCode) {
      setInlineError('Enter a valid mobile number.');
      return;
    }
    if (queuedNumbers.includes(normalized)) {
      setInlineError('This number is already in the list.');
      return;
    }
    setQueuedNumbers((prev) => [...prev, normalized]);
    setNumberInput('');
    setInlineError('');
  }

  function removeNumber(value) {
    setQueuedNumbers((prev) => prev.filter((n) => n !== value));
  }

  function collectNumbers() {
    const list = queuedNumbers.slice();
    const digits = normalizeNumber(numberInput);
    if (digits && digits !== countryCode) {
      const normalized = digits.startsWith(countryCode) ? digits : `${countryCode}${digits}`;
      if (!list.includes(normalized)) list.push(normalized);
    }
    return list;
  }

  async function save() {
    const list = collectNumbers();
    if (!list.length) { onError('Enter at least one number.'); return; }
    setBusy(true);
    try {
      const r = await Campaigns.add({ numbers: list.join('\n'), name });
      onAdded(r);
    } catch (e) {
      onError(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onMouseDown={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-premium-hover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">Add numbers</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <div className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Name (optional)</div>
            <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Applies to all added in this batch" />
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">WhatsApp number</div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm font-semibold">
                +{countryCode}
              </div>
              <input
                className="adm-input flex-1"
                value={numberInput}
                onChange={(e) => setNumberInput(sanitizeInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNumber();
                  }
                }}
                inputMode="numeric"
                placeholder="Mobile number"
              />
              <button
                onClick={addNumber}
                className="p-2.5 rounded-xl bg-admin-accent text-white shadow-sm hover:shadow-md"
                title="Add number"
              >
                <Plus size={16} />
              </button>
            </div>
            {inlineError && (
              <div className="text-[12px] text-rose-600 mt-2">{inlineError}</div>
            )}
            {queuedNumbers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {queuedNumbers.map((n) => (
                  <div key={n} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                    +{n}
                    <button onClick={() => removeNumber(n)} className="text-slate-400 hover:text-slate-600">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12px] text-slate-400 mt-2">Default country code is +{countryCode}. Click the + button to queue numbers.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-sm font-semibold shadow-md disabled:opacity-60">
            {busy ? 'Adding…' : 'Add to list'}
          </button>
        </div>
      </div>
    </div>
  );
}
