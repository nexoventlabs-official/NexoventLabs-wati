import { useState } from 'react';

// Cross-platform country flag.
//
// Why this exists: Windows ships no flag-emoji glyphs, so Chrome/Edge on
// Windows render the regional-indicator code (e.g. "IN") instead of the flag.
// Rendering an actual image from flagcdn.com avoids that problem entirely
// while still falling back to the emoji on systems that DO render it (mac /
// iOS / Android) if the image ever fails to load.
//
// Props:
//   iso2:    ISO-3166-1 alpha-2 country code (e.g. "IN", "US"). Required.
//   emoji:   Optional emoji fallback string ("🇮🇳") rendered if the image errors.
//   size:    Pixel height of the flag (width is auto). Default 16.
//   title:   Tooltip text (usually the country name).
//   className: Extra classes for the wrapper <span>.
export default function CountryFlag({ iso2, emoji, size = 16, title, className = '' }) {
  const [errored, setErrored] = useState(false);
  if (!iso2 || iso2.length !== 2) return null;

  const code = iso2.toLowerCase();
  // flagcdn.com serves clean SVGs free of charge and with no auth.
  const src = `https://flagcdn.com/${code}.svg`;

  if (errored) {
    return (
      <span title={title} className={`inline-block leading-none ${className}`} style={{ fontSize: size }}>
        {emoji || ''}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={iso2}
      title={title || iso2}
      onError={() => setErrored(true)}
      className={`inline-block rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.06)] object-cover align-middle ${className}`}
      style={{ height: size, width: Math.round(size * 1.45) }}
      loading="lazy"
      draggable={false}
    />
  );
}
