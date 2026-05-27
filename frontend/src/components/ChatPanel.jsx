import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Messages, Contacts } from '../api/client';
import { socket } from '../api/socket';
import MessageList from './MessageList.jsx';
import MessageInput from './MessageInput.jsx';
import WindowTimer from './WindowTimer.jsx';
import { CALL_STATUSES } from '../utils/callStatus';
import { windowState } from '../utils/time';
import { MessageCircle, StickyNote, X, AlertCircle, Trash2, PanelRightOpen, PanelRightClose, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import Avatar from './Avatar.jsx';
import NotesDialog from './NotesDialog.jsx';

// Ordering key used everywhere: (createdAt ms, seq, _id as last-resort tiebreak)
function orderKey(m) {
  const t = m?.createdAt ? new Date(m.createdAt).getTime() : 0;
  const s = Number(m?.seq || 0);
  return [t, s];
}
// Insert a message into a chronologically-sorted list, preserving order.
function insertSorted(list, m) {
  const [mt, ms] = orderKey(m);
  let i = list.length;
  while (i > 0) {
    const [pt, ps] = orderKey(list[i - 1]);
    if (pt < mt || (pt === mt && ps <= ms)) break;
    i--;
  }
  const copy = list.slice();
  copy.splice(i, 0, m);
  return copy;
}

export default function ChatPanel({ contact, onContactUpdate, onOpenTemplates, detailsOpen = false, onToggleDetails }) {
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [typingByCustomer, setTypingByCustomer] = useState(false);
  // Notes history modal (opened from the sticky-note icon in the chat header).
  const [notesOpen, setNotesOpen] = useState(false);
  const [toast, setToast] = useState(null); // { type, msg }
  const [loading, setLoading] = useState(false);
  const [unreadData, setUnreadData] = useState(null);
  const listRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  }
  function extractError(e) {
    return e?.response?.data?.error
      || e?.response?.data?.details?.error?.message
      || e?.response?.data?.message
      || e?.message
      || 'Unknown error';
  }

  const ws = useMemo(
    () => windowState(contact?.lastCustomerMessageAt, contact?.source),
    [contact?.lastCustomerMessageAt, contact?.source]
  );
  const windowExpired = ws.expired;

  // Load messages when contact changes
  useEffect(() => {
    if (!contact?._id) { setMessages([]); setUnreadData(null); return; }
    
    const unreads = contact.unreadCount || 0;
    setReplyTo(null);
    setMessages([]); // Clear old messages immediately for fast UX
    setUnreadData(null);
    setLoading(true);
    Messages.list(contact._id).then(msgs => {
      setMessages(msgs);
      
      if (unreads > 0) {
        let inboundCount = 0;
        let dividerMsgId = null;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].direction === 'inbound') {
            inboundCount++;
            if (inboundCount === unreads) {
              dividerMsgId = msgs[i]._id;
              break;
            }
          }
        }
        if (dividerMsgId) {
          setUnreadData({ count: unreads, msgId: dividerMsgId });
        }
      }
      
      setLoading(false);
    }).catch(() => setLoading(false));
    // Optimistically zero the badge in the parent list so the user never sees
    // an "1" / "2" pip on the chat they're actively viewing - even if the
    // server's contact:upsert lags behind the markRead HTTP call.
    if (contact.unreadCount && onContactUpdate) {
      onContactUpdate({ ...contact, unreadCount: 0 });
    }
    Contacts.markRead(contact._id).catch(() => {});
  }, [contact?._id]);

  // Socket listeners
  useEffect(() => {
    const onNew = (m) => {
      if (!contact) return;
      if (String(m.contact) !== String(contact._id) && m.waId !== contact.waId) return;
      setMessages(prev => {
        if (prev.find(x => x._id === m._id || (m.wamid && x.wamid === m.wamid))) return prev;
        // Insert in correct chronological position using (createdAt, seq) so rapid-fire
        // webhook arrivals don't end up at the bottom of the list out of order.
        return insertSorted(prev, m);
      });
      if (m.direction === 'inbound') {
        // Optimistically zero the unread badge in the sidebar so the
        // currently-open chat never appears to have unread items.
        if (onContactUpdate) onContactUpdate({ ...contact, unreadCount: 0 });
        Contacts.markRead(contact._id).catch(() => {});
      }
    };
    const onUpd = (m) => {
      setMessages(prev => {
        const prevMsg = prev.find(x => x._id === m._id);
        // Notify if status flipped to failed
        if (prevMsg && prevMsg.status !== 'failed' && m.status === 'failed') {
          const reason = m.failureSummary?.title || 'Message failed to deliver';
          const detail = m.failureSummary?.detail ? ` — ${m.failureSummary.detail}` : '';
          showToast('error', `${reason}${detail}`);
        }
        return prev.map(x => x._id === m._id ? m : x);
      });
    };
    const onTyping = ({ contactId, typing }) => {
      if (contact && contactId === contact._id) setTypingByCustomer(!!typing);
    };
    const onDel = ({ id, contactId }) => {
      if (!contact) return;
      if (contactId && String(contactId) !== String(contact._id)) return;
      setMessages(prev => prev.filter(x => x._id !== id));
    };
    const onCleared = ({ contactId }) => {
      if (!contact) return;
      if (String(contactId) === String(contact._id)) setMessages([]);
    };
    socket.on('message:new', onNew);
    socket.on('message:update', onUpd);
    socket.on('message:delete', onDel);
    socket.on('chat:cleared', onCleared);
    socket.on('customer:typing', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:update', onUpd);
      socket.off('message:delete', onDel);
      socket.off('chat:cleared', onCleared);
      socket.off('customer:typing', onTyping);
    };
  }, [contact]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Add a message to state, deduping by _id or wamid. Keeps array in chronological order.
  const upsertMessage = useCallback((msg) => {
    setMessages(prev => {
      const idx = prev.findIndex(x => x._id === msg._id || (msg.wamid && x.wamid === msg.wamid));
      if (idx === -1) return insertSorted(prev, msg);
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...msg };
      return copy;
    });
  }, []);

  const handleSendText = useCallback(async (text) => {
    if (!contact) return;
    try {
      const msg = await Messages.sendText(contact._id, { text, replyTo: replyTo?.wamid });
      upsertMessage(msg);
      setReplyTo(null);
    } catch (e) {
      showToast('error', 'Send failed: ' + extractError(e));
      throw e;
    }
  }, [contact, replyTo, upsertMessage]);

  const handleSendMedia = useCallback(async ({ type, url, caption, filename }) => {
    if (!contact) return;
    try {
      const msg = await Messages.sendMedia(contact._id, { type, url, caption, filename });
      upsertMessage(msg);
    } catch (e) {
      showToast('error', 'Send failed: ' + extractError(e));
      throw e;
    }
  }, [contact, upsertMessage]);

  const handleSendTemplate = useCallback(async ({ templateName, language, components, previewText }) => {
    if (!contact) return;
    try {
      const msg = await Messages.sendTemplate(contact._id, { templateName, language, components, previewText });
      upsertMessage(msg);
      showToast('success', 'Template sent.');
    } catch (e) {
      showToast('error', 'Template failed: ' + extractError(e));
      throw e;
    }
  }, [contact, upsertMessage]);

  const handleReact = useCallback(async (m, emoji) => {
    if (!contact) return;
    
    // Optimistic UI update for instant feedback
    setMessages(prev => prev.map(msg => {
      if (msg._id === m._id) {
        const newReactions = (msg.reactions || []).filter(r => r.from !== 'agent');
        if (emoji) newReactions.push({ from: 'agent', emoji });
        return { ...msg, reactions: newReactions };
      }
      return msg;
    }));

    try {
      await Messages.sendReaction(contact._id, { wamid: m.wamid, emoji });
    } catch (e) {
      showToast('error', 'Reaction failed: ' + extractError(e));
    }
  }, [contact]);

  const handleDelete = useCallback(async (m) => {
    try {
      await Messages.delete(m._id);
      // Socket 'message:delete' will remove it from state; also remove locally for snappier UX
      setMessages(prev => prev.filter(x => x._id !== m._id));
    } catch (e) {
      showToast('error', 'Delete failed: ' + extractError(e));
    }
  }, []);

  const handleClearChat = useCallback(async () => {
    if (!contact) return;
    const name = contact.name || contact.profileName || `+${contact.waId}`;
    if (!confirm(`Clear entire chat with ${name}?\n\nAll messages and uploaded media will be permanently deleted. The contact and their name will be kept.`)) return;
    try {
      const r = await Contacts.clearChat(contact._id);
      setMessages([]);
      showToast('success', `Cleared ${r.deletedMessages || 0} messages and media.`);
    } catch (e) {
      showToast('error', 'Clear chat failed: ' + extractError(e));
    }
  }, [contact]);

  // Call status change
  const handleStatusChange = async (e) => {
    if (!contact) return;
    const updated = await Contacts.update(contact._id, { callStatus: e.target.value });
    onContactUpdate && onContactUpdate(updated);
  };


  if (!contact) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center chat-bg pb-20">
        <div className="text-center text-wati-muted max-w-md">
          <img 
            src="/image.png" 
            alt="Welcome" 
            className="w-72 max-w-[80%] mx-auto mb-8 opacity-90 mix-blend-multiply"
          />
          <div className="text-2xl font-light text-[#41525d]">Select a contact to start chatting</div>
          <div className="text-[14px] mt-4 text-[#8696a0]">
            Inbound WhatsApp messages appear here in real time. Click on a chat from the sidebar to view the conversation.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col relative">
      {toast && (
        <div className={clsx(
          'absolute top-16 left-1/2 -translate-x-1/2 z-30 px-3 py-2 rounded shadow-lg text-sm flex items-start gap-2 max-w-[90%]',
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        )}>
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1 break-words">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="bg-wati-panel px-4 py-2 flex items-center gap-3 border-b border-[#d1d7db]">
        <Avatar name={contact.name || contact.profileName || contact.waId} url={contact.profilePicUrl} size={40} />
        <button
          onClick={onToggleDetails}
          className="flex-1 min-w-0 text-left"
          title={detailsOpen ? 'Hide contact details' : 'Show contact details'}
        >
          <div className="font-semibold text-wati-text truncate">
            {contact.name || contact.profileName || `+${contact.waId}`}
          </div>
          <div className="text-xs text-wati-muted flex items-center gap-2">
            <span>+{contact.waId}</span>
            {typingByCustomer && (
              <span className="text-wati-primary flex items-center gap-1">
                typing <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setNotesOpen(true)}
          title="Internal notes"
          className="p-2 rounded-full hover:bg-gray-200 text-wati-muted relative"
        >
          <StickyNote size={20} />
          {(contact.notes?.length > 0 || contact.comment) && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-wati-primary" />
          )}
        </button>

        <select
          value={contact.callStatus || 'none'}
          onChange={handleStatusChange}
          className="text-xs bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-wati-primary"
        >
          {CALL_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <WindowTimer lastCustomerMessageAt={contact.lastCustomerMessageAt} source={contact.source} />

        <button
          onClick={handleClearChat}
          title="Clear chat"
          className="p-2 rounded-full hover:bg-red-50 text-wati-muted hover:text-red-600 transition-colors"
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={onToggleDetails}
          title={detailsOpen ? 'Hide contact details' : 'Show contact details'}
          className={clsx(
            'p-2 rounded-full transition-colors',
            detailsOpen
              ? 'bg-wati-primary/10 text-wati-primary'
              : 'hover:bg-gray-200 text-wati-muted'
          )}
        >
          {detailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>

      {/* Notes history dialog */}
      {notesOpen && (
        <NotesDialog
          contact={contact}
          onClose={() => setNotesOpen(false)}
          onContactUpdate={onContactUpdate}
        />
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto thin-scroll chat-bg px-3 sm:px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-6">
             <div className="bg-white/80 shadow-sm rounded-full p-2 text-wati-primary">
               <Loader2 className="animate-spin" size={20} />
             </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            unreadData={unreadData}
            onReply={setReplyTo}
            onDelete={handleDelete}
            onReact={handleReact}
          />
        )}
      </div>

      {/* Input */}
      <MessageInput
        contact={contact}
        disabled={windowExpired}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSendText={handleSendText}
        onSendMedia={handleSendMedia}
        onSendTemplate={handleSendTemplate}
        onOpenTemplates={onOpenTemplates}
      />
    </main>
  );
}
