import React, { useState } from 'react';
import { X, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Templates, Uploads } from '../api/client';

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en', label: 'English' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
];

export default function TemplateEditor({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState('MARKETING');
  const [headerType, setHeaderType] = useState('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function onHeaderFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const up = await Uploads.upload(file);
      setHeaderMediaUrl(up.url);
    } finally { setUploading(false); }
  }

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons(prev => [...prev, { type: 'QUICK_REPLY', text: '' }]);
  }
  function updateButton(i, patch) {
    setButtons(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function removeButton(i) {
    setButtons(prev => prev.filter((_, idx) => idx !== i));
  }

  function validate() {
    if (!/^[a-z0-9_]{1,512}$/.test(name)) return 'Name must be lowercase letters, numbers & underscores only.';
    if (!body.trim()) return 'Body is required.';
    if (headerType !== 'NONE' && headerType !== 'TEXT' && !headerMediaUrl) return 'Header media is required for image/video/document.';
    if (headerType === 'TEXT' && !headerText) return 'Header text is required.';
    for (const b of buttons) {
      if (!b.text) return 'All buttons need text.';
      if (b.type === 'URL' && !b.url) return 'URL button requires a URL.';
      if (b.type === 'PHONE_NUMBER' && !b.phone_number) return 'Phone button requires number.';
    }
    return '';
  }

  async function submit(andSend) {
    setErrorMsg('');
    const err = validate();
    if (err) return setErrorMsg(err);
    setSubmitting(true);
    try {
      const created = await Templates.create({
        name, language, category,
        header: { type: headerType, text: headerText, mediaUrl: headerMediaUrl },
        body, footer, buttons,
      });
      if (andSend) {
        try {
          await Templates.submit(created._id);
        } catch (e) {
          setErrorMsg('Saved as DRAFT but Meta submission failed: ' + (e.response?.data?.details?.error?.message || e.response?.data?.error || e.message));
          onCreated && onCreated();
          return;
        }
      }
      onCreated && onCreated();
    } catch (e) {
      setErrorMsg(e.response?.data?.details?.error?.message || e.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col z-20">
      <div className="px-4 py-3 bg-wati-header text-white flex items-center justify-between">
        <div className="font-semibold">New Template</div>
        <button onClick={onClose} className="p-2 rounded hover:bg-white/10"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-wati-muted">Template Name</label>
            <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              className="w-full mt-1 px-3 py-2 bg-gray-100 rounded outline-none text-sm" placeholder="e.g. welcome_offer" />
          </div>
          <div>
            <label className="text-xs text-wati-muted">Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-gray-100 rounded outline-none text-sm">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-wati-muted">Category</label>
          <div className="flex gap-2 mt-1">
            {CATEGORIES.map(c => (
              <button key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded text-xs border ${category === c ? 'bg-wati-primary text-white border-wati-primary' : 'bg-gray-100 border-gray-200'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-wati-muted">Header</label>
          <div className="flex gap-2 mt-1">
            {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(t => (
              <button key={t}
                onClick={() => setHeaderType(t)}
                className={`px-3 py-1.5 rounded text-xs border ${headerType === t ? 'bg-wati-primary text-white border-wati-primary' : 'bg-gray-100 border-gray-200'}`}>
                {t}
              </button>
            ))}
          </div>

          {headerType === 'TEXT' && (
            <input value={headerText} onChange={e => setHeaderText(e.target.value)}
              placeholder="Header text (up to 60 chars)"
              maxLength={60}
              className="w-full mt-2 px-3 py-2 bg-gray-100 rounded outline-none text-sm" />
          )}
          {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
            <div className="mt-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded cursor-pointer text-sm hover:bg-gray-200">
                <UploadCloud size={16} />
                {uploading ? 'Uploading…' : (headerMediaUrl ? 'Replace file' : `Upload ${headerType.toLowerCase()}`)}
                <input type="file" hidden accept={
                  headerType === 'IMAGE' ? 'image/*' : headerType === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'
                } onChange={onHeaderFile} />
              </label>
              {headerMediaUrl && (
                <div className="mt-2">
                  {headerType === 'IMAGE' && <img src={headerMediaUrl} className="max-h-40 rounded" />}
                  {headerType === 'VIDEO' && <video src={headerMediaUrl} controls className="max-h-40 rounded" />}
                  {headerType === 'DOCUMENT' && <a href={headerMediaUrl} target="_blank" className="text-xs text-blue-600 underline">View uploaded file</a>}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-wati-muted">Body *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder="Hello {{1}}, your order {{2}} is confirmed."
            className="w-full mt-1 px-3 py-2 bg-gray-100 rounded outline-none text-sm resize-none" />
        </div>

        <div>
          <label className="text-xs text-wati-muted">Footer (optional)</label>
          <input value={footer} onChange={e => setFooter(e.target.value)} maxLength={60}
            className="w-full mt-1 px-3 py-2 bg-gray-100 rounded outline-none text-sm" />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-wati-muted">Buttons (up to 3)</label>
            {buttons.length < 3 && (
              <button onClick={addButton} className="text-xs text-wati-primary flex items-center gap-1">
                <Plus size={14} /> Add button
              </button>
            )}
          </div>

          <div className="space-y-2 mt-2">
            {buttons.map((b, i) => (
              <div key={i} className="border rounded p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={b.type} onChange={e => updateButton(i, { type: e.target.value })}
                    className="px-2 py-1.5 bg-gray-100 rounded text-xs">
                    <option value="QUICK_REPLY">Quick reply</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">Call</option>
                  </select>
                  <input value={b.text || ''} onChange={e => updateButton(i, { text: e.target.value })}
                    placeholder="Button text" maxLength={25}
                    className="flex-1 px-2 py-1.5 bg-gray-100 rounded text-sm" />
                  {b.type === 'URL' && (
                    <input value={b.url || ''} onChange={e => updateButton(i, { url: e.target.value })}
                      placeholder="https://…"
                      className="flex-1 px-2 py-1.5 bg-gray-100 rounded text-sm" />
                  )}
                  {b.type === 'PHONE_NUMBER' && (
                    <input value={b.phone_number || ''} onChange={e => updateButton(i, { phone_number: e.target.value })}
                      placeholder="+919999999999"
                      className="flex-1 px-2 py-1.5 bg-gray-100 rounded text-sm" />
                  )}
                  <button onClick={() => removeButton(i)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
                {b.type === 'QUICK_REPLY' && (
                  <div className="pl-2 border-l-2 border-wati-primary/30">
                    <label className="text-[11px] text-wati-muted">
                      Auto-reply when customer taps this button (optional)
                    </label>
                    <textarea
                      value={b.replyText || ''}
                      onChange={e => updateButton(i, { replyText: e.target.value })}
                      rows={2}
                      maxLength={1000}
                      placeholder={`e.g. Great! Our team will call you within 24h.`}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-50 rounded text-sm resize-none border"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {errorMsg && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{errorMsg}</div>}
      </div>

      <div className="px-4 py-3 border-t flex items-center justify-end gap-2 bg-gray-50">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 rounded">Cancel</button>
        <button onClick={() => submit(false)} disabled={submitting}
          className="px-4 py-2 text-sm bg-gray-700 text-white rounded disabled:opacity-50">Save as Draft</button>
        <button onClick={() => submit(true)} disabled={submitting}
          className="px-4 py-2 text-sm bg-wati-primary text-white rounded disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Create & Verify'}
        </button>
      </div>
    </div>
  );
}
