import { useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon, useAsync } from '../components/ui.jsx';
import { STANDARD_GRADES, money, oilRate, quoteTotal } from '../lib/pricing.js';
import { carLabel, prettyPhone, quoteText, siteUrl, smsLink, telLink } from '../lib/messages.js';

const REASON = { unknown: 'Not in car table', grade: 'Special oil grade', special: 'Marked quote-only', manual: "Couldn't find car" };
const FILTERS = [['new', 'New'], ['sent', 'Sent'], ['booked', 'Booked'], ['all', 'All']];

export default function Quotes() {
  const [filter, setFilter] = useState('new');
  const { data, loading, reload } = useAsync(() => backend.listQuotes(), []);
  const list = (data || []).filter((q) => filter === 'all' || q.status === filter);
  return (
    <>
      <h2>Quotes</h2>
      <div className="row-btns" role="group" aria-label="Filter quotes" style={{ marginBottom: 14 }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="btn btn-sm" aria-pressed={filter === id}
            style={filter === id ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : null}
            onClick={() => setFilter(id)}>
            {label} {id !== 'all' && <span className="muted">{(data || []).filter((q) => q.status === id).length}</span>}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : list.length === 0 ? (
        <div className="empty">{filter === 'new' ? 'No new quote requests. They show up here and in your email.' : 'Nothing here.'}</div>
      ) : (
        list.map((q) => <QuoteCard key={q.id} q={q} onChange={reload} />)
      )}
    </>
  );
}

