import { useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon, go, useAsync } from '../components/ui.jsx';
import { addDays, today, formatDate, formatTime, hhmmToMin, minToHHMM } from '../lib/slots.js';
import { money } from '../lib/pricing.js';
import { carLabel, confirmText, mapLink, prettyPhone, smsLink, telLink } from '../lib/messages.js';
import { matchCar } from '../lib/booking.js';

const PICKUP = { dropoff: 'Drop-off', pickup: 'Roy picks up', return: 'Roy brings back', both: 'Both ways' };
const STATUS = { booked: ['Booked', 'amber'], confirmed: ['Confirmed', 'ok'], done: ['Done', ''], cancelled: ['Cancelled', 'bad'] };

export default function Today() {
  const { cars, counts, toast, refresh } = useAdmin();
  const [date, setDate] = useState(today());
  const { data, loading, reload } = useAsync(() => backend.listBookings(date, date), [date]);
  const quotes = useAsync(() => backend.listQuotes(), []);
  const bookings = data || [];
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  const isToday = date === today();
  const label = isToday ? 'Today' : date === addDays(today(), 1) ? 'Tomorrow' : formatDate(date, 'en', { weekday: 'long' });

  const oilSpec = (b) => {
    if (b.own_oil) return "Customer's oil";
    const q = b.quote_id && quotes.data?.find((x) => x.id === b.quote_id);
    if (q) return `${q.litres} L ${q.oil_grade}${q.filter ? `, filter $${q.filter}` : ''}`;
    const c = matchCar(cars, b);
    return c ? `${c.oil_litres} L ${c.oil_grade}${c.filter_price ? `, filter $${c.filter_price}` : ''}` : 'Not in car table';
  };

  const act = async (fn, msg) => {
    await fn();
    toast(msg);
    reload();
    refresh();
  };

  return (
    <>
      <h2>{label}</h2>
      {counts.due > 0 && (
        <div className="banner">
          <span><Icon name="bell" size={18} style={{ verticalAlign: '-3px', marginRight: 8, color: 'var(--amber)' }} />
            {counts.due} customer{counts.due > 1 ? 's are' : ' is'} due for a 6-month reminder</span>
          <button type="button" className="btn btn-sm" onClick={() => go('/admin/customers')}>See</button>
        </div>
      )}
      <div className="daynav">
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="back" /></button>
        <div className="t">
          {formatDate(date, 'en', { weekday: 'short', month: 'short', day: 'numeric' })}
          {!isToday && <button type="button" className="link-btn" style={{ marginLeft: 10, minHeight: 0, padding: 0 }} onClick={() => setDate(today())}>Back to today</button>}
        </div>
        <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><Icon name="next" /></button>
      </div>

      {loading && !data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : live.length === 0 ? (
        <div className="empty">No bookings {isToday ? 'today' : 'this day'}. Open slots show up on the site automatically.</div>
      ) : (
        live.map((b) => (
          <BookingCard key={b.id} b={b} oilSpec={oilSpec(b)} isToday={isToday}
            onConfirm={() => act(() => backend.updateBooking(b.id, { status: 'confirmed' }), 'Marked confirmed')}
            onDone={() => act(() => backend.markDone(b.id), 'Marked done. Customer updated.')}
            onCancel={() => act(() => backend.updateBooking(b.id, { status: 'cancelled' }), 'Booking cancelled')}
            onMove={(patch) => act(() => backend.updateBooking(b.id, patch), 'Booking moved')} />
        ))
      )}
      {cancelled.length > 0 && (
        <p className="small muted" style={{ marginTop: 14 }}>
          {cancelled.length} cancelled: {cancelled.map((b) => `${b.name} ${formatTime(b.start_min)}`).join(', ')}
        </p>
      )}
    </>
  );
}

function BookingCard({ b, oilSpec, isToday, onConfirm, onDone, onCancel, onMove }) {
  const [moving, setMoving] = useState(false);
  const [armed, setArmed] = useState(false);
  const [mv, setMv] = useState({ date: b.date, time: minToHHMM(b.start_min) });
  const [st, tone] = STATUS[b.status] || STATUS.booked;
  const lang = b.lang === 'fr' ? 'fr' : 'en';

  return (
    <article className="card">
      <div className="bk-head">
        <div>
          <div className="bk-time tnum">{formatTime(b.start_min)}</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>{b.name} <span className="pill" style={{ marginLeft: 4 }}>{b.lang?.toUpperCase()}</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="bk-price tnum">{money(b.price)}</div>
          <span className={`pill ${tone}`}>{st}</span>
        </div>
      </div>
      <dl className="kv">
        <dt>Car</dt><dd>{carLabel(b)}</dd>
        <dt>Oil</dt><dd>{oilSpec}</dd>
        <dt>Pickup</dt><dd>{PICKUP[b.pickup]}</dd>
        <dt>Address</dt><dd>{b.address}</dd>
        <dt>Phone</dt><dd className="tnum">{prettyPhone(b.phone)}</dd>
        {b.notes && <><dt>Notes</dt><dd>{b.notes}</dd></>}
      </dl>
      {b.status !== 'done' && (
        <div className="row-btns">
          {isToday && (
            <a className="btn btn-sm" href={smsLink(b.phone, confirmText({ booking: b, lang }))} onClick={onConfirm}>
              <Icon name="msg" size={18} /> Confirm
            </a>
          )}
          <a className="btn btn-sm" href={telLink(b.phone)}><Icon name="phone" size={18} /> Call</a>
          <a className="btn btn-sm" href={mapLink(b.address)} target="_blank" rel="noreferrer"><Icon name="map" size={18} /> Map</a>
          <button type="button" className="btn btn-sm" onClick={onDone}><Icon name="check" size={18} /> Mark done</button>
        </div>
      )}
      {b.status !== 'done' && (
        <div className="row-btns" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMoving((x) => !x)}>Move</button>
          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => (armed ? onCancel() : setArmed(true))}
            onBlur={() => setArmed(false)}>
            {armed ? 'Tap again to cancel' : 'Cancel booking'}
          </button>
        </div>
      )}
      {moving && (
        <div className="grid-2" style={{ marginTop: 12, alignItems: 'end' }}>
          <div className="field">
            <label htmlFor={`mv-d-${b.id}`}>Date</label>
            <input id={`mv-d-${b.id}`} type="date" className="input input-sm" value={mv.date} onChange={(e) => setMv({ ...mv, date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`mv-t-${b.id}`}>Time</label>
            <input id={`mv-t-${b.id}`} type="time" step="900" className="input input-sm" value={mv.time} onChange={(e) => setMv({ ...mv, time: e.target.value })} />
          </div>
          <button type="button" className="btn btn-sm" style={{ gridColumn: '1 / -1' }}
            onClick={() => { onMove({ date: mv.date, start_min: hhmmToMin(mv.time) }); setMoving(false); }}>
            Save new time
          </button>
        </div>
      )}
    </article>
  );
}
