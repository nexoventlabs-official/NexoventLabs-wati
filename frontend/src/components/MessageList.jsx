import React from 'react';
import MessageBubble from './MessageBubble.jsx';
import { formatDaySeparator, sameDay } from '../utils/time';

export default function MessageList({ messages, unreadData, onReply, onDelete, onReact }) {
  const items = [];
  let lastDate = null;
  for (const m of messages) {
    if (!lastDate || !sameDay(lastDate, m.createdAt)) {
      items.push(
        <div key={`sep-${m._id}`} className="flex justify-center my-3">
          <span className="text-[11px] bg-wati-sidebar/90 border border-wati-border px-3 py-1 rounded shadow text-wati-muted font-medium">
            {formatDaySeparator(m.createdAt)}
          </span>
        </div>
      );
      lastDate = m.createdAt;
    }
    
    if (unreadData && m._id === unreadData.msgId) {
      items.push(
        <div key="unread-divider" className="flex justify-center my-3">
          <span className="text-[11px] bg-wati-sidebar/90 px-3 py-1 rounded-lg shadow-sm text-wati-primary font-semibold uppercase tracking-wide border border-wati-border">
            {unreadData.count} Unread Message{unreadData.count > 1 ? 's' : ''}
          </span>
        </div>
      );
    }

    const idx = messages.indexOf(m);
    const isNearBottom = idx >= messages.length - 3; // The last 3 messages open upwards

    items.push(
      <MessageBubble
        key={m._id}
        message={m}
        allMessages={messages}
        onReply={onReply}
        onDelete={onDelete}
        onReact={onReact}
        isNearBottom={isNearBottom}
      />
    );
  }
  return <div className="flex flex-col gap-0.5">{items}</div>;
}
