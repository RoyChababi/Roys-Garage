import { useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon, useAsync } from '../components/ui.jsx';
import { formatDate, parseDate, today } from '../lib/slots.js';
import { prettyPhone, reminderText, siteUrl, smsLink, telLink } from '../lib/messages.js';

/** Due when the last oil change was 6+ months ago and no reminder was sent since. */
export function isDue(c) {
  if (!c.last_service) return false;
  const due = parseDate(c.last_service);
  due.setMonth(due.getMonth() + 6);
  return due <= parseDate(today()) && (!c.reminded_at || c.reminded_at < c.last_service);
}

const monthsSince = (d) => {
  const a = parseDate(d);
  const b = parseDate(today());
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
};

export default function Customers() {
  const { settings, refresh, toast } = useAdmin();
  const { data, loading, reload } = useAsync(() => backend.listCustomers(), []);
  const [q, setQ] = useState('');
  const list = (data || [])
    .filter((c) => !q || `${c.name} ${c.phone} ${c.cars?.join(' ')} ${c.address}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || String(a.last_service).localeCompare(String(b.last_service)));

  const remind = (c) => {
    backend.updateCustomer(c.id, { reminded_at: today() }).then(() => {
      reload();
      refresh();
    });
    toast('Reminder marked as sent');
  };

  return (
    <>
      <h2>Customers</h2>
      <input className="input search" type="search" placeholder="Search name, phone or car" aria-label="Search customers"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : list.length === 0 ? (
        <div className="empty">{q ? 'No match.' : 'Customers show up here after you mark a job done.'}</div>
      ) : (
        list.map((c) => {
          const due = isDue(c);
          const lang = c.lang === 'fr' ? 'fr' : 'en';
          return (
            <article className="card" key={c.id} style={due ? { borderColor: 'rgba(232,163,61,.5)' } : null}>
              <div className="bk-head">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{c.name} <span className="pill" style={{ marginLeft: 4 }}>{lang.toUpperCase()}</span></div>
                  <div className="small muted">{c.cars?.join(', ')}</div>
                </div>
                {due ? <span className="pill amber">Due</span> : c.reminded_at && c.reminded_at >= c.last_service ? <span className="pill">Reminded</span> : null}
              </div>
              <dl className="kv">
                <dt>Last change</dt>
                <dd>{c.last_service ? `${formatDate(c.last_service, 'en', { month: 'short', day: 'numeric', year: 'numeric' })} (${monthsSince(c.last_service)} mo ago)` : 'Not yet'}</dd>
                <dt>Visits</dt><dd>{c.visits || 0}</dd>
                <dt>Phone</dt><dd className="tnum">{prettyPhone(c.phone)}</dd>
                <dt>Address</dt><dd>{c.address}</dd>
              </dl>
              <div className="row-btns">
                <a className={`btn btn-sm${due ? ' btn-primary' : ''}`} style={due ? { fontSize: 18, minHeight: 44 } : null}
                  href={smsLink(c.phone, reminderText({ customer: c, link: siteUrl(settings), lang }))} onClick={() => remind(c)}>
                  <Icon name="msg" size={18} /> Text reminder
                </a>
                <a className="btn btn-sm" href={telLink(c.phone)}><Icon name="phone" size={18} /> Call</a>
              </div>
            </article>
          );
        })
      )}
    </>
  );
}
