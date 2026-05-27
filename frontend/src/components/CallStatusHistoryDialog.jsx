import React, { useEffect } from 'react';
import { X, History } from 'lucide-react';
import { CALL_STATUSES, statusColor } from '../utils/callStatus';
import { ist } from '../utils/time';

// Modal dialog showing the full call-status audit log for a contact.
// Newest first. Read-only - history can only be reset via Clear chat.
export default function CallStatusHistoryDialog({ contact, onClose }) {
  // ESC closes the dialog (matches NotesDialog UX).
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const labelOf = (s) =>
    CALL_STATUSES.find((x) => x.value === s)?.label || s || '—';

  const entries = Array.isArray(contact?.callStatusHistory)
    ? [...contact.callStatusHistory].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-wati-sidebar border border-wati-border rounded-lg shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-wati-border">
          <History size={18} className="text-wati-primary" />
          <div className="flex-1">
            <div className="font-semibold text-wati-text">Call status history</div>
            <div className="text-[12px] text-wati-muted">
              {contact?.name || contact?.profileName || `+${contact?.waId}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-wati-panel text-wati-muted"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="text-center text-wati-muted py-10">
              <History size={32} className="mx-auto mb-2 opacity-40" />
              <div className="text-[14px]">No status changes yet</div>
              <div className="text-[12px] mt-1">
                Update the call status from the chat header to start the log.
              </div>
            </div>
          ) : (
            <ol className="relative border-l-2 border-wati-border ml-2 pl-5 space-y-4">
              {entries.map((entry, idx) => (
                <li key={String(entry._id || idx)} className="relative">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-wati-primary ring-4 ring-wati-sidebar" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={
                        'text-[13px] px-2 py-0.5 rounded font-medium ' +
                        (statusColor[entry.status] || 'bg-wati-panel text-wati-text border border-wati-border')
                      }
                    >
                      {labelOf(entry.status)}
                    </span>
                    {idx === 0 && (
                      <span className="text-[10px] uppercase tracking-wide text-wati-primary font-semibold">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-wati-muted mt-1">
                    {entry.createdAt
                      ? ist(entry.createdAt).format('DD MMM YYYY, h:mm A')
                      : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-wati-border text-[11px] text-wati-muted bg-wati-panel/30 rounded-b-lg">
          Audit log is append-only. It clears when you Clear chat.
        </div>
      </div>
    </div>
  );
}
