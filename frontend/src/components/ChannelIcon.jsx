import React from 'react';
import { FaWhatsapp, FaFacebookF } from 'react-icons/fa';

// Authentic brand-coloured channel chips. Each icon is rendered inside a
// circular badge in the brand colour (or Instagram's signature gradient) so
// the sidebar / chat-header picks the source out at a glance.
//
// Props: { source, size } where size is the outer chip diameter in px.

export const SOURCE_META = {
  whatsapp_direct: { label: 'WhatsApp',     windowH: 24 },
  facebook_ad:     { label: 'Facebook Ad',  windowH: 72 },
  instagram_ad:    { label: 'Instagram Ad', windowH: 72 },
  unknown:         { label: 'Unknown',      windowH: 24 },
};

export function getSourceMeta(source) {
  return SOURCE_META[source] || SOURCE_META.whatsapp_direct;
}

// Inline Instagram glyph: classic camera-with-lens outline. We stroke in white
// so the gradient background reads through cleanly.
function InstagramGlyph({ size }) {
  const s = size * 0.62;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="white" stroke="none" />
    </svg>
  );
}

// Render the source as a coloured chip. The chip is what makes it look like a
// real social-network badge instead of a flat lucide line icon.
export default function ChannelIcon({ source = 'whatsapp_direct', size = 18, className = '', title }) {
  const inner = Math.round(size * 0.62);
  const base = `inline-flex items-center justify-center rounded-full shadow-sm ring-1 ring-black/5 shrink-0 ${className}`;
  const style = { width: size, height: size };

  if (source === 'facebook_ad') {
    return (
      <span
        className={base}
        style={{ ...style, background: '#1877F2' }}
        title={title || 'Acquired via Facebook Ad'}
      >
        <FaFacebookF size={inner} color="#fff" />
      </span>
    );
  }

  if (source === 'instagram_ad') {
    // Authentic Instagram brand gradient.
    return (
      <span
        className={base}
        style={{
          ...style,
          background:
            'radial-gradient(circle at 30% 110%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
        }}
        title={title || 'Acquired via Instagram Ad'}
      >
        <InstagramGlyph size={size} />
      </span>
    );
  }

  // Default: WhatsApp green chip.
  return (
    <span
      className={base}
      style={{ ...style, background: '#25D366' }}
      title={title || 'WhatsApp direct'}
    >
      <FaWhatsapp size={inner} color="#fff" />
    </span>
  );
}
