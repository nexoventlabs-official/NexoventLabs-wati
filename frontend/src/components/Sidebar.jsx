import React, { useRef, useState } from 'react';
import { Search, Filter, Plus, FileText, X, Bell, BellOff } from 'lucide-react';
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
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newNum, setNewNum] = useState('');
  const [newName, setNewName] = useState('');

  // Refs for click-away: we whitelist both the popover body AND the trigger
  // button so clicking the trigger to close doesn't immediately re-open via
  // the outside-click detection firing first.
  const addFormRef = useRef(null);
  const addBtnRef = useRef(null);
  const filterFormRef = useRef(null);
  const filterBtnRef = useRef(null);
  useClickAway([addFormRef, addBtnRef], () => setShowAdd(false), showAdd);
  useClickAway([filterFormRef, filterBtnRef], () => setShowFilter(false), showFilter);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newNum.replace(/\D/g, '')) return;
    await Contacts.create({ waId: newNum.replace(/\D/g, ''), name: newName });
    setShowAdd(false);
    setNewNum('');
    setNewName('');
    onAddContact && onAddContact();
  }

  return (
    <aside className="w-[24rem] min-w-[20rem] max-w-[28rem] bg-wati-sidebar border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="bg-wati-panel px-4 py-3 flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <img
            src="/banner1.png"
            alt="Nexovent Labs - Wati"
            className="h-9 w-auto object-contain rounded"
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
        </div>
      </div>

      {showAdd && (
        <form ref={addFormRef} onSubmit={handleAdd} className="p-3 border-b bg-white flex gap-2">
          <input
            autoFocus
            placeholder="+91xxxxxxxxxx"
            value={newNum}
            onChange={e => setNewNum(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-100 text-sm outline-none focus:ring-1 focus:ring-wati-primary"
          />
          <input
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-100 text-sm outline-none focus:ring-1 focus:ring-wati-primary"
          />
          <button className="px-3 py-2 rounded bg-wati-primary text-white text-sm">Add</button>
        </form>
      )}

      {/* Search + filter */}
      <div className="px-3 py-2 bg-white border-b flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 text-wati-muted" size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or number"
            className="w-full pl-9 pr-3 py-2 rounded bg-gray-100 text-sm outline-none focus:ring-1 focus:ring-wati-primary"
          />
        </div>
        <button
          ref={filterBtnRef}
          onClick={() => setShowFilter(v => !v)}
          className={clsx('p-2 rounded-full', showFilter ? 'bg-wati-primary text-white' : 'hover:bg-gray-200 text-wati-muted')}
          title="Filter by date"
        >
          <Filter size={18} />
        </button>
      </div>

      {showFilter && (
        <div ref={filterFormRef} className="px-3 py-2 bg-white border-b flex items-center gap-2 text-xs">
          <label className="flex-1">
            From
            <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-gray-100 mt-0.5" />
          </label>
          <label className="flex-1">
            To
            <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-gray-100 mt-0.5" />
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
            <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-[#f2f2f2]">
              <div className="w-[48px] h-[48px] rounded-full bg-black/5 animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2.5 mt-0.5">
                <div className="flex justify-between items-center">
                  <div className="h-3.5 bg-black/5 rounded w-[60%] animate-pulse" />
                  <div className="h-2.5 bg-black/5 rounded w-10 animate-pulse" />
                </div>
                <div className="h-2.5 bg-black/5 rounded w-[80%] animate-pulse" />
              </div>
            </div>
          ))
        ) : contacts.length === 0 ? (
          <div className="p-6 text-center text-sm text-wati-muted">
            No contacts yet.<br />Incoming WhatsApp messages or the + button will add them.
          </div>
        ) : contacts.map(c => (
          <button
            key={c._id}
            onClick={() => onSelect(c._id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[#f5f6f6] transition-colors',
              selectedId === c._id ? 'bg-wati-panel hover:bg-wati-panel' : 'border-b border-[#f2f2f2]'
            )}
          >
            <Avatar name={c.name || c.profileName || c.waId} url={c.profilePicUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="font-medium text-wati-text truncate min-w-0">
                  {c.name || c.profileName || `+${c.waId}`}
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
          </button>
        ))}
      </div>
    </aside>
  );
}
