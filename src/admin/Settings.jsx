import { useEffect, useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon } from '../components/ui.jsx';
import { money, oilRate } from '../lib/pricing.js';

const PRICE_FIELDS = [
  ['labour', 'Labour per oil change'],
  ['filter', 'Standard filter'],
  ['oil_jug_price', 'Oil jug price'],
  ['oil_jug_litres', 'Litres per jug'],
  ['own_oil', 'Own oil flat rate'],
  ['pickup_fee', 'Pickup / drop-off'],
];
const SETTING_FIELDS = [
  ['notification_email', 'Notification email', 'email', 'New bookings and quote requests are emailed here.'],
  ['roy_phone', "Roy's phone", 'tel', 'Shown on the site and used for "Text Roy".'],
  ['etransfer_email', 'E-transfer email', 'email', 'Shown to customers for payment.'],
  ['pickup_street', 'Street allowed for pickup', 'text', 'Pickup and drop-off are only offered on this street.'],
  ['site_url', 'Site URL', 'url', 'Used in quote and reminder texts. Leave empty to use the current address.'],
];

export default function Settings() {
  const { settings, prices, refresh, toast, user } = useAdmin();
  const [p, setP] = useState(prices);
  const [s, setS] = useState(settings);
  useEffect(() => setP(prices), [prices]);
  useEffect(() => setS(settings), [settings]);
  const rate = oilRate(p);

  const save = async (e) => {
    e.preventDefault();
    const nums = Object.fromEntries(PRICE_FIELDS.map(([k]) => [k, Number(p[k])]));
    await backend.savePrices(nums);
    await backend.saveSettings(Object.fromEntries(SETTING_FIELDS.map(([k]) => [k, String(s[k] ?? '').trim()])));
    await refresh();
    toast('Settings saved');
  };

  return (
    <form onSubmit={save}>
      <h2>Settings</h2>
      <div className="section-title" style={{ marginTop: 0 }}>Prices</div>
      <div className="card">
        <div className="grid-2">
          {PRICE_FIELDS.map(([k, label]) => (
            <div className="field" key={k}>
              <label htmlFor={`p-${k}`}>{label}</label>
              <input id={`p-${k}`} className="input input-sm" type="number" step="0.01" min="0" inputMode="decimal" required
                value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Oil works out to <b style={{ color: 'var(--text)' }}>{money(rate)} per litre</b> ({rate.toFixed(4)}). A 4.2 L car costs{' '}
          {money(Number(p.labour) + Number(p.filter) + 4.2 * rate)}.
        </p>
      </div>

      <div className="section-title">Business</div>
      <div className="card stack">
        {SETTING_FIELDS.map(([k, label, type, hint]) => (
          <div className="field" key={k}>
            <label htmlFor={`s-${k}`}>{label}</label>
            <input id={`s-${k}`} className="input input-sm" type={type} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            <span className="hint">{hint}</span>
          </div>
        ))}
      </div>
      <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>Save settings</button>

      <div className="section-title">Account</div>
      <div className="card stack">
        <div className="small muted">Signed in as {user?.email}</div>
        <button type="button" className="btn" onClick={() => backend.signOut()}><Icon name="logout" size={18} /> Sign out</button>
        {backend.mode === 'local' && (
          <button type="button" className="btn btn-ghost btn-danger" onClick={async () => { await backend.resetDemo(); window.location.reload(); }}>
            Reset demo data
          </button>
        )}
      </div>
    </form>
  );
}
