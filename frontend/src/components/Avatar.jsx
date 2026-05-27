import React from 'react';

// WhatsApp-style avatar: shows the customer's profile picture if we have one,
// otherwise a neutral grey circle with a generic person silhouette - identical
// in spirit to the default avatar WhatsApp shows for unknown contacts.
//
// Props: { name, url, size }
//   - name: optional, used only for the alt text
//   - url:  profile picture URL; when missing, render the placeholder
//   - size: outer diameter in px (default 48)

function PersonGlyph({ size }) {
  // Inner glyph fills ~62% of the circle, matching WhatsApp's proportions.
  const inner = Math.round(size * 0.62);
  return (
    <svg
      width={inner}
      height={inner}
      viewBox="0 0 24 24"
      fill="#FFFFFF"
      aria-hidden="true"
    >
      {/* Head */}
      <circle cx="12" cy="8.5" r="3.6" />
      {/* Shoulders / torso */}
      <path d="M4.5 20c0-3.59 3.36-6 7.5-6s7.5 2.41 7.5 6v.5H4.5V20z" />
    </svg>
  );
}

export default function Avatar({ name, url, size = 48, className = '' }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
        // If the URL 404s or expires (Meta profile pic URLs are short-lived),
        // hide the broken image so the parent's fallback styling shows through.
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center bg-[#DFE5E7] shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={name || ''}
    >
      <PersonGlyph size={size} />
    </div>
  );
}
