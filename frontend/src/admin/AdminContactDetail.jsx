import React, { useEffect, useState } from 'react';
import { Phone, MessageCircle, Calendar, History, StickyNote, Globe2 } from 'lucide-react';
import AdminShell from './AdminShell.jsx';
import { Admin } from '../api/client';
import { CALL_STATUSES, statusColor } from '../utils/callStatus';
import { ist } from '../utils/time';
import { formatPhone, resolveCountry } from '../utils/country';

const STATUS_LABEL = Object.fromEntries(CALL_STATUSES.map((s) => [s.value, s.label]));

export default function AdminContactDetail({ contactId, onBack, onLogout }) {
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Admin.getContact(contactId)
      .then((c) => { if (!cancelled) setContact(c); })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.error || e.message || 'Failed to load contact');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contactId]);

  const country = contact ? resolveCountry(contact.waId) : null;

  const callHistory = contact?.callStatusHistory
    ? [...contact.callStatusHistory].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];

  const notes = contact?.notes
    ? [...contact.notes].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];

  return (
    <AdminShell
      active="dashboard"
      onNavigate={() => {}}
      onLogout={onLogout}
      onBack={onBack}
      title={contact ? (contact.name || contact.profileName || `+${contact.waId}`) : 'Contact Details'}
    >
      {loading ? (
        <div className="grid lg:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-[400px]">
            <div className="h-6 w-3/4 animate-shimmer rounded mb-2"></div>
            <div className="h-4 w-1/2 animate-shimmer rounded mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 w-full animate-shimmer rounded"></div>
              <div className="h-4 w-5/6 animate-shimmer rounded"></div>
              <div className="h-4 w-full animate-shimmer rounded"></div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm h-[300px] p-6">
              <div className="h-5 w-40 animate-shimmer rounded mb-6"></div>
              <div className="h-16 w-full animate-shimmer rounded mb-4"></div>
              <div className="h-16 w-full animate-shimmer rounded"></div>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="text-red-700 bg-red-50/80 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3 animate-fade-in-up">
          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      ) : !contact ? null : (
        <div className="grid lg:grid-cols-3 gap-6 animate-fade-in-up">
          {/* Left column - identity & meta */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-admin-accent to-admin-accentHover opacity-5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-500"></div>
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl border border-slate-200 shadow-sm">
                  {(contact.name || contact.profileName || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-800 tracking-tight">{contact.name || contact.profileName || '(unnamed)'}</div>
                  {contact.profileName && contact.profileName !== contact.name && (
                    <div className="text-[13px] text-slate-500 mt-0.5 font-medium">WA: {contact.profileName}</div>
                  )}
                </div>
              </div>
              <div className="space-y-4 text-[14px] relative z-10">
                <Row icon={Phone} label="Mobile">
                  <a href={`tel:+${String(contact.waId).replace(/\D/g, '')}`} className="hover:underline font-mono">
                    {formatPhone(contact.waId)}
                  </a>
                </Row>
                {country?.name && (
                  <Row icon={Globe2} label="Country">{country.name}</Row>
                )}
                <Row icon={Calendar} label="First message">
                  {contact.firstMessageAt
                    ? ist(contact.firstMessageAt).format('DD MMM YYYY, h:mm A')
                    : '—'}
                </Row>
                <Row icon={Calendar} label="Last activity">
                  {contact.lastMessageAt
                    ? ist(contact.lastMessageAt).format('DD MMM YYYY, h:mm A')
                    : '—'}
                </Row>
                <Row icon={MessageCircle} label="Current call status">
                  <span
                    className={
                      'inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold tracking-wide ' +
                      (statusColor[contact.callStatus || 'none'] || 'bg-slate-100 text-slate-700')
                    }
                  >
                    {STATUS_LABEL[contact.callStatus || 'none'] || contact.callStatus || '—'}
                  </span>
                </Row>
              </div>
              {contact.firstMessagePreview && (
                <div className="mt-6 pt-5 border-t border-slate-100 relative z-10">
                  <div className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">First message</div>
                  <div className="text-[14px] text-slate-700 break-words bg-slate-50 p-3.5 rounded-xl border border-slate-100 italic">
                    "{contact.firstMessagePreview}"
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column - histories */}
          <div className="lg:col-span-2 space-y-6">
            <Section icon={History} title="Call status history" count={callHistory.length}>
              {callHistory.length === 0 ? (
                <Empty>No status changes yet.</Empty>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-6 py-2">
                  {callHistory.map((h, idx) => (
                    <div key={String(h._id || idx)} className={`relative animate-fade-in-up stagger-${(idx % 5) + 1}`}>
                      <span className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-admin-accent ring-4 ring-white" />
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={
                            'text-[13px] px-2.5 py-1 rounded-full font-semibold tracking-wide ' +
                            (statusColor[h.status] || 'bg-slate-100 text-slate-700')
                          }
                        >
                          {STATUS_LABEL[h.status] || h.status || '—'}
                        </span>
                        {idx === 0 && (
                          <span className="text-[11px] uppercase tracking-wider text-admin-accent font-bold bg-admin-accent/10 px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-slate-500 mt-1.5 font-medium flex items-center gap-1.5">
                        <Calendar size={14} />
                        {h.createdAt ? ist(h.createdAt).format('DD MMM YYYY, h:mm A') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section icon={StickyNote} title="Internal notes" count={notes.length}>
              {notes.length === 0 ? (
                <Empty>No notes yet.</Empty>
              ) : (
                <div className="space-y-4">
                  {notes.map((n, idx) => (
                    <div
                      key={String(n._id || idx)}
                      className={`bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300 animate-fade-in-up stagger-${(idx % 5) + 1}`}
                    >
                      <div className="text-[14px] text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                        {n.text}
                      </div>
                      <div className="text-[12px] text-slate-500 mt-3 font-medium flex items-center gap-1.5 border-t border-slate-200/60 pt-3">
                        <Calendar size={14} className="text-slate-400" />
                        {n.createdAt ? ist(n.createdAt).format('DD MMM YYYY, h:mm A') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors -ml-2">
      <Icon size={18} className="text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="mt-1 text-slate-800 font-medium">{children}</div>
      </div>
    </div>
  );
}
function Section({ icon: Icon, title, count, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="w-8 h-8 rounded-lg bg-admin-accent/10 flex items-center justify-center">
          <Icon size={18} className="text-admin-accent" />
        </div>
        <div className="font-bold text-slate-800 tracking-tight text-[15px]">{title}</div>
        {typeof count === 'number' && (
          <span className="text-[12px] font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-auto">
            {count}
          </span>
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      <StickyNote size={32} className="text-slate-300 mb-3" />
      <div className="text-[14px] text-slate-500 font-medium">{children}</div>
    </div>
  );
}
