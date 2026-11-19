import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { backend, authLanding } from '../backend/index.js';
import { BrandMark, DemoBanner, Field, Icon, Spinner, Toast, go, useRoute } from '../components/ui.jsx';
import { DEFAULT_SETTINGS } from '../backend/local.js';
import { DEFAULT_PRICES } from '../lib/pricing.js';
import { addDays, today } from '../lib/slots.js';
import Today from './Today.jsx';
import Quotes from './Quotes.jsx';
import Schedule from './Schedule.jsx';
import Customers, { isDue } from './Customers.jsx';
import Cars from './Cars.jsx';
import Settings from './Settings.jsx';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

const TABS = [
  { id: 'today', label: 'Today', icon: 'today', C: Today },
  { id: 'quotes', label: 'Quotes', icon: 'inbox', C: Quotes },
  { id: 'schedule', label: 'Schedule', icon: 'sched', C: Schedule },
  { id: 'customers', label: 'Customers', icon: 'users', C: Customers },
  { id: 'cars', label: 'Car table', icon: 'table', C: Cars },
  { id: 'settings', label: 'Settings', icon: 'gear', C: Settings },
];

export default function Admin() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    document.documentElement.lang = 'en-CA';
    document.title = "Admin | Roy's Garage";
    // getUser waits for Supabase to finish reading the magic link, then the URL becomes #/admin.
    const landed = () => {
      if (authLanding.pending) {
        authLanding.pending = false;
        go('/admin');
      }
    };
    backend.getUser().then(
      (u) => { setUser(u); landed(); },
      () => { setUser(null); landed(); },
    );
    return backend.onAuthChange(setUser);
  }, []);
  if (user === undefined) return null;
  return user ? <Panel user={user} /> : <Login />;
}

// SHA-256 of the admin access code, so the code itself isn't readable in the site's source.
const CODE_HASH = '490b9b56f21cc9bf43cff46ce51061baa76a8b7e236390034537df4ebd229269';
async function codeMatches(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('') === CODE_HASH;
}

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle');
  const [why, setWhy] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setState('busy');
    if (!(await codeMatches(code).catch(() => false))) return setState('badcode');
    try {
      const r = await backend.signIn(email);
      setState(r.sent ? 'sent' : 'idle');
    } catch (err) {
      const msg = String(err?.message || err?.code || '');
      setWhy(
        /rate|429|seconds/i.test(msg) ? 'Too many sign-in emails. Wait a few minutes, then try once.'
        : /signup|not allowed|not found/i.test(msg) ? 'This email is not set up as a user in Supabase (Auth → Users → Invite user).'
        : /redirect/i.test(msg) ? 'Supabase rejected the return address. Add this site to Auth → URL configuration.'
        : `Couldn't send the link: ${msg || 'unknown error'}`,
      );
      setState('denied');
    }
  };
  return (
    <>
      <DemoBanner />
      <form className="login" onSubmit={submit}>
        <BrandMark size={44} />
        <h2 style={{ fontSize: 40 }}>Roy's admin</h2>
        {state === 'sent' ? (
          <div className="notice amber">Check {email} for a sign-in link. It opens this panel on your phone.</div>
        ) : (
          <>
            <Field id="email" label="Email"
              hint={backend.mode === 'local' ? 'Local demo: use roychababi53@gmail.com. No email is sent, you sign in right away.' : null}
              error={state === 'denied' ? why : null}>
              <input id="email" className="input" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field id="code" label="Code" error={state === 'badcode' ? 'Wrong code.' : null}>
              <input id="code" className="input" type="password" inputMode="numeric" autoComplete="off" required
                value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={state === 'busy'}>
              {state === 'busy' ? <Spinner /> : backend.mode === 'local' ? 'Sign in' : 'Email me a sign-in link'}
            </button>
          </>
        )}
        <a href="#/" className="small muted" style={{ textAlign: 'center' }}>Back to the site</a>
      </form>
    </>
  );
}

function Panel({ user }) {
  const { path } = useRoute();
  const tabId = path.split('/')[2] || 'today';
  const tab = TABS.find((x) => x.id === tabId) || TABS[0];
  const [toast, setToast] = useState('');
  const [cfg, setCfg] = useState({ settings: DEFAULT_SETTINGS, prices: DEFAULT_PRICES, cars: [], weeks: {} });
  const [counts, setCounts] = useState({ quotes: 0, due: 0 });

  const refresh = useCallback(async () => {
    const [{ settings, prices }, cars, weeks, quotes, customers] = await Promise.all([
      backend.getAdmin(), backend.listCars(), backend.getWeeks(), backend.listQuotes(), backend.listCustomers(),
    ]);
    setCfg({ settings: { ...DEFAULT_SETTINGS, ...settings }, prices: { ...DEFAULT_PRICES, ...prices }, cars, weeks });
    setCounts({ quotes: quotes.filter((q) => q.status === 'new').length, due: customers.filter(isDue).length });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const ctx = { ...cfg, refresh, toast: setToast, counts, user };
  const C = tab.C;
  return (
    <AdminCtx.Provider value={ctx}>
      <DemoBanner />
      <div className="admin">
        <header className="admin-top">
          <a className="brand" href="#/admin" style={{ fontSize: 20 }}><BrandMark size={26} /> Admin</a>
          <a className="btn btn-sm btn-ghost" href="#/" target="_blank" rel="noreferrer">View site</a>
        </header>
        <main>
          <C key={tab.id} />
        </main>
      </div>
      <nav className="tabbar" aria-label="Admin sections">
        <div className="tabbar-inner">
          {TABS.map((x) => {
            const badge = x.id === 'quotes' ? counts.quotes : x.id === 'customers' ? counts.due : 0;
            return (
              <button key={x.id} type="button" className="tab" aria-current={x.id === tab.id ? 'page' : undefined}
                onClick={() => go(`/admin/${x.id}`)}>
                <Icon name={x.icon} size={22} />
                {x.label}
                {badge > 0 && <span className="badge" aria-label={`${badge} waiting`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      <Toast msg={toast} onDone={() => setToast('')} />
    </AdminCtx.Provider>
  );
}

export { addDays, today };
