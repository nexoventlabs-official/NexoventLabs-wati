import React, { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, UploadCloud, Trash2, X, RefreshCw } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { FlowImages, Uploads } from '../api/client';

export default function AdminFlowImages({ onNavigate, onLogout }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await FlowImages.list();
      setImages(r.images || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load flow images');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function onPick(key, file) {
    if (!file) return;
    setBusyKey(key);
    try {
      const up = await Uploads.upload(file);
      const r = await FlowImages.set(key, up.url, up.public_id);
      setImages((prev) => prev.map((x) => (x.key === key ? { ...x, url: r.image.url, publicId: r.image.publicId } : x)));
      showToast('success', 'Image updated.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setBusyKey('');
    }
  }

  async function onRemove(key) {
    if (!confirm('Remove this image?')) return;
    setBusyKey(key);
    try {
      await FlowImages.remove(key);
      setImages((prev) => prev.map((x) => (x.key === key ? { ...x, url: '', publicId: '' } : x)));
      showToast('success', 'Image removed.');
    } catch (e) {
      showToast('error', e?.response?.data?.error || e.message);
    } finally {
      setBusyKey('');
    }
  }

  return (
    <AdminShell active="flow-images" onNavigate={onNavigate} onLogout={onLogout} title="Flow Images">
      <div className="mb-6 animate-fade-in-up">
        <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Welcome flow images</h2>
        <p className="text-[14px] text-slate-500 font-medium mt-1 max-w-2xl">
          These images power the WhatsApp welcome flow that customers see when they say "hi".
          The header image appears on the "View Services" message; the banner appears at the top
          of the category picker screen inside the flow.
        </p>
      </div>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6 animate-fade-in-up stagger-2">
        {loading && images.length === 0 ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm h-72 animate-shimmer" />
          ))
        ) : (
          images.map((img) => (
            <div key={img.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="h-44 bg-slate-100 relative flex items-center justify-center">
                {img.url ? (
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-300">
                    <ImageIcon size={32} />
                    <span className="text-[12px] mt-2 text-slate-400">No image uploaded</span>
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="font-semibold text-slate-800 text-[14px]">{img.label}</div>
                <div className="text-[12px] text-slate-400 font-mono mt-0.5">{img.key}</div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white text-[13px] font-semibold cursor-pointer shadow-sm hover:shadow-premium-hover transition-all">
                    <UploadCloud size={15} />
                    {busyKey === img.key ? 'Uploading…' : img.url ? 'Replace' : 'Upload'}
                    <input
                      type="file" hidden accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPick(img.key, f); }}
                    />
                  </label>
                  {img.url && (
                    <button
                      onClick={() => onRemove(img.key)}
                      disabled={busyKey === img.key}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors ml-auto disabled:opacity-60"
                    >
                      <Trash2 size={15} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm flex items-start gap-2 max-w-sm ${toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          <span className="flex-1 whitespace-pre-line">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </AdminShell>
  );
}
