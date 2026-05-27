import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Clock, Lock } from 'lucide-react';
import { windowState, formatCountdown } from '../utils/time';

export default function WindowTimer({ lastCustomerMessageAt, source = 'whatsapp_direct' }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const w = windowState(lastCustomerMessageAt, source);
  const isCtwa = source === 'facebook_ad' || source === 'instagram_ad';
  const ctwaTitle = isCtwa
    ? `72h customer-service window (acquired via ${source === 'instagram_ad' ? 'Instagram' : 'Facebook'} Ad)`
    : '24h customer-service window';

  if (!lastCustomerMessageAt) {
    return (
      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-200 text-gray-600" title={ctwaTitle}>
        <Lock size={12} /> No window
      </div>
    );
  }
  if (w.expired) {
    return (
      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300" title={ctwaTitle}>
        <Lock size={12} /> Window closed
      </div>
    );
  }
  return (
    <div
      className={clsx(
        'flex items-center gap-1 text-xs px-2 py-1 rounded border font-mono font-semibold',
        w.danger
          ? 'bg-red-100 text-red-700 border-red-400 animate-pulse'
          : isCtwa
            ? 'bg-blue-50 text-blue-700 border-blue-300'
            : 'bg-green-50 text-green-700 border-green-300'
      )}
      title={ctwaTitle}
    >
      <Clock size={12} />
      {formatCountdown(w.remainingMs)}
      {isCtwa && <span className="ml-1 text-[10px] font-sans font-medium opacity-70">72h</span>}
    </div>
  );
}
