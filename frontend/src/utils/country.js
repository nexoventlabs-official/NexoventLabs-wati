// Phone-prefix → country lookup. Used to render a flag and country name from a
// raw waId (E.164 without leading +). Longest-prefix-first match.
//
// We keep this list compact and focused on commonly-encountered codes; unknown
// numbers fall back to a globe icon. Add entries as needed.

const COUNTRIES = [
  // North America (NANP - all share +1; we only resolve 'United States/Canada')
  { code: '1', iso2: 'US', name: 'United States / Canada' },

  // High-traffic codes for this panel
  { code: '91', iso2: 'IN', name: 'India' },
  { code: '92', iso2: 'PK', name: 'Pakistan' },
  { code: '94', iso2: 'LK', name: 'Sri Lanka' },
  { code: '880', iso2: 'BD', name: 'Bangladesh' },
  { code: '977', iso2: 'NP', name: 'Nepal' },
  { code: '975', iso2: 'BT', name: 'Bhutan' },
  { code: '960', iso2: 'MV', name: 'Maldives' },
  { code: '93', iso2: 'AF', name: 'Afghanistan' },
  { code: '98', iso2: 'IR', name: 'Iran' },

  // SE / E Asia
  { code: '60', iso2: 'MY', name: 'Malaysia' },
  { code: '62', iso2: 'ID', name: 'Indonesia' },
  { code: '63', iso2: 'PH', name: 'Philippines' },
  { code: '65', iso2: 'SG', name: 'Singapore' },
  { code: '66', iso2: 'TH', name: 'Thailand' },
  { code: '84', iso2: 'VN', name: 'Vietnam' },
  { code: '86', iso2: 'CN', name: 'China' },
  { code: '81', iso2: 'JP', name: 'Japan' },
  { code: '82', iso2: 'KR', name: 'South Korea' },
  { code: '852', iso2: 'HK', name: 'Hong Kong' },
  { code: '853', iso2: 'MO', name: 'Macau' },
  { code: '886', iso2: 'TW', name: 'Taiwan' },
  { code: '855', iso2: 'KH', name: 'Cambodia' },
  { code: '856', iso2: 'LA', name: 'Laos' },
  { code: '95', iso2: 'MM', name: 'Myanmar' },
  { code: '976', iso2: 'MN', name: 'Mongolia' },

  // Middle East
  { code: '971', iso2: 'AE', name: 'United Arab Emirates' },
  { code: '966', iso2: 'SA', name: 'Saudi Arabia' },
  { code: '965', iso2: 'KW', name: 'Kuwait' },
  { code: '974', iso2: 'QA', name: 'Qatar' },
  { code: '973', iso2: 'BH', name: 'Bahrain' },
  { code: '968', iso2: 'OM', name: 'Oman' },
  { code: '972', iso2: 'IL', name: 'Israel' },
  { code: '90', iso2: 'TR', name: 'Turkey' },
  { code: '964', iso2: 'IQ', name: 'Iraq' },
  { code: '962', iso2: 'JO', name: 'Jordan' },
  { code: '961', iso2: 'LB', name: 'Lebanon' },

  // Europe
  { code: '44', iso2: 'GB', name: 'United Kingdom' },
  { code: '49', iso2: 'DE', name: 'Germany' },
  { code: '33', iso2: 'FR', name: 'France' },
  { code: '34', iso2: 'ES', name: 'Spain' },
  { code: '39', iso2: 'IT', name: 'Italy' },
  { code: '31', iso2: 'NL', name: 'Netherlands' },
  { code: '32', iso2: 'BE', name: 'Belgium' },
  { code: '41', iso2: 'CH', name: 'Switzerland' },
  { code: '43', iso2: 'AT', name: 'Austria' },
  { code: '45', iso2: 'DK', name: 'Denmark' },
  { code: '46', iso2: 'SE', name: 'Sweden' },
  { code: '47', iso2: 'NO', name: 'Norway' },
  { code: '48', iso2: 'PL', name: 'Poland' },
  { code: '351', iso2: 'PT', name: 'Portugal' },
  { code: '353', iso2: 'IE', name: 'Ireland' },
  { code: '358', iso2: 'FI', name: 'Finland' },
  { code: '420', iso2: 'CZ', name: 'Czech Republic' },
  { code: '7', iso2: 'RU', name: 'Russia' },
  { code: '380', iso2: 'UA', name: 'Ukraine' },
  { code: '30', iso2: 'GR', name: 'Greece' },

  // Americas
  { code: '52', iso2: 'MX', name: 'Mexico' },
  { code: '55', iso2: 'BR', name: 'Brazil' },
  { code: '54', iso2: 'AR', name: 'Argentina' },
  { code: '56', iso2: 'CL', name: 'Chile' },
  { code: '57', iso2: 'CO', name: 'Colombia' },
  { code: '58', iso2: 'VE', name: 'Venezuela' },
  { code: '51', iso2: 'PE', name: 'Peru' },

  // Africa
  { code: '20', iso2: 'EG', name: 'Egypt' },
  { code: '27', iso2: 'ZA', name: 'South Africa' },
  { code: '234', iso2: 'NG', name: 'Nigeria' },
  { code: '254', iso2: 'KE', name: 'Kenya' },
  { code: '255', iso2: 'TZ', name: 'Tanzania' },
  { code: '256', iso2: 'UG', name: 'Uganda' },
  { code: '212', iso2: 'MA', name: 'Morocco' },
  { code: '213', iso2: 'DZ', name: 'Algeria' },
  { code: '216', iso2: 'TN', name: 'Tunisia' },
  { code: '233', iso2: 'GH', name: 'Ghana' },

  // Oceania
  { code: '61', iso2: 'AU', name: 'Australia' },
  { code: '64', iso2: 'NZ', name: 'New Zealand' },
];

