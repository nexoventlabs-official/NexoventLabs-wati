import React, { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, UploadCloud, Trash2, X, Save, MessageSquareText } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Welcome, Uploads } from '../api/client';

export default function AdminWelcome({ onNavigate, onLogout }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ body: '', footer: '', cta: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySlot, setBusySlot] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await Welcome.get();
      setData(d);
      setForm({ body: d.body || '', footer: d.footer || '', cta: d.cta || '' });
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load welcome settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function save() {
    setSaving(true);
    try {
      const d = await Welcome.update(form);
      setData(d);
      showToast('success', 'Welcome message saved.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickImage(slot, file) {
    if (!file) return;
    setBusySlot(slot);
    try {
      const up = await Uploads.upload(file);
      const d = await Welcome.setImage(slot, up.url, up.public_id);
      setData(d);
      showToast('success', 'Image updated.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setBusySlot('');
    }
  }

  async function removeImage(slot) {
    if (!confirm('Remove this image?')) return;
    setBusySlot(slot);
    try {
      const d = await Welcome.removeImage(slot);
      setData(d);
      showToast('success', 'Image removed.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setBusySlot('');
    }
  }

  return (
    <AdminShell active="welcome" onNavigate={onNavigate} onLogout={onLogout} title="Welcome Details">
      <div className="mb-6 animate-fade-in-up">
        <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Welcome message</h2>
        <p className="text-[14px] text-slate-500 font-medium mt-1 max-w-2xl">
          This is the exact message a customer receives when they say "hi". Set the header image,
          edit the promotional body, and upload the banner that appears at the top of the services
          flow.
        </p>
      </div>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-96 bg-white rounded-2xl border border-slate-100 shadow-sm animate-shimmer" />
          <div className="h-96 bg-white rounded-2xl border border-slate-100 shadow-sm animate-shimmer" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 animate-fade-in-up stagger-2">
          {/* Left: editable fields */}
          <div className="space-y-6">
            {/* Header image */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <SlotLabel>Welcome message header image</SlotLabel>
              <ImageSlot
                url={data?.headerImage}
                busy={busySlot === 'header'}
                onPick={(f) => pickImage('header', f)}
                onRemove={() => removeImage('header')}
                aspect="h-40"
              />
            </div>

            {/* Banner image */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <SlotLabel>Welcome flow banner (top of the services screen)</SlotLabel>
              <ImageSlot
                url={data?.bannerImage}
                busy={busySlot === 'banner'}
                onPick={(f) => pickImage('banner', f)}
                onRemove={() => removeImage('banner')}
                aspect="h-28"
              />
            </div>

            {/* Text fields */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div>
                <SlotLabel>Body content</SlotLabel>
                <textarea
                  className="adm-input resize-none" rows={6}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={'Convert your business into WhatsApp 🚀\n\nStart your 15 days FREE trial...'}
                />
                <p className="text-[12px] text-slate-400 mt-1">Tip: wrap text in *asterisks* for bold on WhatsApp.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SlotLabel>CTA button label</SlotLabel>
                  <input
                    className="adm-input" maxLength={30}
                    value={form.cta}
                    onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
                    placeholder="View Services"
                  />
                </div>
                <div>
                  <SlotLabel>Footer</SlotLabel>
                  <input
                    className="adm-input" maxLength={60}
                    value={form.footer}
                    onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
                    placeholder="Nexovent Labs"
                  />
                </div>
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-sm font-semibold shadow-md disabled:opacity-60"
              >
                <Save size={16} /> {saving ? 'Saving…' : 'Save welcome message'}
              </button>
            </div>
          </div>

          {/* Right: live WhatsApp preview */}
          <div>
            <SlotLabel>WhatsApp preview</SlotLabel>
            <div className="rounded-2xl p-4 bg-[#0b141a] border border-slate-700 sticky top-4">
              <div className="rounded-lg overflow-hidden bg-[#202c33] shadow-sm max-w-[320px]">
                {data?.headerImage ? (
                  <img src={data.headerImage} alt="" className="w-full max-h-52 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-slate-700/50 flex items-center justify-center text-slate-500">
                    <ImageIcon size={28} />
                  </div>
                )}
                <div className="px-3 py-2">
                  <div className="text-[13px] text-[#e9edef] whitespace-pre-wrap break-words">
                    {form.body || 'Your welcome message will appear here.'}
                  </div>
                  {form.footer && <div className="text-[11px] text-[#8696a0] mt-1.5">{form.footer}</div>}
                </div>
                <div className="border-t border-slate-700 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium text-[#53bdeb]">
                  <MessageSquareText size={15} />
                  {form.cta || 'View Services'}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 px-1">
                Tapping "{form.cta || 'View Services'}" opens the flow. The banner below shows on the first flow screen.
              </p>
              {data?.bannerImage && (
                <img src={data.bannerImage} alt="" className="mt-2 rounded-lg max-w-[320px] w-full max-h-24 object-cover border border-slate-700" />
              )}
            </div>
          </div>
        </div>
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

function SlotLabel({ children }) {
  return <div className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-2">{children}</div>;
}

function ImageSlot({ url, busy, onPick, onRemove, aspect = 'h-40' }) {
  return (
    <>
      <div className={`${aspect} bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200`}>
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-slate-300">
            <ImageIcon size={28} />
            <span className="text-[12px] mt-1.5 text-slate-400">No image uploaded</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-[13px] font-semibold cursor-pointer shadow-sm hover:shadow-premium-hover transition-all">
          <UploadCloud size={15} />
          {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
          <input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f); }} />
        </label>
        {url && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-60"
          >
            <Trash2 size={15} /> Remove
          </button>
        )}
      </div>
    </>
  );
}
