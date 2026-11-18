import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { backend } from '../backend/index.js';
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
    backend.getUser().then(setUser, () => setUser(null));
    return backend.onAuthChange((u) => {
      setUser(u);
      if (u && window.location.hash.includes('access_token=')) go('/admin');
    });
  }, []);
  if (user === undefined) return null;
  return user ? <Panel user={user} /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const submit = async (e) => {
    e.preventDefault();
    setState('busy');
    try {
      const r = await backend.signIn(email);
      setState(r.sent ? 'sent' : 'idle');
    } catch {
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
              hint={backend.mode === 'local' ? 'Local demo: use roychababi53@gmail.com. No email is sent, you sign in right away.' : "Only Roy's address can sign in."}
              error={state === 'denied' ? "That address can't sign in here." : null}>
              <input id="email" className="input" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
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
