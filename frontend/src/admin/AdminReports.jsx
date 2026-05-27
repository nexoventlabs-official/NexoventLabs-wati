import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Calendar } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Admin } from '../api/client';

const PRESETS = [
  { value: 'today',   label: 'Today' },
  { value: 'weekly',  label: 'Last 7 days' },
  { value: 'monthly', label: 'Last 30 days' },
  { value: 'custom',  label: 'Custom range' },
];

export default function AdminReports({ onNavigate, onLogout }) {
  const [preset, setPreset] = useState('monthly');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [format, setFormat] = useState('xlsx'); // 'xlsx' | 'pdf'
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const customInvalid = useMemo(() => preset === 'custom' && (!from || !to || from > to), [preset, from, to]);

  async function handleDownload() {
    setError('');
    setDownloading(true);
    try {
      const params = { format, preset };
      if (preset === 'custom') {
        params.from = new Date(from + 'T00:00:00').toISOString();
        params.to = new Date(to + 'T23:59:59.999').toISOString();
      }
      const blob = await Admin.downloadReport(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vanigan-report-${preset}-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AdminShell active="reports" onNavigate={onNavigate} onLogout={onLogout} title="Reports">
      <div className="max-w-2xl animate-fade-in-up">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-admin-accent to-admin-accentHover opacity-5 rounded-bl-full -mr-10 -mt-10"></div>
          
          <div className="relative z-10 mb-8">
            <h2 className="text-[18px] font-bold text-slate-800 tracking-tight mb-2">Download contact report</h2>
            <p className="text-[14px] text-slate-500 font-medium leading-relaxed max-w-lg">
              Includes name, mobile, current call status, full status-change history,
              internal notes, and first-message timestamp for every contact.
            </p>
          </div>

          {/* Range presets */}
          <div className="relative z-10 mb-6">
            <Label>Date range</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 relative z-10">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={
                    'px-4 py-2 text-[13px] rounded-lg font-semibold transition-all duration-200 ' +
                    (preset === p.value
                      ? 'bg-white text-admin-accent shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50')
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10 animate-fade-in-up">
              <div>
                <Label>From</Label>
                <DateInput value={from} onChange={setFrom} />
              </div>
              <div>
                <Label>To</Label>
                <DateInput value={to} onChange={setTo} />
              </div>
            </div>
          )}

          {/* Format */}
          <div className="relative z-10 mb-8">
            <Label>Format</Label>
          <div className="grid grid-cols-2 gap-3 mb-8 relative z-10">
            <FormatBtn
              icon={FileSpreadsheet}
              label="Excel (.xlsx)"
              active={format === 'xlsx'}
              onClick={() => setFormat('xlsx')}
            />
            <FormatBtn
              icon={FileText}
              label="PDF"
              active={format === 'pdf'}
              onClick={() => setFormat('pdf')}
            />
          </div>
          </div>

          {error && (
            <div className="text-[13px] text-red-700 bg-red-50/80 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={downloading || customInvalid}
            className="w-full relative z-10 inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-admin-accent to-admin-accentHover text-white font-semibold text-sm shadow-md hover:shadow-premium-hover disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none"
          >
            {downloading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download size={18} />
                <span>Download {format === 'pdf' ? 'PDF' : 'Excel'} report</span>
              </>
            )}
          </button>
          {customInvalid && (
            <div className="text-[12px] text-red-500 font-medium mt-2 text-center relative z-10">
              Please pick a valid From/To range.
            </div>
          )}
        </div>

        <div className="text-[13px] text-slate-400 font-medium mt-6 leading-relaxed text-center px-4">
          The Excel file contains three sheets: a one-row-per-contact summary,
          a Call Status Timeline, and a Notes Timeline. PDF format produces a printable list.
        </div>
      </div>
    </AdminShell>
  );
}

function Label({ children }) {
  return <div className="text-[12px] uppercase tracking-wider font-semibold text-slate-500 mb-2">{children}</div>;
}

function DateInput({ value, onChange }) {
  return (
    <div className="relative group">
      <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-admin-accent transition-colors" />
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:bg-white focus:border-admin-accent focus:ring-4 focus:ring-admin-accent/10 transition-all text-slate-700"
      />
    </div>
  );
}

function FormatBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        'inline-flex items-center justify-center gap-2.5 py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ' +
        (active
          ? 'bg-admin-accent/10 text-admin-accent border-admin-accent'
          : 'bg-white text-slate-600 border-slate-200 hover:border-admin-accent/50 hover:bg-slate-50')
      }
    >
      <Icon size={18} className={active ? 'text-admin-accent' : 'text-slate-400'} />
      {label}
    </button>
  );
}