// Sort once, longest prefix first, so '880' beats '8'.
const SORTED = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);

// Convert ISO-3166-1 alpha-2 (e.g. 'IN') into the corresponding regional-indicator
// emoji ('🇮🇳'). Each ASCII letter maps to a regional-indicator codepoint
// (A = 0x1F1E6).
export function isoToFlagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '🏳️';
  const base = 0x1f1e6;
  const A = 'A'.charCodeAt(0);
  const upper = iso2.toUpperCase();
  return String.fromCodePoint(
    base + (upper.charCodeAt(0) - A),
    base + (upper.charCodeAt(1) - A)
  );
}

// Resolve a country from a raw waId (E.164 digits, no '+').
// Returns { iso2, name, flag, dialCode, nationalNumber }.
export function resolveCountry(waId) {
  const digits = String(waId || '').replace(/\D/g, '');
  if (!digits) {
    return { iso2: '', name: 'Unknown', flag: '🏳️', dialCode: '', nationalNumber: '' };
  }
  for (const c of SORTED) {
    if (digits.startsWith(c.code)) {
      return {
        iso2: c.iso2,
        name: c.name,
        flag: isoToFlagEmoji(c.iso2),
        dialCode: c.code,
        nationalNumber: digits.slice(c.code.length),
      };
    }
  }
  return { iso2: '', name: 'Unknown', flag: '🏳️', dialCode: '', nationalNumber: digits };
}

// Pretty print: "+91 81068 11285" / "+1 (415) 555-1234" (best-effort spacing).
export function formatPhone(waId) {
  const { dialCode, nationalNumber } = resolveCountry(waId);
  if (!dialCode) return `+${String(waId || '').replace(/\D/g, '')}`;
  const n = nationalNumber;
  // Common Indian-mobile grouping: 5+5
  if (dialCode === '91' && n.length === 10) {
    return `+${dialCode} ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  // NANP grouping: 3-3-4
  if (dialCode === '1' && n.length === 10) {
    return `+${dialCode} (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  // Generic: split into 3-char groups from the right, leave anything left at start.
  const groups = [];
  let rest = n;
  while (rest.length > 3) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  if (rest) groups.unshift(rest);
  return `+${dialCode} ${groups.join(' ')}`;
}
