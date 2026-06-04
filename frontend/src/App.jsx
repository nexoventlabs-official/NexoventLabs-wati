import React, { useEffect, useRef, useState, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import TemplatesDrawer from './components/TemplatesDrawer.jsx';
import ContactDetailsPanel from './components/ContactDetailsPanel.jsx';
import StaffLogin from './components/StaffLogin.jsx';
import { Contacts, Admin } from './api/client';
import { socket } from './api/socket';
import {
  ensurePermission,
  notifPermission,
  isNotifSupported,
  getNotifyEnabled,
  setNotifyEnabled,
  showMessageNotification,
  playChime,
} from './utils/notify';

const SELECTED_CONTACT_KEY = 'wati:selectedContactId';
const DETAILS_OPEN_KEY = 'wati:detailsPanelOpen';
const TOKEN_KEY = 'vanigan:adminToken';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [verifying, setVerifying] = useState(!!token);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  // Restore previously opened chat across page refreshes.
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(SELECTED_CONTACT_KEY) || null; } catch { return null; }
  });
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  // Right-side contact details panel - open by default; user can toggle.
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try {
      const v = localStorage.getItem(DETAILS_OPEN_KEY);
      return v === null ? true : v === '1';
    } catch { return true; }
  });

  useEffect(() => {
    if (!token) { setVerifying(false); return; }
    let cancelled = false;
    Admin.me()
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) setToken(null);
      })
      .finally(() => { if (!cancelled) setVerifying(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  // Persist selected chat id on every change.
  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem(SELECTED_CONTACT_KEY, selectedId);
      else localStorage.removeItem(SELECTED_CONTACT_KEY);
    } catch { /* ignore quota / privacy-mode failures */ }
  }, [selectedId]);

  // Persist details-panel open state.
  useEffect(() => {
    try { localStorage.setItem(DETAILS_OPEN_KEY, detailsOpen ? '1' : '0'); }
    catch { /* ignore */ }
  }, [detailsOpen]);

  const load = useCallback(async () => {
    setLoadingContacts(true);
    const params = {};
    if (query) params.q = query;
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    try {
      const list = await Contacts.list(params);
      setContacts(list);
    } finally {
      setLoadingContacts(false);
    }
  }, [query, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sortContacts = (arr) => arr.slice().sort((a, b) => {
      // Pinned first (most recently pinned on top), then by last activity.
      if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (a.pinned && b.pinned) {
        return new Date(b.pinnedAt || 0) - new Date(a.pinnedAt || 0);
      }
      return new Date(b.lastMessageAt || b.updatedAt) - new Date(a.lastMessageAt || a.updatedAt);
    });
    const onUpsert = (c) => {
      setContacts(prev => {
        const idx = prev.findIndex(x => x._id === c._id);
        let copy;
        if (idx === -1) copy = [c, ...prev];
        else { copy = prev.slice(); copy[idx] = { ...copy[idx], ...c }; }
        return sortContacts(copy);
      });
    };
    const onDelete = ({ contactId }) => {
      setContacts(prev => prev.filter(x => x._id !== contactId));
      setSelectedId(prev => (prev === contactId ? null : prev));
    };
    socket.on('contact:upsert', onUpsert);
    socket.on('contact:delete', onDelete);
    return () => {
      socket.off('contact:upsert', onUpsert);
      socket.off('contact:delete', onDelete);
    };
  }, []);

  // ---- Browser notifications --------------------------------------------------
  // Track the currently-selected contact and the contact list in refs so the
  // socket handler can always read fresh values without re-subscribing on every
  // selection change (which would miss in-flight events).
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const contactsRef = useRef(contacts);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  const [notifPerm, setNotifPerm] = useState(notifPermission());
  const [notifyEnabled, setNotifyEnabledState] = useState(getNotifyEnabled());

  // Listen for inbound messages globally and surface them as desktop
  // notifications + a soft chime when the user isn't actively viewing that
  // chat (different contact selected, tab hidden, or window unfocused).
  useEffect(() => {
    const onMsgNew = (m) => {
      if (!m || m.direction !== 'inbound') return;

      const isViewingThisChat =
        selectedIdRef.current && String(selectedIdRef.current) === String(m.contact);
      const tabActive = !document.hidden && document.hasFocus?.() !== false;

      // Suppress alerts when the user is actively reading this chat.
      if (isViewingThisChat && tabActive) return;

      const c = (contactsRef.current || []).find(
        (x) => String(x._id) === String(m.contact)
      );
      const senderName = c?.name || c?.profileName || (m.waId ? `+${m.waId}` : 'New message');
      const preview = m.text || m.caption || (m.type ? `[${m.type}]` : 'New message');

      playChime();
      showMessageNotification({
        contactId: String(m.contact),
        title: senderName,
        body: preview.slice(0, 140),
        iconUrl: c?.profilePicUrl || '/logo.png',
        onClick: () => setSelectedId(String(m.contact)),
      });
    };
    socket.on('message:new', onMsgNew);
    return () => socket.off('message:new', onMsgNew);
  }, []);

  // Toggle: turn notifications on (asks the OS for permission the first time)
  // or off. We deliberately only request permission on a real user gesture so
  // browsers don't down-rank the site for spurious prompts.
  const toggleNotifications = useCallback(async () => {
    if (!isNotifSupported()) {
      alert('This browser does not support desktop notifications.');
      return;
    }
    if (notifyEnabled && notifPerm === 'granted') {
      // currently on -> turn off
      setNotifyEnabled(false);
      setNotifyEnabledState(false);
      return;
    }
    const result = await ensurePermission();
    setNotifPerm(result);
    if (result === 'granted') {
      setNotifyEnabled(true);
      setNotifyEnabledState(true);
    } else if (result === 'denied') {
      alert(
        'Notifications are blocked in your browser settings. Click the padlock icon in the address bar to allow notifications for this site.'
      );
    }
  }, [notifyEnabled, notifPerm]);

  const selected = contacts.find(c => c._id === selectedId);

  if (verifying) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-gray-500">
        Loading panel…
      </div>
    );
  }

  if (!token) {
    return <StaffLogin onLoggedIn={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-wati-panel">
      <Sidebar
        contacts={contacts}
        selectedId={selectedId}
        onSelect={setSelectedId}
        query={query}
        setQuery={setQuery}
        range={range}
        setRange={setRange}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onAddContact={load}
        onContactsChanged={load}
        notifyEnabled={notifyEnabled && notifPerm === 'granted'}
        notifyPerm={notifPerm}
        onToggleNotifications={toggleNotifications}
        loading={loadingContacts}
      />
      <ChatPanel
        contact={selected}
        onContactUpdate={(updated) => {
          setContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
        }}
        onOpenTemplates={() => setTemplatesOpen(true)}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen(v => !v)}
      />
      {selected && detailsOpen && (
        <ContactDetailsPanel
          contact={selected}
          onClose={() => setDetailsOpen(false)}
          onContactUpdate={(updated) => {
            setContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
          }}
        />
      )}
      {templatesOpen && (
        <TemplatesDrawer
          onClose={() => setTemplatesOpen(false)}
          onPick={(tpl) => {
            setTemplatesOpen(false);
            // handled via child ref / prop below
            window.dispatchEvent(new CustomEvent('template:use', { detail: tpl }));
          }}
        />
      )}
    </div>
  );
}
