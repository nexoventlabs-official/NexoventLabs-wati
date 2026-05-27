// Web Notifications + audible chime for new inbound messages.
//
// We DON'T eagerly call requestPermission() at page load - browsers (esp. Chrome
// after Q1 2024) demote sites that prompt without a user gesture and the
// notification will be permanently denied. Instead expose `ensurePermission`
// which the App calls from a click handler the first time the user opens it.

const NOTIF_PREF_KEY = 'wati:notifyEnabled';

export function isNotifSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifPermission() {
  if (!isNotifSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Tries to obtain notification permission. Resolves to the resulting permission.
// Safe to call multiple times - browsers no-op if already granted/denied.
export async function ensurePermission() {
  if (!isNotifSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return Notification.permission;
  }
}

// User-level enable/disable preference (in addition to the OS-level permission).
export function getNotifyEnabled() {
  try { return localStorage.getItem(NOTIF_PREF_KEY) !== '0'; } catch { return true; }
}
export function setNotifyEnabled(v) {
  try { localStorage.setItem(NOTIF_PREF_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

// ---- Audible chime ----------------------------------------------------------

let audioCtx = null;
function getCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

// Short two-tone "ding" using the WebAudio API - no asset file required.
// Volume is intentionally low so it doesn't startle.
export function playChime() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    const tone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };

    // Two ascending tones, ~250ms total
    tone(880, 0,    0.18);
    tone(1175, 0.10, 0.22);
  } catch { /* ignore - audio is best-effort */ }
}

// ---- Desktop notification ---------------------------------------------------

// Throttle so a flood of incoming messages doesn't spam the OS notification
// centre. We coalesce per-contact: the latest message for a contact replaces
// any previous in-flight notification for the same contact (tag).
const lastShownAt = new Map(); // contactId -> timestamp
const MIN_INTERVAL_MS = 800;

export function showMessageNotification({
  contactId,
  title,
  body,
  iconUrl,
  onClick,
}) {
  if (!isNotifSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (!getNotifyEnabled()) return;

  const now = Date.now();
  const last = lastShownAt.get(contactId) || 0;
  if (now - last < MIN_INTERVAL_MS) return;
  lastShownAt.set(contactId, now);

  try {
    const n = new Notification(title || 'New message', {
      body: body || '',
      icon: iconUrl || '/logo.png',
      badge: '/logo.png',
      // Same tag for the same contact -> the OS replaces the previous bubble.
      tag: contactId ? `wati:${contactId}` : 'wati:msg',
      renotify: true,
      silent: true, // we play our own chime
    });
    if (onClick) {
      n.onclick = () => {
        try { window.focus(); } catch { /* */ }
        try { onClick(); } catch { /* */ }
        n.close();
      };
    }
    // Auto-dismiss after 6s.
    setTimeout(() => { try { n.close(); } catch { /* */ } }, 6000);
  } catch { /* ignore - some browsers throw if page is hidden */ }
}
