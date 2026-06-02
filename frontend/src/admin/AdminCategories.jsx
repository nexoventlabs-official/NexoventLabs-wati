import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Image as ImageIcon, UploadCloud, X, Send,
  ExternalLink, CheckCircle2, Clock, RefreshCw, Megaphone, Workflow,
} from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Categories, Uploads, Flows } from '../api/client';
import { socket } from '../api/socket';

const blank = {
  name: '', description: '', logoUrl: '', headerImageUrl: '',
  bodyContent: '', ctaText: 'DEMO', ctaUrl: '', active: true, sortOrder: 0,
};

export default function AdminCategories({ onNavigate, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | category object | null
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [flow, setFlow] = useState(null);
  const [publishingFlow, setPublishingFlow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await Categories.list());
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlow = useCallback(async () => {
    try {
      setFlow(await Flows.status());
    } catch {
      setFlow(null);
    }
  }, []);

  useEffect(() => { load(); loadFlow(); }, [load, loadFlow]);

  useEffect(() => {
    const onUpd = (c) => setItems((prev) => {
      const idx = prev.findIndex((x) => x._id === c._id);
      if (idx === -1) return [...prev, c].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
      const copy = prev.slice();
      copy[idx] = c;
      return copy;
    });
    const onDel = ({ id }) => setItems((prev) => prev.filter((x) => x._id !== id));
    socket.on('category:update', onUpd);
    socket.on('category:delete', onDel);
    return () => { socket.off('category:update', onUpd); socket.off('category:delete', onDel); };
  }, []);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  async function del(item) {
    if (!confirm(`Delete category "${item.name}"?`)) return;
    try {
      await Categories.remove(item._id);
      setItems((prev) => prev.filter((x) => x._id !== item._id));
      showToast('success', 'Category deleted.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    }
  }

  async function publishFlow() {
    setPublishingFlow(true);
    try {
      const r = await Flows.publish();
      await loadFlow();
      showToast('success', `Flow published to Meta (id ${r.flowId}, ${r.status}).`);
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setPublishingFlow(false);
    }
  }

  return (
    <AdminShell active="categories" onNavigate={onNavigate} onLogout={onLogout} title="Categories">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6 animate-fade-in-up">
        <div>
          <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Promotion categories</h2>
          <p className="text-[14px] text-slate-500 font-medium mt-1 max-w-2xl">
            Each category becomes a tappable option in the WhatsApp welcome menu. When a customer picks one,
            they instantly receive a promo message (image header + body + a DEMO button). Submit it to Meta to
            also broadcast it proactively.
          </p>
        </div>
        <button
          onClick={() => { setEditing('new'); setError(''); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white font-semibold text-sm shadow-md hover:shadow-premium-hover transition-all"
        >
          <Plus size={16} /> Add category
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {/* WhatsApp Flow status / publish control */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 flex flex-wrap items-center gap-4 animate-fade-in-up">
        <div className="w-11 h-11 rounded-xl bg-admin-accent/10 text-admin-accent flex items-center justify-center shrink-0">
          <Workflow size={22} />
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="font-semibold text-slate-800 flex items-center gap-2">
            WhatsApp Flow picker
            {flow?.flowId ? (
              <span className={`text-[11px] border rounded-full px-2 py-0.5 inline-flex items-center gap-1 font-semibold ${flow.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                {flow.status === 'PUBLISHED' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                {flow.status}
              </span>
            ) : (
              <span className="text-[11px] border rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 border-slate-200 font-semibold">
                NOT CREATED
              </span>
            )}
          </div>
          <div className="text-[13px] text-slate-500 mt-0.5">
            {flow?.flowId
              ? <>Flow ID <span className="font-mono text-slate-600">{flow.flowId}</span> · serves {flow.categoryCount} active categor{flow.categoryCount === 1 ? 'y' : 'ies'}.</>
              : 'Publish a Meta Flow so the welcome menu opens a rich category picker. Falls back to buttons until then.'}
          </div>
        </div>
        <button
          onClick={publishFlow}
          disabled={publishingFlow}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-admin-accent text-admin-accent font-semibold text-sm hover:bg-admin-accent/5 transition-all disabled:opacity-60"
        >
          <RefreshCw size={16} className={publishingFlow ? 'animate-spin' : ''} />
          {flow?.flowId ? 'Update & republish flow' : 'Create & publish flow'}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in-up stagger-2">
        {loading && items.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm h-64 animate-shimmer" />
          ))
        ) : items.length === 0 ? (
          <div className="col-span-full">
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Megaphone size={36} className="text-slate-300 mb-3" />
              <div className="font-semibold text-slate-600">No categories yet</div>
              <div className="text-[13px] text-slate-400 mt-1">Create one to power the WhatsApp welcome menu.</div>
            </div>
          </div>
        ) : (
          items.map((c) => {
            return (
              <div key={c._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="h-32 bg-slate-100 relative">
                  {c.headerImageUrl ? (
                    <img src={c.headerImageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <ImageIcon size={28} />
                    </div>
                  )}
                  {!c.active && (
                    <span className="absolute top-2 left-2 text-[11px] font-semibold bg-slate-800/80 text-white px-2 py-0.5 rounded-full">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center gap-2.5">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-admin-accent/10 text-admin-accent flex items-center justify-center font-bold shrink-0">
                        {(c.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                      <div className="text-[12px] text-slate-500 truncate">{c.description || '—'}</div>
                    </div>
                  </div>
                  {c.bodyContent && (
                    <p className="text-[13px] text-slate-600 mt-3 line-clamp-3 whitespace-pre-wrap">{c.bodyContent}</p>
                  )}
                  {c.ctaUrl && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-admin-accent font-medium">
                      <ExternalLink size={13} /> {c.ctaText || 'DEMO'}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => { setEditing(c); setError(''); }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      onClick={() => del(c)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-auto"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <CategoryModal
          initial={editing === 'new' ? blank : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((prev) => {
              const idx = prev.findIndex((x) => x._id === saved._id);
              if (idx === -1) return [...prev, saved];
              const copy = prev.slice();
              copy[idx] = saved;
              return copy;
            });
            setEditing(null);
            showToast('success', 'Category saved.');
          }}
          onToast={showToast}
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

function CategoryModal({ initial, onClose, onSaved, onToast }) {
  const isNew = !initial._id;
  const [form, setForm] = useState({ ...blank, ...initial });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [testWaId, setTestWaId] = useState('');
  const [err, setErr] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function uploadFile(kind, file) {
    if (!file) return;
    setUploading(kind);
    try {
      const up = await Uploads.upload(file);
      set(kind === 'logo' ? { logoUrl: up.url } : { headerImageUrl: up.url });
    } catch (e) {
      setErr(e?.response?.data?.error || 'Upload failed');
    } finally {
      setUploading('');
    }
  }

  async function save() {
    setErr('');
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        logoUrl: form.logoUrl,
        headerImageUrl: form.headerImageUrl,
        bodyContent: form.bodyContent,
        ctaText: form.ctaText || 'DEMO',
        ctaUrl: form.ctaUrl,
        active: !!form.active,
        sortOrder: Number(form.sortOrder) || 0,
      };
      const saved = isNew
        ? await Categories.create(body)
        : await Categories.update(initial._id, body);
      onSaved(saved);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    const waId = testWaId.replace(/\D/g, '');
    if (!waId) { setErr('Enter a WhatsApp number to test (with country code).'); return; }
    if (isNew) { setErr('Save the category first, then send a test.'); return; }
    try {
      await Categories.sendTest(initial._id, waId);
      onToast('success', `Promo sent to +${waId}.`);
    } catch (e) {
      onToast('error', e?.response?.data?.error || e.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onMouseDown={onClose}>
      <div
        className="bg-white w-full max-w-4xl rounded-2xl shadow-premium-hover relative max-h-[92vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{isNew ? 'New category' : 'Edit category'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll grid md:grid-cols-2 gap-6 p-6">
          {/* Form */}
          <div className="space-y-4">
            <Field label="Category name *">
              <input className="adm-input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="WhatsApp Automation" />
            </Field>
            <Field label="Short description">
              <input className="adm-input" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Shown under the option in the menu" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Logo (option icon)">
                <FileButton
                  busy={uploading === 'logo'}
                  hasValue={!!form.logoUrl}
                  accept="image/*"
                  onPick={(f) => uploadFile('logo', f)}
                />
                {form.logoUrl && <img src={form.logoUrl} alt="" className="mt-2 w-14 h-14 rounded-lg object-cover border border-slate-200" />}
              </Field>
              <Field label="Header image (promo) *">
                <FileButton
                  busy={uploading === 'header'}
                  hasValue={!!form.headerImageUrl}
                  accept="image/*"
                  onPick={(f) => uploadFile('header', f)}
                />
                {form.headerImageUrl && <img src={form.headerImageUrl} alt="" className="mt-2 w-full max-h-28 rounded-lg object-cover border border-slate-200" />}
              </Field>
            </div>

            <Field label="Promo body content">
              <textarea
                className="adm-input resize-none" rows={5}
                value={form.bodyContent}
                onChange={(e) => set({ bodyContent: e.target.value })}
                placeholder={'Smarter conversations. Stronger connections.\nGrow your business with WhatsApp Automation.'}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="CTA button text">
                <input className="adm-input" maxLength={20} value={form.ctaText} onChange={(e) => set({ ctaText: e.target.value })} placeholder="DEMO" />
              </Field>
              <Field label="CTA URL">
                <input className="adm-input" value={form.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} placeholder="https://nexoventlabs.com/demo" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Sort order">
                <input type="number" className="adm-input" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
              </Field>
              <Field label="Visible in menu">
                <select className="adm-input" value={form.active ? 'true' : 'false'} onChange={(e) => set({ active: e.target.value === 'true' })}>
                  <option value="true">Active</option>
                  <option value="false">Hidden</option>
                </select>
              </Field>
            </div>

            {!isNew && (
              <Field label="Send a test promo (WhatsApp number)">
                <div className="flex gap-2">
                  <input className="adm-input flex-1" value={testWaId} onChange={(e) => setTestWaId(e.target.value)} placeholder="919999999999" />
                  <button onClick={sendTest} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium inline-flex items-center gap-1.5 hover:bg-slate-700">
                    <Send size={14} /> Test
                  </button>
                </div>
              </Field>
            )}

            {err && (
              <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{err}</div>
            )}
          </div>

          {/* Live WhatsApp preview */}
          <div>
            <div className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-2">WhatsApp preview</div>
            <WhatsAppPreview form={form} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-sm font-semibold shadow-md disabled:opacity-60">
            {saving ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppPreview({ form }) {
  return (
    <div className="rounded-2xl p-4 bg-[#0b141a] border border-slate-700">
      <div className="rounded-lg overflow-hidden bg-[#202c33] shadow-sm max-w-[300px]">
        {form.headerImageUrl ? (
          <img src={form.headerImageUrl} alt="" className="w-full max-h-44 object-cover" />
        ) : (
          <div className="w-full h-32 bg-slate-700/50 flex items-center justify-center text-slate-500">
            <ImageIcon size={26} />
          </div>
        )}
        <div className="px-3 py-2">
          <div className="text-[13px] text-[#e9edef] whitespace-pre-wrap break-words">
            {form.bodyContent || 'Your promotional message will appear here.'}
          </div>
          <div className="text-[11px] text-[#8696a0] mt-1.5">Nexovent Labs</div>
        </div>
      </div>
      {form.ctaUrl && (
        <div className="mt-1.5 max-w-[300px]">
          <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-[#53bdeb] bg-[#202c33] border border-slate-700 rounded-lg">
            <ExternalLink size={14} />
            <span className="truncate">{form.ctaText || 'DEMO'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function FileButton({ busy, hasValue, accept, onPick }) {
  return (
    <label className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl cursor-pointer text-sm text-slate-600 hover:bg-slate-50 transition-colors w-full">
      <UploadCloud size={16} />
      {busy ? 'Uploading…' : hasValue ? 'Replace image' : 'Upload image'}
      <input type="file" hidden accept={accept} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f); }} />
    </label>
  );
}
