import React, { useEffect, useRef, useState } from 'react';
import { StickyNote, X, Plus, Trash2 } from 'lucide-react';
import { Contacts } from '../api/client';
import { ist } from '../utils/time';

// Modal dialog that shows the full history of internal notes for a contact,
// sorted newest-first, and lets the agent append a new note. Notes are
// append-only; each entry carries its own timestamp (server-side) so the log
// acts as an audit trail.
//
// Props:
//   - contact: current contact doc (must include `_id`, optional `notes[]`)
//   - onClose: invoked when the user dismisses the dialog (backdrop / Esc / X)
//   - onContactUpdate: (updatedContact) => void -- the parent list stays in
//       sync after a note is added / removed.
export default function NotesDialog({ contact, onClose, onContactUpdate }) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const textareaRef = useRef(null);

  // Auto-focus the input so the user can type immediately.
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const notes = Array.isArray(contact?.notes) ? [...contact.notes] : [];
  // If there's no new-style notes[] yet but a legacy `comment` string is
  // present, synthesize a read-only entry so the history isn't lost.
  if (notes.length === 0 && contact?.comment) {
    notes.push({
      _id: 'legacy',
      text: contact.comment,
      createdAt: contact.updatedAt || contact.createdAt,
      __legacy: true,
    });
  }
  // Newest first for display.
  notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setErr('');
    try {
      const updated = await Contacts.addNote(contact._id, text);
      onContactUpdate?.(updated);
      setDraft('');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId) => {
    if (noteId === 'legacy') {
      // Legacy single-field comment: clear via existing update endpoint.
      try {
        const updated = await Contacts.update(contact._id, { comment: '' });
        onContactUpdate?.(updated);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message || 'Failed to delete');
      }
      return;
    }
    if (!window.confirm('Delete this note?')) return;
    try {
      const updated = await Contacts.deleteNote(contact._id, noteId);
      onContactUpdate?.(updated);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to delete');
    }
  };

  const onKeyDownInput = (e) => {
    // Ctrl/Cmd + Enter submits, plain Enter inserts newline for multi-line notes.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Only dismiss when the backdrop itself is clicked (not a drag from
        // inside the dialog that ended on the backdrop).
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="bg-white w-full max-w-md rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <StickyNote size={18} className="text-wati-primary" />
          <div className="flex-1">
            <div className="font-semibold text-wati-text">Internal notes</div>
            <div className="text-xs text-wati-muted truncate">
              {contact?.name || contact?.profileName || `+${contact?.waId}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-wati-muted"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Add new note */}
        <div className="p-3 border-b border-gray-100 bg-yellow-50">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDownInput}
            placeholder="Add a new note about this contact…"
            className="w-full resize-none rounded border border-yellow-200 bg-white px-3 py-2 text-sm text-wati-text outline-none focus:ring-2 focus:ring-yellow-300/70 placeholder-wati-muted"
            rows={3}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-[11px] text-wati-muted">
              Notes are append-only. Ctrl/Cmd + Enter to save.
            </div>
            <button
              onClick={handleAdd}
              disabled={!draft.trim() || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-wati-primary text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={14} /> {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>
          {err && (
            <div className="mt-2 text-xs text-red-600">{err}</div>
          )}
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {notes.length === 0 ? (
            <div className="text-center text-wati-muted text-sm py-10 px-4">
              No notes yet. Add the first note above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notes.map((n) => {
                const when = n.createdAt ? ist(n.createdAt) : null;
                return (
                  <li key={n._id || when?.valueOf()} className="px-4 py-3 flex items-start gap-3 group">
                    <StickyNote size={14} className="text-yellow-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-wati-text whitespace-pre-wrap break-words">
                        {n.text}
                      </div>
                      <div className="text-[11px] text-wati-muted mt-1 flex items-center gap-2">
                        <span>{when ? when.format('DD MMM YYYY, h:mm A') : '—'}</span>
                        {when && <span>· {when.fromNow()}</span>}
                        {n.__legacy && (
                          <span className="text-yellow-700">· legacy</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(n._id)}
                      title="Delete this note"
                      className="p-1.5 rounded-full text-wati-muted hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