function QuoteCard({ q, onChange }) {
  const { prices, settings, toast, refresh } = useAdmin();
  const rate = oilRate(prices);
  const [f, setF] = useState({
    litres: q.litres ?? '',
    oil_grade: q.oil_grade || '5W-30',
    rate: q.rate ?? Math.round(rate * 10000) / 10000,
    filter: q.filter ?? prices.filter,
    own_oil: !!q.own_oil,
    save: true,
    year: q.year, make: q.make, model: q.model, trim: q.trim,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const total = quoteTotal(f, prices);
  const ready = f.own_oil || Number(f.litres) > 0;
  const structured = !!(f.year && f.make && f.model && f.trim);
  const lang = q.lang === 'fr' ? 'fr' : 'en';
  const link = `${siteUrl(settings)}#/book?quote=${q.id}`;
  const priced = { ...q, ...f, price: total };
  const sms = smsLink(q.phone, quoteText({ quote: priced, link, lang }));

  // Runs as the Messages app opens (not awaited, so the sms: link isn't blocked).
  const send = () => {
    backend.updateQuote(q.id, {
      litres: f.own_oil ? null : Number(f.litres), oil_grade: f.oil_grade, rate: Number(f.rate), filter: Number(f.filter),
      own_oil: f.own_oil, price: Math.round(total * 100) / 100, status: q.status === 'booked' ? 'booked' : 'sent',
      year: f.year, make: f.make, model: f.model, trim: f.trim,
    }).then(() => {
      onChange();
      refresh();
    });
    if (f.save && structured && !f.own_oil) {
      backend.saveCar({
        year: f.year, make: f.make, model: f.model, trim: f.trim, fe_id: q.fe_id || '',
        oil_litres: Number(f.litres), oil_grade: f.oil_grade,
        filter_price: Number(f.filter), quote_only: false,
      }).then(refresh);
    }
    toast('Quote saved. Send the text in Messages.');
  };

  return (
    <article className="card">
      <div className="bk-head">
        <div>
          <div style={{ fontWeight: 600, fontSize: 17 }}>{q.name} <span className="pill" style={{ marginLeft: 4 }}>{lang.toUpperCase()}</span></div>
          <div className="small muted">{new Date(q.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
        <span className={`pill ${q.status === 'new' ? 'amber' : q.status === 'booked' ? 'ok' : ''}`}>{q.status}</span>
      </div>
      <dl className="kv">
        <dt>Car</dt><dd>{carLabel(q)}</dd>
        <dt>Why</dt><dd>{REASON[q.reason] || q.reason}{q.own_oil ? ". Bringing own oil" : ''}</dd>
        <dt>Phone</dt><dd className="tnum"><a href={telLink(q.phone)}>{prettyPhone(q.phone)}</a></dd>
        <dt>Address</dt><dd>{q.address}</dd>
        {q.notes && <><dt>Notes</dt><dd>{q.notes}</dd></>}
      </dl>

      <label className="check" style={{ padding: 12, marginBottom: 10 }}>
        <input type="checkbox" checked={f.own_oil} onChange={set('own_oil')} />
        <span>Customer brings own oil <span className="sub">({money(prices.own_oil)} flat, filter included)</span></span>
      </label>
      {!f.own_oil && (
        <div className="grid-2">
          <div className="field">
            <label htmlFor={`l-${q.id}`}>Litres</label>
            <input id={`l-${q.id}`} className="input input-sm" type="number" inputMode="decimal" step="0.1" min="0" value={f.litres} onChange={set('litres')} />
          </div>
          <div className="field">
            <label htmlFor={`g-${q.id}`}>Oil grade</label>
            <input id={`g-${q.id}`} className="input input-sm" list="grades" value={f.oil_grade} onChange={set('oil_grade')} />
          </div>
          <div className="field">
            <label htmlFor={`r-${q.id}`}>$ per litre</label>
            <input id={`r-${q.id}`} className="input input-sm" type="number" inputMode="decimal" step="0.01" min="0" value={f.rate} onChange={set('rate')} />
          </div>
          <div className="field">
            <label htmlFor={`f-${q.id}`}>Filter $</label>
            <input id={`f-${q.id}`} className="input input-sm" type="number" inputMode="decimal" step="0.5" min="0" value={f.filter} onChange={set('filter')} />
          </div>
        </div>
      )}
      <datalist id="grades">{[...STANDARD_GRADES, '0W-16', '0W-30', '0W-40', '5W-40', '10W-30'].map((g) => <option key={g} value={g} />)}</datalist>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '14px 0' }}>
        <div className="small muted">
          {f.own_oil ? 'Own oil flat rate' : `Labour ${money(prices.labour)} + filter ${money(f.filter || 0)} + ${f.litres || 0} L × ${money(f.rate || 0)}`}
        </div>
        <div className="live-total tnum" aria-live="polite">{money(total)}</div>
      </div>

      {!f.own_oil && (
        <>
          {!structured && (
            <div className="grid-2" style={{ marginBottom: 10 }}>
              {['year', 'make', 'model', 'trim'].map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`${k}-${q.id}`}>{k === 'trim' ? 'Trim / engine' : k[0].toUpperCase() + k.slice(1)}</label>
                  <input id={`${k}-${q.id}`} className="input input-sm" value={f[k]} onChange={set(k)} />
                </div>
              ))}
            </div>
          )}
          <label className="check" style={{ padding: 12, marginBottom: 12 }}>
            <input type="checkbox" checked={f.save} onChange={set('save')} disabled={!structured} />
            <span>Save this car to the car table <span className="sub">{structured ? 'Next time it gets an instant price.' : 'Fill in year, make, model and engine first.'}</span></span>
          </label>
        </>
      )}

      <a className={`btn btn-primary${ready ? '' : ' disabled'}`} href={ready ? sms : undefined} aria-disabled={!ready}
        onClick={(e) => (ready ? send() : e.preventDefault())} style={ready ? null : { opacity: 0.45 }}>
        <Icon name="msg" /> Text quote
      </a>
      <div className="row-btns" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { navigator.clipboard?.writeText(link); toast('Booking link copied'); }}
          disabled={q.price == null}>Copy booking link</button>
        <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => backend.deleteQuote(q.id).then(() => { onChange(); refresh(); })}>Archive</button>
      </div>
    </article>
  );
}
