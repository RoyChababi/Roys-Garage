import { useEffect, useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon } from '../components/ui.jsx';
import { getMenu } from '../lib/vehicles.js';
import { STANDARD_GRADES, money, priceCar } from '../lib/pricing.js';

const BLANK = { year: '', make: '', model: '', trim: '', fe_id: '', oil_litres: '', oil_grade: '0W-20', filter_price: '', quote_only: false, notes: '' };

export default function Cars() {
  const { cars, prices, refresh, toast } = useAdmin();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [limit, setLimit] = useState(50);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = cars
    .filter((c) => {
      const hay = `${c.year} ${c.make} ${c.model} ${c.trim} ${c.oil_grade}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`) || Number(b.year) - Number(a.year));
  const list = matches.slice(0, limit);

  if (edit) {
    return (
      <CarForm car={edit} onCancel={() => setEdit(null)}
        onSave={async (c) => {
          await backend.saveCar(c);
          await refresh();
          toast('Car saved');
          setEdit(null);
        }}
        onDelete={edit.id ? async () => {
          await backend.deleteCar(edit.id);
          await refresh();
          toast('Car deleted');
          setEdit(null);
        } : null} />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Car table</h2>
        <button type="button" className="btn btn-sm" onClick={() => setEdit({ ...BLANK })}><Icon name="plus" size={18} /> Add car</button>
      </div>
      <p className="small muted" style={{ margin: '-6px 0 12px' }}>Cars here get an instant price. {cars.length} on file.</p>
      <input className="input search" type="search" placeholder="Search, e.g. 2018 civic" aria-label="Search cars"
        value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} />
      {q && <p className="small muted" style={{ margin: '-4px 0 10px' }}>{matches.length} match{matches.length === 1 ? '' : 'es'}</p>}
      {list.length === 0 ? (
        <div className="empty">{q ? 'No match.' : 'No cars yet. Add one, or save one from a quote.'}</div>
      ) : (
        list.map((c) => {
          const p = priceCar({ car: c, ownOil: false, prices });
          return (
            <button type="button" key={c.id} className="card car-row" style={{ width: '100%', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
              onClick={() => setEdit(c)}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.year} {c.make} {c.model}</div>
                <div className="spec">{c.trim}</div>
                <div className="spec">{c.oil_litres} L {c.oil_grade}{c.filter_price ? `, filter ${money(c.filter_price)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                {p.mode === 'instant' ? <div className="bk-price tnum">{money(p.total)}</div> : <span className="pill amber">Quote</span>}
              </div>
            </button>
          );
        })
      )}
      {matches.length > list.length && (
        <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={() => setLimit((n) => n + 50)}>
          Show more ({matches.length - list.length} left)
        </button>
      )}
    </>
  );
}

function CarForm({ car, onSave, onCancel, onDelete }) {
  const { prices } = useAdmin();
  const [c, setC] = useState(car);
  const [pick, setPick] = useState({ years: [], makes: [], models: [], trims: [] });
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Exact names from FuelEconomy.gov so the table key matches what customers pick.
  useEffect(() => { getMenu('year').then((years) => setPick((p) => ({ ...p, years }))).catch(() => {}); }, []);
  useEffect(() => { if (c.year) getMenu('make', c.year).then((makes) => setPick((p) => ({ ...p, makes }))).catch(() => {}); }, [c.year]);
  useEffect(() => { if (c.make) getMenu('model', c.year, c.make).then((models) => setPick((p) => ({ ...p, models }))).catch(() => {}); }, [c.year, c.make]);
  useEffect(() => { if (c.model) getMenu('options', c.year, c.make, c.model).then((trims) => setPick((p) => ({ ...p, trims }))).catch(() => {}); }, [c.year, c.make, c.model]);

  const p = priceCar({ car: { ...c, oil_litres: Number(c.oil_litres) }, ownOil: false, prices });
  const valid = c.year && c.make && c.model && c.trim && Number(c.oil_litres) > 0 && c.oil_grade;
  const sel = (k, items, label, reset) => (
    <div className="field">
      <label htmlFor={`c-${k}`}>{label}</label>
      <select id={`c-${k}`} className="select input-sm" value={c[k]}
        onChange={(e) => setC((x) => ({ ...x, [k]: e.target.value, ...reset, ...(k === 'trim' ? { fe_id: items.find((o) => o.text === e.target.value)?.value || '' } : {}) }))}>
        <option value="">Choose…</option>
        {c[k] && !items.some((o) => (k === 'trim' ? o.text : o.value) === c[k]) && <option value={c[k]}>{c[k]}</option>}
        {items.map((o) => <option key={o.value} value={k === 'trim' ? o.text : o.value}>{o.text}</option>)}
      </select>
    </div>
  );

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); valid && onSave({ ...c, oil_litres: Number(c.oil_litres), filter_price: c.filter_price === '' ? null : Number(c.filter_price) }); }}>
      <button type="button" className="back-btn" onClick={onCancel}><Icon name="back" size={18} /> Car table</button>
      <h2>{car.id ? 'Edit car' : 'Add car'}</h2>
      <div className="card stack">
        {sel('year', pick.years, 'Year', { make: '', model: '', trim: '' })}
        {sel('make', pick.makes, 'Make', { model: '', trim: '' })}
        {sel('model', pick.models, 'Model', { trim: '' })}
        {sel('trim', pick.trims, 'Trim / engine', {})}
      </div>
      <div className="card">
        <div className="grid-3">
          <div className="field">
            <label htmlFor="c-l">Oil litres</label>
            <input id="c-l" className="input input-sm" type="number" step="0.1" min="0" inputMode="decimal" value={c.oil_litres} onChange={set('oil_litres')} required />
          </div>
          <div className="field">
            <label htmlFor="c-g">Grade</label>
            <input id="c-g" className="input input-sm" list="car-grades" value={c.oil_grade} onChange={set('oil_grade')} required />
            <datalist id="car-grades">{[...STANDARD_GRADES, '0W-16', '0W-30', '0W-40', '5W-40'].map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="c-f">Filter $</label>
            <input id="c-f" className="input input-sm" type="number" step="0.5" min="0" inputMode="decimal" placeholder={String(prices.filter)} value={c.filter_price ?? ''} onChange={set('filter_price')} />
          </div>
        </div>
        <label className="check" style={{ marginTop: 12, padding: 12 }}>
          <input type="checkbox" checked={!!c.quote_only} onChange={set('quote_only')} />
          <span>Always quote by hand <span className="sub">Use for odd filters or setups.</span></span>
        </label>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="c-n">Notes</label>
          <input id="c-n" className="input input-sm" value={c.notes || ''} onChange={set('notes')} placeholder="Filter part number, drain plug size…" />
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          {p.mode === 'instant' ? <>Customers see <b style={{ color: 'var(--amber)' }}>{money(p.total)}</b></> : !STANDARD_GRADES.includes(c.oil_grade) ? 'Not a standard grade (0W-20, 5W-20, 5W-30), so customers get the quote form.' : 'Customers get the quote form.'}
        </p>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!valid}>Save car</button>
      {onDelete && <button type="button" className="btn btn-ghost btn-danger" onClick={onDelete}>Delete car</button>}
    </form>
  );
}
