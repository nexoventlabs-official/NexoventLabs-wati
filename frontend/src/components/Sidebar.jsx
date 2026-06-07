import React, { useRef, useState } from 'react';
import { Search, Filter, Plus, FileText, X, Bell, BellOff, MoreVertical, Pin, PinOff, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { Contacts } from '../api/client';
import Avatar from './Avatar.jsx';
import useClickAway from '../utils/useClickAway';

export default function Sidebar({
  contacts, selectedId, onSelect, query, setQuery, range, setRange,
  onOpenTemplates, onAddContact,
  notifyEnabled = false, notifyPerm = 'default', onToggleNotifications,
  loading = false,
  onContactsChanged,
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newNum, setNewNum] = useState('');
  const [newName, setNewName] = useState('');
  const [menuId, setMenuId] = useState(null); // contact id whose dropdown is open

  // Refs for click-away: we whitelist both the popover body AND the trigger
  // button so clicking the trigger to close doesn't immediately re-open via
  // the outside-click detection firing first.
  const addFormRef = useRef(null);
  const addBtnRef = useRef(null);
  const filterFormRef = useRef(null);
  const filterBtnRef = useRef(null);
  const menuRef = useRef(null);
  useClickAway([addFormRef, addBtnRef], () => setShowAdd(false), showAdd);
  useClickAway([filterFormRef, filterBtnRef], () => setShowFilter(false), showFilter);
  useClickAway([menuRef], () => setMenuId(null), !!menuId);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newNum.replace(/\D/g, '')) return;
    const contact = await Contacts.create({ waId: newNum.replace(/\D/g, ''), name: newName });
    setShowAdd(false);
    setNewNum('');
    setNewName('');
    onAddContact && onAddContact(contact);
  }

  async function handlePin(c) {
    setMenuId(null);
    try {
      await Contacts.pin(c._id, !c.pinned);
      onContactsChanged && onContactsChanged();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to update pin');
    }
  }

  async function handleDelete(c) {
    setMenuId(null);
    const label = c.name || c.profileName || `+${c.waId}`;
    if (!confirm(`Delete "${label}" and its entire chat (messages + media)? This cannot be undone.`)) return;
    try {
      await Contacts.remove(c._id);
      if (selectedId === c._id) onSelect(null);
      onContactsChanged && onContactsChanged();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to delete contact');
    }
  }

  return (
    <aside className="w-[24rem] min-w-[20rem] max-w-[28rem] bg-wati-sidebar border-r border-wati-border flex flex-col">
      {/* Header */}
      <div className="bg-wati-sidebar px-4 py-3 flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <img
            src="/banner1.png"
            alt="Nexovent Labs - Wati"
            className="h-14 w-auto object-contain rounded"
          />
        </div>
        <div className="flex items-center gap-1">
          {onToggleNotifications && (
            <button
              onClick={onToggleNotifications}
              title={
                notifyPerm === 'denied'
                  ? 'Notifications blocked - enable in browser settings'
                  : notifyEnabled
                    ? 'Desktop notifications: ON (click to mute)'
                    : 'Enable desktop notifications'
              }
              className={clsx(
                'p-2 rounded-full transition-colors',
                notifyEnabled
                  ? 'bg-wati-primary/10 text-wati-primary hover:bg-wati-primary/20'
                  : notifyPerm === 'denied'
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-wati-muted hover:bg-gray-200'
              )}
            >
              {notifyEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
          )}
          <button
            ref={addBtnRef}
            onClick={() => setShowAdd(v => !v)}
            title="Add new contact"
            className={clsx(
              'p-2 rounded-full transition-colors',
              showAdd
                ? 'bg-wati-primary text-white'
                : 'text-wati-muted hover:bg-wati-panel hover:text-wati-text'
            )}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {showAdd && (
        <form ref={addFormRef} onSubmit={handleAdd} className="p-3 border-b border-wati-border bg-wati-sidebar flex gap-2">
          <input
            autoFocus
            placeholder="+91xxxxxxxxxx"
            value={newNum}
            onChange={e => setNewNum(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-wati-panel text-wati-text border border-wati-border text-sm outline-none focus:ring-1 focus:ring-wati-primary"
          />
          <input
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-wati-panel text-wati-text border border-wati-border text-sm outline-none focus:ring-1 focus:ring-wati-primary"
          />
          <button className="px-3 py-2 rounded bg-wati-primary text-white text-sm">Add</button>
        </form>
      )}

      {/* Search + filter */}
      <div className="px-3 py-2 bg-wati-sidebar border-b border-wati-border flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 text-wati-muted" size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or number"
            className="w-full pl-9 pr-3 py-2 rounded bg-wati-panel text-wati-text border border-wati-border text-sm outline-none focus:ring-1 focus:ring-wati-primary placeholder-wati-muted"
          />
        </div>
        <button
          ref={filterBtnRef}
          onClick={() => setShowFilter(v => !v)}
          className={clsx('p-2 rounded-full', showFilter ? 'bg-wati-primary text-white' : 'hover:bg-wati-panel text-wati-muted')}
          title="Filter by date"
        >
          <Filter size={18} />
        </button>
      </div>

      {showFilter && (
        <div ref={filterFormRef} className="px-3 py-2 bg-wati-sidebar border-b border-wati-border flex items-center gap-2 text-xs">
          <label className="flex-1">
            From
            <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-wati-panel border border-wati-border text-wati-text mt-0.5 outline-none" />
          </label>
          <label className="flex-1">
            To
            <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-wati-panel border border-wati-border text-wati-text mt-0.5 outline-none" />
          </label>
          {(range.from || range.to) && (
            <button onClick={() => setRange({ from: '', to: '' })} className="text-wati-muted mt-4"><X size={14} /></button>
          )}
        </div>
      )}

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-wati-border">
              <div className="w-[48px] h-[48px] rounded-full bg-white/5 animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2.5 mt-0.5">
                <div className="flex justify-between items-center">
                  <div className="h-3.5 bg-white/5 rounded w-[60%] animate-pulse" />
                  <div className="h-2.5 bg-white/5 rounded w-10 animate-pulse" />
                </div>
                <div className="h-2.5 bg-white/5 rounded w-[80%] animate-pulse" />
              </div>
            </div>
          ))
        ) : contacts.length === 0 ? (
          <div className="p-6 text-center text-sm text-wati-muted">
            No contacts yet.<br />Incoming WhatsApp messages or the + button will add them.
          </div>
        ) : contacts.map(c => (
          <div
            key={c._id}
            onClick={() => onSelect(c._id)}
            className={clsx(
              'group relative w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-wati-panel transition-colors cursor-pointer',
              selectedId === c._id ? 'bg-wati-panel hover:bg-wati-panel' : 'border-b border-wati-border'
            )}
          >
            <Avatar name={c.name || c.profileName || c.waId} url={c.profilePicUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="font-medium text-wati-text truncate min-w-0 flex items-center gap-1.5">
                  {c.pinned && <Pin size={13} className="text-wati-primary shrink-0 fill-current" />}
                  <span className="truncate">{c.name || c.profileName || `+${c.waId}`}</span>
                </div>
                <div className="text-[11px] text-wati-muted ml-2 shrink-0">
                  {c.lastMessageAt ? dayjs(c.lastMessageAt).format('h:mm A') : ''}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-wati-muted truncate">
                  {c.lastMessagePreview || `+${c.waId}`}
                </div>
                {/* Hide the unread badge for the currently-open chat regardless
                    of any pending server upserts. Once the user has selected
                    this contact, the chat is being read in real time. */}
                {c.unreadCount > 0 && c._id !== selectedId && (
                  <span className="ml-2 bg-wati-primary text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Per-contact dropdown trigger (appears on hover or when open) */}
            <button
              onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c._id ? null : c._id); }}
              className={clsx(
                'absolute right-2 top-2 p-1 rounded-full hover:bg-white/10 text-wati-muted hover:text-wati-text transition-opacity',
                menuId === c._id ? 'opacity-100 bg-white/10' : 'opacity-0 group-hover:opacity-100'
              )}
              title="Options"
            >
              <MoreVertical size={16} />
            </button>

            {menuId === c._id && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-9 z-30 w-44 bg-wati-panel border border-wati-border rounded-lg shadow-xl py-1 text-sm"
              >
                <button
                  onClick={() => handlePin(c)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-wati-text hover:bg-white/5 text-left"
                >
                  {c.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  {c.pinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-red-500/10 text-left"
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
