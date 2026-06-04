import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, X, Send, RefreshCw, Megaphone, CheckCircle2, Clock, XCircle,
  AlertTriangle, Phone,
} from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Campaigns } from '../api/client';
import { socket } from '../api/socket';

const STATUS = {
  queued: { label: 'Queued', icon: <Clock size={13} />, cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  sent: { label: 'Sent', icon: <CheckCircle2 size={13} />, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  delivered: { label: 'Delivered', icon: <CheckCircle2 size={13} />, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  read: { label: 'Read', icon: <CheckCircle2 size={13} />, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  not_whatsapp: { label: 'Not on WhatsApp', icon: <AlertTriangle size={13} />, cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  failed: { label: 'Failed', icon: <XCircle size={13} />, cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function fmtPhone(waId) {
  return waId ? `+${waId}` : '';
}

export default function AdminCampaigns({ onNavigate, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function sendSelected() {
    const ids = [...selected];
    if (!ids.length) { showToast('error', 'Select at least one contact.'); return; }
    if (!confirm(`Send the welcome template to ${ids.length} contact(s)?`)) return;
    setSending(true);
    try {
      const r = await Campaigns.send(ids);
      showToast('success', `Done. Sent ${r.sent}/${r.total}${r.failed ? `, ${r.failed} failed` : ''}.`);
      setSelected(new Set());
      load();
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setSending(false);
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

  const allChecked = items.length > 0 && selected.size === items.length;

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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm animate-fade-in-up stagger-2">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <div className="text-[13px] text-slate-500 font-medium">
            {items.length} contact{items.length === 1 ? '' : 's'} · {selected.size} selected
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={sendSelected}
              disabled={sending || selected.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              <Send size={15} /> {sending ? 'Sending…' : `Send to selected (${selected.size})`}
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
                <th className="text-left font-semibold px-4 py-3">Last sent</th>
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
                          <div className="text-[11px] text-amber-600 mt-1">Skipped — not a WhatsApp number</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[13px]">
                        {c.lastSentAt ? new Date(c.lastSentAt).toLocaleString() : '—'}
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

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm flex items-start gap-2 max-w-sm ${toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          <span className="flex-1 whitespace-pre-line">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </AdminShell>
  );
}

function AddModal({ onClose, onAdded, onError }) {
  const [numberInput, setNumberInput] = useState('');
  const [queuedNumbers, setQueuedNumbers] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const countryCode = '91';

  function normalizeNumber(value) {
    return String(value || '').replace(/\D/g, '');
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
                onChange={(e) => setNumberInput(e.target.value)}
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
