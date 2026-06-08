import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import EmojiPicker from 'emoji-picker-react';
import { Plus, Smile, Mic, Send, Paperclip, Image as ImageIcon, Video, FileText, StopCircle, X, File as FileIcon, Lock } from 'lucide-react';
import { Uploads } from '../api/client';
import { socket } from '../api/socket';
import useClickAway from '../utils/useClickAway';

export default function MessageInput({
  contact, disabled, replyTo, onCancelReply,
  onSendText, onSendMedia, onSendTemplate, onOpenTemplates,
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl, type }
  const [caption, setCaption] = useState('');

  const fileInput = useRef(null);
  const imgInput = useRef(null);
  const videoInput = useRef(null);
  const docInput = useRef(null);

  // Click-away dismissal for the attach popup and the emoji picker. We include
  // the trigger buttons in the whitelist so clicking them to toggle doesn't
  // fight with the outside-click detection.
  const attachMenuRef = useRef(null);
  const attachBtnRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  useClickAway([attachMenuRef, attachBtnRef], () => setShowAttach(false), showAttach);
  useClickAway([emojiPickerRef, emojiBtnRef], () => setShowEmoji(false), showEmoji);
  const mediaRec = useRef(null);
  const chunks = useRef([]);
  const recTimer = useRef(null);
  const typingTimer = useRef(null);

  // Template event listener
  useEffect(() => {
    const onUse = (e) => {
      const tpl = e.detail;
      if (!tpl) return;
      // Build components (best-effort)
      const components = [];
      if (tpl.header && tpl.header.type && tpl.header.type !== 'NONE' && tpl.header.type !== 'TEXT' && tpl.header.mediaUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: tpl.header.type.toLowerCase(), [tpl.header.type.toLowerCase()]: { link: tpl.header.mediaUrl } }],
        });
      }
      // Auto-fill {{1}} with the contact's name if the body uses it
      if (tpl.body && /\{\{\s*1\s*\}\}/.test(tpl.body) && contact?.name) {
        components.push({
          type: 'body',
          parameters: [{ type: 'text', text: contact.name || contact.profileName || '' }],
        });
      }
      onSendTemplate({
        templateName: tpl.name,
        language: tpl.language,
        components,
        previewText: tpl.body?.replace(/\{\{\s*1\s*\}\}/g, contact?.name || contact?.profileName || ''),
      });
    };
    window.addEventListener('template:use', onUse);
    return () => window.removeEventListener('template:use', onUse);
  }, [onSendTemplate, contact]);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText('');
    setShowEmoji(false);
  }

  function onTyping(e) {
    setText(e.target.value);
    // Emit typing to server (optional relay)
    socket.emit('agent:typing', { contactId: contact?._id, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('agent:typing', { contactId: contact?._id, typing: false });
    }, 1500);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // File attachment flow
  function pickFile(kind) {
    setShowAttach(false);
    if (kind === 'image') imgInput.current?.click();
    else if (kind === 'video') videoInput.current?.click();
    else if (kind === 'document') docInput.current?.click();
    else fileInput.current?.click();
  }

  async function onFileChosen(e, forcedType) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let type = forcedType;
    if (!type) {
      if (f.type.startsWith('image/')) type = 'image';
      else if (f.type.startsWith('video/')) type = 'video';
      else if (f.type.startsWith('audio/')) type = 'audio';
      else type = 'document';
    }
    const previewUrl = URL.createObjectURL(f);
    setPendingFile({ file: f, previewUrl, type });
  }

  async function confirmSendFile() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const up = await Uploads.upload(pendingFile.file, contact?.waId);
      await onSendMedia({
        type: pendingFile.type,
        url: up.url,
        caption: pendingFile.type === 'document' ? '' : caption,
        filename: pendingFile.type === 'document' ? pendingFile.file.name : undefined,
      });
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setCaption('');
    }
  }

  // Voice recording
  async function startRecord() {
    if (!navigator.mediaDevices?.getUserMedia) return alert('Microphone not supported');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: pickAudioMime() });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        stream.getTracks().forEach(t => t.stop());
        if (blob.size < 500) return; // too short
        setUploading(true);
        try {
          const file = new File([blob], `voice_${Date.now()}.${extOf(rec.mimeType)}`, { type: rec.mimeType });
          const up = await Uploads.upload(file, contact?.waId);
          await onSendMedia({ type: 'audio', url: up.url });
        } catch (e) {
          alert('Voice send failed: ' + (e.response?.data?.error || e.message));
        } finally {
          setUploading(false);
        }
      };
      mediaRec.current = rec;
      rec.start();
      setRecording(true);
      setRecordingTime(0);
      recTimer.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (e) {
      alert('Mic permission denied');
    }
  }

  function stopRecord(cancel) {
    if (recTimer.current) clearInterval(recTimer.current);
    setRecording(false);
    setRecordingTime(0);
    const rec = mediaRec.current;
    if (rec && rec.state !== 'inactive') {
      if (cancel) rec.onstop = () => rec.stream.getTracks().forEach(t => t.stop());
      rec.stop();
    }
  }

  function pickAudioMime() {
    const list = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    for (const t of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  function extOf(mime) {
    if (!mime) return 'webm';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'm4a';
    return 'webm';
  }

  if (disabled) {
    return (
      <div className="px-4 py-3 bg-wati-panel border-t border-wati-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-red-500">
          <Lock size={16} />
          24-hour conversation window is closed. You can only send an approved template.
        </div>
        <button
          onClick={onOpenTemplates}
          className="px-3 py-1.5 bg-wati-primary hover:bg-wati-primaryDark text-white rounded text-sm flex items-center gap-1"
        >
          <FileText size={16} /> Send Template
        </button>
      </div>
    );
  }

  return (
    <div className="bg-wati-panel border-t border-wati-border">
      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-wati-sidebar border-b border-wati-border flex items-start gap-2">
          <div className="flex-1 pl-2 border-l-4 border-wati-primary">
            <div className="text-xs font-medium text-wati-primary">
              Replying to {replyTo.direction === 'inbound' ? 'customer' : 'yourself'}
            </div>
            <div className="text-xs text-wati-muted truncate">
              {replyTo.text || replyTo.caption || `[${replyTo.type}]`}
            </div>
          </div>
          <button onClick={onCancelReply} className="p-1 text-wati-muted hover:bg-wati-panel rounded"><X size={16} /></button>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-4 py-3 bg-wati-sidebar border-b border-wati-border flex items-center gap-3">
          {pendingFile.type === 'image' && <img src={pendingFile.previewUrl} className="w-16 h-16 object-cover rounded" />}
          {pendingFile.type === 'video' && <video src={pendingFile.previewUrl} className="w-20 h-16 rounded" />}
          {pendingFile.type === 'audio' && <audio src={pendingFile.previewUrl} controls className="h-10" />}
          {pendingFile.type === 'document' && <div className="w-16 h-16 rounded bg-wati-panel border border-wati-border flex items-center justify-center"><FileIcon /></div>}
          <div className="flex-1">
            <div className="text-sm font-medium text-wati-text">{pendingFile.file.name}</div>
            {pendingFile.type !== 'document' && (
              <input
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption…"
                className="w-full mt-1 px-2 py-1 bg-wati-panel border border-wati-border text-wati-text rounded text-sm outline-none placeholder-wati-muted"
              />
            )}
          </div>
          <button onClick={() => { URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); setCaption(''); }} className="p-2 hover:bg-wati-panel rounded"><X size={18} /></button>
          <button
            onClick={confirmSendFile}
            disabled={uploading}
            className="px-3 py-2 bg-wati-primary text-white rounded disabled:opacity-50 flex items-center gap-1 text-sm"
          >
            {uploading ? 'Uploading…' : (<><Send size={16}/> Send</>)}
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div ref={emojiPickerRef} className="absolute bottom-20">
          <EmojiPicker onEmojiClick={(e) => { setText(t => t + e.emoji); setShowEmoji(false); }} />
        </div>
      )}

      {/* Attach menu */}
      {showAttach && (
        <div className="relative">
          <div ref={attachMenuRef} className="absolute bottom-2 left-2 bg-wati-sidebar rounded-lg shadow-lg border border-wati-border py-2 w-56 z-10 text-wati-text">
            <button onClick={() => pickFile('image')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-wati-panel text-sm">
              <ImageIcon size={18} className="text-pink-500" /> Photo
            </button>
            <button onClick={() => pickFile('video')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-wati-panel text-sm">
              <Video size={18} className="text-purple-500" /> Video
            </button>
            <button onClick={() => pickFile('document')} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-wati-panel text-sm">
              <Paperclip size={18} className="text-blue-500" /> Document
            </button>
            <button onClick={() => { setShowAttach(false); onOpenTemplates(); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-wati-panel text-sm">
              <FileText size={18} className="text-green-600" /> Template
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-3 flex items-end gap-2">
        <button
          ref={attachBtnRef}
          onClick={() => { setShowAttach(v => !v); setShowEmoji(false); }}
          className={clsx('p-2 rounded-full', showAttach ? 'bg-wati-primary text-white' : 'text-wati-muted hover:bg-wati-panel')}
          title="Attach"
        >
          <Plus size={22} />
        </button>
        <button
          onClick={onOpenTemplates}
          className="p-2 rounded-full text-wati-muted hover:bg-wati-panel"
          title="Templates"
        >
          <FileText size={22} />
        </button>
        <button
          ref={emojiBtnRef}
          onClick={() => { setShowEmoji(v => !v); setShowAttach(false); }}
          className="p-2 rounded-full text-wati-muted hover:bg-wati-panel"
          title="Emoji"
        >
          <Smile size={22} />
        </button>

        {/* Recording view */}
        {recording ? (
          <div className="flex-1 flex items-center gap-3 bg-wati-sidebar border border-wati-border rounded-full px-4 py-2 text-wati-text">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono">Recording… {Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}</span>
            <div className="flex-1" />
            <button onClick={() => stopRecord(true)} className="text-red-500 text-sm">Cancel</button>
            <button onClick={() => stopRecord(false)} className="p-2 bg-wati-primary rounded-full text-white" title="Send voice">
              <Send size={18} />
            </button>
          </div>
        ) : (
          <textarea
            rows={1}
            value={text}
            onChange={onTyping}
            onKeyDown={handleKey}
            placeholder="Type a message"
            className="flex-1 resize-none bg-wati-sidebar border border-wati-border text-wati-text rounded-3xl px-4 py-2 text-sm outline-none max-h-28 placeholder-wati-muted"
          />
        )}

        {!recording && (
          text.trim() ? (
            <button onClick={send} className="p-3 bg-wati-primary hover:bg-wati-primaryDark rounded-full text-white" title="Send">
              <Send size={20} />
            </button>
          ) : (
            <button onClick={startRecord} className="p-3 bg-wati-primary hover:bg-wati-primaryDark rounded-full text-white" title="Voice note">
              <Mic size={20} />
            </button>
          )
        )}
      </div>

      {/* Hidden inputs */}
      <input ref={fileInput} type="file" hidden onChange={(e) => onFileChosen(e)} />
      <input ref={imgInput} type="file" hidden accept="image/*" onChange={(e) => onFileChosen(e, 'image')} />
      <input ref={videoInput} type="file" hidden accept="video/*" onChange={(e) => onFileChosen(e, 'video')} />
      <input ref={docInput} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={(e) => onFileChosen(e, 'document')} />
    </div>
  );
}
