import { cloneElement, isValidElement, useEffect, useState, useSyncExternalStore } from 'react';
import { useLang } from '../lib/i18n.js';
import { backend } from '../backend/index.js';

// ───────── hash router ─────────
function subscribe(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash || '#/');
  const [path, qs] = hash.slice(1).split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}
export const go = (to) => {
  window.location.hash = to;
  window.scrollTo(0, 0);
};

// ───────── icons (inline, stroke) ─────────
const P = {
  drop: <path d="M12 3c3.5 4.8 6 8.1 6 11a6 6 0 0 1-12 0c0-2.9 2.5-6.2 6-11z" />,
  back: <path d="m15 18-6-6 6-6" />,
  next: <path d="m9 18 6-6-6-6" />,
  car: <><path d="M5 17h14M5 17a2 2 0 1 1-4 0v-4l2-5a2 2 0 0 1 2-1h14a2 2 0 0 1 2 1l2 5v4a2 2 0 1 1-4 0" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  msg: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  map: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>,
  sched: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-2.6-1.9-4.8-4.5-5.6" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};
export function Icon({ name, size = 22, stroke = 2, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {P[name]}
    </svg>
  );
}

export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1A1C20" stroke="#2E3137" />
      <path d="M16 6c4 5.5 7 9.3 7 12.6A7 7 0 0 1 9 18.6C9 15.3 12 11.5 16 6z" fill="#E8A33D" />
      <path d="M12.6 19.5a3.6 3.6 0 0 0 3.4 3" stroke="#141414" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function TopBar() {
  const { t, lang, setLang } = useLang();
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label={t('brand')}>
        <BrandMark />
        <span>{t('brand')}</span>
      </a>
      <button className="lang-btn" type="button" onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
        aria-label={t('langSwitch')} lang={lang === 'en' ? 'fr' : 'en'}>
        {t('langName')}
      </button>
    </header>
  );
}

export function DemoBanner() {
  if (backend.mode !== 'local') return null;
  return (
    <div className="demo-banner">
      <b>Local demo.</b> Bookings are saved in this browser only. Connect Supabase to go live.
    </div>
  );
}

export function Field({ id, label, hint, error, children }) {
  // Link the input to its message so screen readers read the error (or hint) with the field.
  const msgId = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const child =
    msgId && isValidElement(children) && children.props.id === id
      ? cloneElement(children, { 'aria-describedby': msgId })
      : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {child}
      {error ? (
        <span className="err" id={`${id}-err`} role="alert">{error}</span>
      ) : hint ? (
        <span className="hint" id={`${id}-hint`}>{hint}</span>
      ) : null}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(onDone, 2200);
    return () => clearTimeout(id);
  }, [msg, onDone]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

/** Tiny async loader hook. */
export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && set({ loading: false, data, error: null }),
      (error) => alive && set({ loading: false, data: null, error }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1), setData: (d) => set((s) => ({ ...s, data: d })) };
}
