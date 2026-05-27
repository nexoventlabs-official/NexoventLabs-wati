import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { ChevronDown, Reply, Trash2, Smile, Check, CheckCheck, Download, FileText, ExternalLink, Phone, MessageSquare } from 'lucide-react';
import { formatMessageTime } from '../utils/time';

// Force download via Cloudinary's fl_attachment flag (Content-Disposition: attachment).
// For non-Cloudinary URLs, just return the original.
function toDownloadUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com')) return url;
  if (url.includes('/fl_attachment')) return url;
  return url.replace(/\/upload\//, '/upload/fl_attachment/');
}

// Trigger a browser download. Uses fl_attachment Cloudinary URL so Content-Disposition
// forces "save as" even for cross-origin files.
async function triggerDownload(url, filename) {
  if (!url) return;
  const dlUrl = toDownloadUrl(url);
  const a = document.createElement('a');
  a.href = dlUrl;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function prettyFileKind(mime, filename) {
  if (mime === 'application/pdf') return 'PDF';
  const ext = (filename || '').split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 5) return ext;
  if (!mime) return 'FILE';
  if (mime.includes('word')) return 'DOCX';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLSX';
  if (mime.includes('presentation')) return 'PPTX';
  return 'FILE';
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function StatusTicks({ status }) {
  if (status === 'read') return <CheckCheck size={14} className="text-sky-500" />;
  if (status === 'delivered') return <CheckCheck size={14} className="text-gray-400" />;
  if (status === 'sent') return <Check size={14} className="text-gray-400" />;
  return null;
}

function ReplyQuote({ wamid, allMessages }) {
  const original = allMessages.find(x => x.wamid === wamid);
  if (!original) return null;
  // Prefer template body if this was a template card (the user-visible content),
  // otherwise the regular text/caption. Keep the snippet short so a long template
  // body doesn't stretch the bubble to full width.
  const sourceText =
    original.templateData?.body ||
    original.text ||
    original.caption ||
    `[${original.type}]`;
  const oneLine = sourceText.replace(/\s+/g, ' ').trim();
  const preview = oneLine.length > 80 ? oneLine.slice(0, 80) + '…' : oneLine;
  const isCustomer = original.direction === 'inbound';

  const handleScroll = () => {
    const el = document.getElementById(`msg-${wamid}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bubble = el.querySelector('.shadow-bubble');
      if (bubble) {
        bubble.classList.add('ring-2', 'ring-wati-primary', 'transition-all', 'duration-300');
        setTimeout(() => {
          bubble.classList.remove('ring-2', 'ring-wati-primary');
        }, 1500);
      }
    }
  };

  return (
    <div 
      onClick={handleScroll}
      className={clsx(
      "mb-1.5 rounded-md overflow-hidden border-l-[3px] max-w-sm cursor-pointer hover:opacity-90 transition-opacity",
      isCustomer ? "bg-black/5 border-[#128C7E]" : "bg-black/5 border-wati-primary"
    )}>
      <div className="px-2.5 py-1.5 text-xs">
        <div className={clsx(
          "font-semibold mb-0.5",
          isCustomer ? "text-[#128C7E]" : "text-wati-primary"
        )}>
          {isCustomer ? 'Customer' : 'You'}
        </div>
        <div className="truncate text-[13px] text-wati-text/80">{preview}</div>
      </div>
    </div>
  );
}

// Decide whether a `templateData` payload is rich enough to warrant rendering
// it as a template card. Without this guard, an empty subdoc auto-created by
// Mongoose would blank out the entire chat bubble.
function hasTemplateContent(td) {
  if (!td) return false;
  if (td.body) return true;
  if (td.footer) return true;
  if (Array.isArray(td.buttons) && td.buttons.length > 0) return true;
  if (td.header && td.header.type && td.header.type !== 'NONE') return true;
  return false;
}

// Renders a template message as a WhatsApp-style card with body, footer, and
// real action buttons (URL / phone / quick reply). Used for any outbound message
// that has `templateData` set (paid Meta template send OR 24h-window short-circuit).
function TemplateCard({ data, name, fallbackMediaUrl }) {
  if (!data) return null;
  const header = data.header || {};
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  const headerMediaUrl = header.mediaUrl || fallbackMediaUrl;

  function btnIcon(t) {
    if (t === 'URL') return <ExternalLink size={14} />;
    if (t === 'PHONE_NUMBER') return <Phone size={14} />;
    return <MessageSquare size={14} />;
  }

  return (
    <div className="rounded-md overflow-hidden bg-white/70 border border-black/5 max-w-[320px]">
      {/* Header */}
      {header.type === 'IMAGE' && headerMediaUrl && (
        <img src={headerMediaUrl} alt="" className="w-full max-h-[200px] object-cover" />
      )}
      {header.type === 'VIDEO' && headerMediaUrl && (
        <video src={headerMediaUrl} controls className="w-full max-h-[220px]" />
      )}
      {header.type === 'DOCUMENT' && headerMediaUrl && (
        <a
          href={headerMediaUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 bg-red-50 px-3 py-2 hover:bg-red-100 border-b border-black/5"
        >
          <FileText size={20} className="text-red-600" />
          <span className="text-sm font-medium truncate">Document</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); triggerDownload(headerMediaUrl); }}
            className="ml-auto p-1 rounded-full hover:bg-red-200 text-red-700"
            title="Download"
          >
            <Download size={16} />
          </button>
        </a>
      )}
      {header.type === 'TEXT' && header.text && (
        <div className="px-3 pt-2 text-sm font-semibold">{header.text}</div>
      )}

      {/* Body */}
      {data.body && (
        <div className="px-3 py-2 whitespace-pre-wrap text-sm text-wati-text">{data.body}</div>
      )}

      {/* Footer */}
      {data.footer && (
        <div className="px-3 pb-2 text-xs text-wati-muted">{data.footer}</div>
      )}

      {/* Buttons - rendered as a vertical stack like WhatsApp */}
      {buttons.length > 0 && (
        <div className="border-t border-black/5 divide-y divide-black/5">
          {buttons.map((b, i) => {
            if (b.type === 'URL' && b.url) {
              return (
                <a
                  key={i}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-wati-primary hover:bg-black/5"
                >
                  {btnIcon(b.type)} {b.text || 'Open link'}
                </a>
              );
            }
            if (b.type === 'PHONE_NUMBER' && b.phone_number) {
              return (
                <a
                  key={i}
                  href={`tel:${b.phone_number}`}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-wati-primary hover:bg-black/5"
                >
                  {btnIcon(b.type)} {b.text || 'Call'}
                </a>
              );
            }
            // QUICK_REPLY - non-clickable preview (customer taps it on phone)
            return (
              <div
                key={i}
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-wati-muted"
              >
                {btnIcon(b.type)} {b.text || 'Reply'}
              </div>
            );
          })}
        </div>
      )}

      {name && (
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-wati-muted bg-black/5 border-t border-black/5">
          📄 Template: {name}
        </div>
      )}
    </div>
  );
}

function MediaPlaceholder({ type, filename }) {
  const labelByType = {
    image: 'Downloading image…',
    video: 'Downloading video…',
    audio: 'Downloading audio…',
    sticker: 'Downloading sticker…',
    document: filename || 'Downloading document…',
  };
  const sizeByType = {
    image: 'w-[240px] h-[180px]',
    video: 'w-[260px] h-[180px]',
    sticker: 'w-28 h-28',
    audio: 'w-[240px] h-[40px]',
    document: 'w-[220px] h-[40px]',
  };
  return (
    <div className={`rounded bg-black/5 flex items-center justify-center text-xs text-wati-muted ${sizeByType[type] || 'w-[220px] h-[40px]'}`}>
      <span className="animate-pulse">{labelByType[type] || 'Loading…'}</span>
    </div>
  );
}

function Media({ m }) {
  if (m.type === 'image') {
    return m.mediaUrl
      ? <img src={m.mediaUrl} alt={m.caption || ''} className="rounded max-w-[280px] max-h-[320px] object-cover" />
      : <MediaPlaceholder type="image" />;
  }
  if (m.type === 'video') {
    return m.mediaUrl
      ? <video src={m.mediaUrl} controls className="rounded max-w-[320px] max-h-[320px]" />
      : <MediaPlaceholder type="video" />;
  }
  if (m.type === 'audio') {
    return m.mediaUrl
      ? <audio src={m.mediaUrl} controls className="w-[260px]" />
      : <MediaPlaceholder type="audio" />;
  }
  if (m.type === 'sticker') {
    return m.mediaUrl
      ? <img src={m.mediaUrl} alt="sticker" className="w-28 h-28 object-contain" />
      : <MediaPlaceholder type="sticker" />;
  }
  if (m.type === 'document') {
    if (!m.mediaUrl) return <MediaPlaceholder type="document" filename={m.mediaFilename} />;
    const kind = prettyFileKind(m.mediaMime, m.mediaFilename);
    const isPdf = m.mediaMime === 'application/pdf' || /\.pdf$/i.test(m.mediaFilename || '');
    return (
      <div className="flex items-center gap-3 bg-white/70 rounded px-2 py-2 min-w-[240px] max-w-[300px]">
        <a
          href={m.mediaUrl}
          target="_blank"
          rel="noreferrer"
          className={clsx(
            'shrink-0 w-10 h-12 rounded flex items-center justify-center',
            isPdf ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-600'
          )}
          title="Open"
        >
          <FileText size={22} />
        </a>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{m.mediaFilename || 'Document'}</div>
          <div className="text-[11px] text-wati-muted uppercase tracking-wide">{kind}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); triggerDownload(m.mediaUrl, m.mediaFilename); }}
          title="Download"
          className="shrink-0 p-2 rounded-full hover:bg-black/10 text-wati-muted"
        >
          <Download size={18} />
        </button>
      </div>
    );
  }
  return null;
}

export default function MessageBubble({ message: m, allMessages, onReply, onDelete, onReact, isNearBottom }) {
  const out = m.direction === 'outbound';
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const menuRef = useRef(null);
  const reactRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
      if (reactRef.current && !reactRef.current.contains(e.target)) {
        setReactOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function onContextMenu(e) {
    e.preventDefault();
    setMenuOpen(true);
  }

  const reactions = m.reactions || [];
  const hasReactions = reactions.length > 0;

  return (
    <div
      id={m.wamid ? `msg-${m.wamid}` : undefined}
      className={clsx(
        'flex msg-enter group relative items-center',
        out ? 'justify-end' : 'justify-start',
        hasReactions && 'mb-4'
      )}
    >
      {/* Floating Reaction Picker */}
      {reactOpen && (
        <div ref={reactRef} className={clsx(
          "absolute z-20 -top-8 bg-white rounded-full shadow-lg border border-black/5 px-2 py-1.5 flex gap-1 items-center animate-in fade-in zoom-in-95 duration-150",
          out ? "right-8" : "left-8"
        )}>
          {QUICK_REACTIONS.map(emj => (
            <button
              key={emj}
              onClick={() => { onReact(m, emj); setReactOpen(false); }}
              className="text-xl hover:scale-125 transition px-1"
            >
              {emj}
            </button>
          ))}
          <button
            onClick={() => { onReact(m, ''); setReactOpen(false); }}
            className="text-[10px] text-wati-muted px-2 hover:text-gray-800 border-l border-gray-100 ml-1"
            title="Clear reaction"
          >
            ✖
          </button>
        </div>
      )}

      <div
        className={clsx(
          'relative max-w-[75%] rounded-lg px-2 pt-1.5 pb-1 shadow-bubble',
          out ? 'bg-wati-bubbleOut' : 'bg-wati-bubbleIn',
        )}
        onContextMenu={onContextMenu}
      >
        {/* Dropdown trigger (top-right) */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className={clsx(
            'absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition',
            'p-0.5 rounded hover:bg-black/10'
          )}
          aria-label="Message menu"
        >
          <ChevronDown size={16} className="text-wati-muted" />
        </button>

        {menuOpen && (
          <div ref={menuRef} className={clsx(
            "absolute z-10 bg-white rounded-lg shadow-lg border py-1 text-sm min-w-[150px]",
            out ? "right-1" : "left-[calc(100%-2rem)]",
            isNearBottom ? "top-1 -translate-y-full" : "top-6"
          )}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => { setReactOpen(v => !v); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100"
            >
              <Smile size={16} /> React
            </button>
            <button
              onClick={() => { onReply(m); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100"
            >
              <Reply size={16} /> Reply
            </button>
            {/* Download - only for media messages with a resolved URL */}
            {m.mediaUrl && ['image', 'video', 'audio', 'document', 'sticker'].includes(m.type) && (
              <button
                onClick={() => { triggerDownload(m.mediaUrl, m.mediaFilename); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100"
              >
                <Download size={16} /> Download
              </button>
            )}
            {out && !m.deleted && (
              <button
                onClick={() => { onDelete(m); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 text-red-600"
              >
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
        )}

        {/* Reply quote */}
        {m.replyToWamid && <ReplyQuote wamid={m.replyToWamid} allMessages={allMessages} />}

        {/* Body */}
        {m.deleted ? (
          <div className="text-wati-muted italic text-sm py-1 pr-10">This message was deleted</div>
        ) : hasTemplateContent(m.templateData) ? (
          // Render rich template card (with body/footer/buttons) for any send that
          // came from a template - regardless of whether it went out as a paid
          // template or as a free-form 24h-window message.
          <TemplateCard
            data={m.templateData}
            name={m.templateName}
            fallbackMediaUrl={m.mediaUrl}
          />
        ) : (
          <>
            <Media m={m} />
            {m.type === 'template' && (
              <div className="text-xs bg-black/5 rounded px-2 py-1 inline-block mb-1">📄 Template: {m.templateName}</div>
            )}
            {(m.type === 'interactive' || m.type === 'button') && (m.text || m.caption) ? (
              // Customer tapped a native quick-reply / cta button. Render it as
              // a distinct pill so it looks like an action response.
              <div className="inline-flex items-center text-sm pr-14 mt-1 mb-0.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 border border-black/5 shadow-sm text-wati-text font-medium">
                  <span className="text-wati-primary font-bold">↳</span> {m.text || m.caption}
                </span>
              </div>
            ) : (m.text || m.caption) && (
              <div className="whitespace-pre-wrap text-[14px] leading-snug pr-14 text-wati-text">
                {m.text || m.caption}
              </div>
            )}
          </>
        )}

        {/* Failure banner */}
        {m.status === 'failed' && (
          <div className="mt-1 mb-1 rounded bg-red-50 border border-red-200 px-2 py-1.5 text-[11px] text-red-700">
            <div className="font-semibold">
              ⚠ {m.failureSummary?.title || 'Failed to deliver'}
            </div>
            {m.failureSummary?.detail && (
              <div className="mt-0.5 break-words">{m.failureSummary.detail}</div>
            )}
            {m.failureSummary?.href && (
              <a href={m.failureSummary.href} target="_blank" rel="noreferrer"
                className="underline mt-0.5 inline-block">
                Resolve in Meta dashboard ↗
              </a>
            )}
          </div>
        )}

        {/* Footer: time + status */}
        <div className={clsx('flex items-center justify-end gap-1 text-[11px] mt-0.5 -mb-0.5',
          m.status === 'failed' ? 'text-red-500' : 'text-wati-muted')}>
          <span>{formatMessageTime(m.createdAt)}</span>
          {out && (m.status === 'failed' ? <span className="font-semibold">failed</span> : <StatusTicks status={m.status} />)}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className={clsx('absolute -bottom-3.5 z-[1] flex gap-1', out ? 'right-2' : 'left-2')}>
            {reactions.map((r, i) => (
              <span
                key={i}
                title={r.from === 'agent' ? 'You' : 'Customer'}
                className="bg-white rounded-full border border-gray-200 shadow-sm px-1.5 py-0.5 text-[13px] leading-none"
              >
                {r.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Quick React Button (Inbound) - shows on right of bubble */}
      {!out && !m.deleted && (
        <div className="opacity-0 group-hover:opacity-100 transition px-2">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { setReactOpen(v => !v); setMenuOpen(false); }}
            className="p-1.5 rounded-full text-wati-muted hover:bg-black/5 hover:text-gray-700 transition-colors"
            title="React"
          >
            <Smile size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
