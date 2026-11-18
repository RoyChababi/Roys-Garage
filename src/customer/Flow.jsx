import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLang } from '../lib/i18n.js';
import { TopBar, DemoBanner, Icon, Field, Spinner, go, useRoute } from '../components/ui.jsx';
import { useConfig } from './config.jsx';
import { backend } from '../backend/index.js';
import { getMenu } from '../lib/vehicles.js';
import { priceCar, money, withPickup, pickupNeeded } from '../lib/pricing.js';
import { availableDays, today, addDays, formatTime, parseDate } from '../lib/slots.js';
import { carLabel, onAllowedStreet, phoneValid, prettyPhone, smsLink, icsFile, whenLabel } from '../lib/messages.js';

// ───────── flow state (survives refresh within the tab) ─────────
const KEY = 'rg_flow';
const EMPTY = {
  sel: { year: '', make: '', model: '', trim: '', fe_id: '' },
  ownOil: false,
  car: null, // matched car-table record
  quote: null, // priced quote from Roy's link
  slot: null, // {date, start_min}
  pickup: 'dropoff',
  name: '', phone: '', address: '', notes: '',
  result: null, // booking result
};
const FlowCtx = createContext(null);
const useFlow = () => useContext(FlowCtx);
function loadFlow() {
  try {
    return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY)) };
  } catch {
    return EMPTY;
  }
}

const STEP_OF = { '/book': 1, '/book/price': 2, '/book/quote': 2, '/book/time': 3, '/book/info': 4 };
const STEP_NAME = { 1: 'stepCar', 2: 'stepPrice', 3: 'stepTime', 4: 'stepInfo' };

export default function Flow() {
  const { path, query } = useRoute();
  const [state, setState] = useState(loadFlow);
  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);
  const reset = () => setState(EMPTY);

  const step = STEP_OF[path];
  let screen;
  if (query.get('quote')) screen = <QuoteLink id={query.get('quote')} />;
  else if (path === '/book') screen = <StepCar />;
  else if (path === '/book/price') screen = <StepPrice />;
  else if (path === '/book/quote') screen = <QuoteForm />;
  else if (path === '/book/sent') screen = <QuoteSent />;
  else if (path === '/book/time') screen = <StepTime />;
  else if (path === '/book/info') screen = <StepInfo />;
  else if (path === '/book/done') screen = <Booked />;
  else screen = <StepCar />;

  return (
    <FlowCtx.Provider value={{ state, set, reset }}>
      <DemoBanner />
      <div className="shell">
        <TopBar />
        {step && !query.get('quote') && <Progress step={step} />}
        {screen}
      </div>
    </FlowCtx.Provider>
  );
}

function Progress({ step }) {
  const { t } = useLang();
  return (
    <div className="flow-head">
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}
        aria-label={t('step', { n: step })}>
        {[1, 2, 3, 4].map((n) => <span key={n} className={n <= step ? 'on' : ''} />)}
      </div>
      <div className="progress-label">
        <span>{t('step', { n: step })}</span>
        <span>{t(STEP_NAME[step])}</span>
      </div>
    </div>
  );
}

function BackBtn({ to }) {
  const { t } = useLang();
  return (
    <button type="button" className="back-btn" onClick={() => (to ? go(to) : history.back())}>
      <Icon name="back" size={18} /> {t('back')}
    </button>
  );
}

// ───────── Step 1: car ─────────
function useMenu(kind, deps, enabled) {
  const [s, setS] = useState({ items: [], loading: false, error: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return setS({ items: [], loading: false, error: false });
    let alive = true;
    setS((x) => ({ ...x, loading: true, error: false }));
    getMenu(kind, ...deps).then(
      (items) => alive && setS({ items, loading: false, error: false }),
      () => alive && setS({ items: [], loading: false, error: true }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, enabled, n, ...deps]);
  return { ...s, retry: () => setN((x) => x + 1) };
}

function MenuSelect({ id, label, value, onChange, menu, disabledText, enabled, renderOption }) {
  const { t } = useLang();
  return (
    <Field id={id} label={label}>
      {menu.loading ? (
        <div className="skeleton" role="status" aria-label={t('loading')} />
      ) : (
        <select id={id} className="select" value={value} disabled={!enabled || !menu.items.length}
          onChange={(e) => onChange(e.target.value, e.target.selectedOptions[0])}>
          <option value="">{enabled ? t('choose') : disabledText}</option>
          {menu.items.map((o) => renderOption ? renderOption(o) : <option key={o.value} value={o.value}>{o.text}</option>)}
        </select>
      )}
      {menu.error && (
        <span className="err">
          {t('loadFailed')}{' '}
          <button type="button" className="link-btn" onClick={menu.retry}>{t('retry')}</button>
        </span>
      )}
    </Field>
  );
}

function StepCar() {
  const { t } = useLang();
  const { state, set } = useFlow();
  const { prices } = useConfig();
  const { sel } = state;
  const years = useMenu('year', [], true);
  const makes = useMenu('make', [sel.year], !!sel.year);
  const models = useMenu('model', [sel.year, sel.make], !!sel.make);
  const trims = useMenu('options', [sel.year, sel.make, sel.model], !!sel.model);
  const [busy, setBusy] = useState(false);

  const pick = (patch) => set((s) => ({ sel: { ...s.sel, ...patch }, car: null, quote: null }));
  const trimItem = trims.items.find((o) => o.text === sel.trim);
  const blocked = trimItem?.blocked;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const car = await backend.findCar(sel).catch(() => null);
    setBusy(false);
    set({ car, quote: null });
    go(priceCar({ car, ownOil: state.ownOil, prices }).mode === 'instant' ? '/book/price' : '/book/quote');
  };

  return (
    <form className="screen" onSubmit={submit}>
      <div>
        <h2>{t('carTitle')}</h2>
        <p className="lede" style={{ marginTop: 10 }}>{t('carSub')}</p>
      </div>
      <MenuSelect id="year" label={t('year')} value={sel.year} enabled menu={years}
        onChange={(v) => pick({ year: v, make: '', model: '', trim: '', fe_id: '' })} />
      <MenuSelect id="make" label={t('make')} value={sel.make} enabled={!!sel.year} disabledText={t('chooseYearFirst')} menu={makes}
        onChange={(v) => pick({ make: v, model: '', trim: '', fe_id: '' })} />
      <MenuSelect id="model" label={t('model')} value={sel.model} enabled={!!sel.make} disabledText={t('chooseMakeFirst')} menu={models}
        onChange={(v) => pick({ model: v, trim: '', fe_id: '' })} />
      <MenuSelect id="trim" label={t('trim')} value={sel.trim} enabled={!!sel.model} disabledText={t('chooseModelFirst')} menu={trims}
        onChange={(v) => {
          const o = trims.items.find((x) => x.text === v);
          pick({ trim: v, fe_id: o?.value || '' });
        }}
        renderOption={(o) => (
          <option key={o.value} value={o.text} disabled={!!o.blocked}>
            {o.text}{o.blocked ? ` (${t('notOfferedOpt')})` : ''}
          </option>
        )} />
      {blocked && <div className="notice warn" role="alert">{t('notOfferedMsg')}</div>}

      <label className="check">
        <input type="checkbox" checked={state.ownOil} onChange={(e) => set({ ownOil: e.target.checked })} />
        <span>
          <span style={{ display: 'block', fontWeight: 500 }}>{t('ownOil')}</span>
          <span className="sub">{t('ownOilHint')}</span>
        </span>
      </label>

      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={!sel.trim || blocked || busy}>
          {busy ? <Spinner /> : t('seePrice')}
        </button>
        <button type="button" className="link-btn" style={{ alignSelf: 'center' }}
          onClick={() => {
            set({ car: null, sel: { ...EMPTY.sel }, quote: null });
            go('/book/quote');
          }}>
          {t('cantFind')}
        </button>
      </div>
    </form>
  );
}

// ───────── Step 2a: instant price ─────────
export function Ticket({ title, sub, lines, total, foot }) {
  const { t, lang } = useLang();
  const [whole, cents] = money(total, 'en').replace('$', '').split('.');
  const lineLabel = (l) =>
    l.key === 'oil' ? t('oilLine', { litres: String(l.litres).replace('.', lang === 'fr' ? ',' : '.'), rate: money(l.rate, lang) })
    : l.key === 'ownOil' ? t('ownOilLine')
    : l.key === 'pickup' ? t('pickupLine')
    : t(l.key);
  return (
    <section className="ticket" aria-label={t('priceTitle')}>
      {title && <div className="ticket-car">{title}</div>}
      {sub && <div className="ticket-trim">{sub}</div>}
      {lines && (
        <ul className="ticket-lines">
          {lines.map((l) => (
            <li key={l.key}>
              <span>{lineLabel(l)}{l.grade ? <span className="muted"> {l.grade}</span> : null}</span>
              <span className="lead" aria-hidden="true" />
              <span className="amt">{money(l.amount, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ticket-total">
        <span className="lbl">{t('total')}</span>
        <span className="big" aria-label={money(total, lang)}>
          {lang === 'fr' ? (
            <>{whole}<span className="c">,{cents} $</span></>
          ) : (
            <><span className="cur">$</span>{whole}<span className="c">.{cents}</span></>
          )}
        </span>
      </div>
      {foot && <p className="ticket-foot">{foot}</p>}
    </section>
  );
}

function StepPrice() {
  const { t } = useLang();
  const { state } = useFlow();
  const { prices } = useConfig();
  const p = priceCar({ car: state.car, ownOil: state.ownOil, prices });
  useEffect(() => {
    if (p.mode !== 'instant') go('/book');
  }, [p.mode]);
  if (p.mode !== 'instant') return null;
  const { year, make, model, trim } = state.sel;
  return (
    <div className="screen">
      <BackBtn to="/book" />
      <h2>{t('priceTitle')}</h2>
      <Ticket title={`${year} ${make} ${model}`} sub={trim} lines={p.lines} total={p.total} foot={t('payAfter')} />
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={() => go('/book/time')}>{t('bookIt')}</button>
      </div>
    </div>
  );
}

// ───────── Step 2b: manual quote ─────────
function QuoteForm() {
  const { t, lang } = useLang();
  const { state, set } = useFlow();
  const { prices } = useConfig();
  const { sel } = state;
  const hasCar = !!sel.trim;
  const p = hasCar ? priceCar({ car: state.car, ownOil: state.ownOil, prices }) : { reason: 'manual' };
  const why = { unknown: 'quoteWhyUnknown', grade: 'quoteWhyGrade', special: 'quoteWhySpecial', manual: 'quoteWhyManual' }[p.reason] || 'quoteWhyManual';
  const [f, setF] = useState({ car_text: '', name: state.name, phone: state.phone, address: state.address, notes: '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const { settings } = useConfig();

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!hasCar && !f.car_text.trim()) er.car_text = t('required');
    if (!f.name.trim()) er.name = t('required');
    if (!phoneValid(f.phone)) er.phone = t('phoneInvalid');
    if (!f.address.trim()) er.address = t('required');
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setFail(false);
    try {
      await backend.createQuoteRequest({
        reason: hasCar ? p.reason : 'manual',
        name: f.name.trim(), phone: f.phone, address: f.address.trim(), notes: f.notes.trim(), lang,
        ...(hasCar ? { year: sel.year, make: sel.make, model: sel.model, trim: sel.trim, fe_id: sel.fe_id } : { car_text: f.car_text.trim() }),
        own_oil: state.ownOil,
        oil_grade: state.car?.oil_grade || null,
      });
      set({ name: f.name, phone: f.phone, address: f.address });
      go('/book/sent');
    } catch {
      setFail(true);
    } finally {
      setBusy(false);
    }
  };
  const bind = (k) => ({
    id: `q-${k}`, value: f[k], 'aria-invalid': errs[k] ? 'true' : undefined,
    onChange: (e) => setF((x) => ({ ...x, [k]: e.target.value })),
  });

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <BackBtn to="/book" />
      <div>
        <h2>{t('quoteTitle')}</h2>
        <p className="lede" style={{ marginTop: 10 }}>{t(why)}</p>
      </div>
      {hasCar ? (
        <div className="notice">
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{sel.year} {sel.make} {sel.model}</div>
          <div className="small">{sel.trim}{state.ownOil ? `. ${t('ownOil')}` : ''}</div>
        </div>
      ) : (
        <Field id="q-car_text" label={t('carText')} error={errs.car_text}>
          <input className="input" placeholder={t('carTextPh')} {...bind('car_text')} />
        </Field>
      )}
      <Field id="q-name" label={t('name')} error={errs.name}>
        <input className="input" autoComplete="name" {...bind('name')} />
      </Field>
      <Field id="q-phone" label={t('phone')} error={errs.phone}>
        <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('phonePh')} {...bind('phone')} />
      </Field>
      <Field id="q-address" label={t('address')} error={errs.address}>
        <input className="input" autoComplete="street-address" placeholder={t('addressPh')} {...bind('address')} />
      </Field>
      <Field id="q-notes" label={t('notesOpt')}>
        <textarea className="input" placeholder={t('notesPh')} {...bind('notes')} />
      </Field>
      {fail && <div className="notice warn" role="alert">{t('genericError', { phone: prettyPhone(settings.roy_phone) })}</div>}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <><Spinner /> {t('sending')}</> : t('sendToRoy')}</button>
      </div>
    </form>
  );
}

function QuoteSent() {
  const { t } = useLang();
  const { state, reset } = useFlow();
  return (
    <div className="screen" style={{ paddingTop: 32 }}>
      <div className="done-mark"><Icon name="msg" size={34} stroke={2.2} /></div>
      <h2>{t('quoteSentTitle')}</h2>
      <p className="lede">{t('quoteSentBody', { phone: prettyPhone(state.phone) })}</p>
      <div className="actions">
        <button className="btn btn-block" type="button" onClick={() => { reset(); go('/'); }}>{t('backHome')}</button>
      </div>
    </div>
  );
}

/** Roy's text links here: #/book?quote=<id>. Loads the priced quote and jumps to step 3. */
function QuoteLink({ id }) {
  const { t, setLang } = useLang();
  const { set } = useFlow();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    backend.getQuoteForBooking(id).then(
      (q) => {
        if (!q) return setMissing(true);
        set({
          ...EMPTY,
          quote: q,
          sel: { year: q.year, make: q.make, model: q.model, trim: q.trim, fe_id: '' },
          ownOil: q.own_oil,
          name: q.name, phone: q.phone, address: q.address,
        });
        if (q.lang) setLang(q.lang);
        go('/book/time');
      },
      () => setMissing(true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      {missing ? (
        <>
          <h2>{t('quoteLinkTitle')}</h2>
          <div className="notice warn">{t('quoteLinkMissing')}</div>
          <button className="btn" type="button" onClick={() => go('/')}>{t('backHome')}</button>
        </>
      ) : (
        <div className="skeleton" style={{ height: 240 }} role="status" aria-label={t('loading')} />
      )}
    </div>
  );
}

// ───────── Step 3: time + pickup ─────────
function basePrice(state, prices) {
  if (state.quote) return Number(state.quote.price);
  const p = priceCar({ car: state.car, ownOil: state.ownOil, prices });
  return p.mode === 'instant' ? p.total : null;
}

function StepTime() {
  const { t, lang } = useLang();
  const { state, set } = useFlow();
  const { settings, prices, weeks, ready } = useConfig();
  const [busy, setBusy] = useState(null);
  const [day, setDay] = useState(state.slot?.date || null);
  const base = basePrice(state, prices);

  useEffect(() => {
    if (base == null) go('/book');
  }, [base]);

  useEffect(() => {
    if (!ready) return;
    const from = today();
    backend.getBusy(from, addDays(from, Number(settings.window_days))).then(setBusy, () => setBusy([]));
  }, [ready, settings.window_days]);

  const days = useMemo(
    () =>
      busy
        ? availableDays({ weeks, template: settings.default_week, busy, rules: settings })
            // Hide today once its last slot has passed, so it doesn't read as "Full".
            .filter((d) => !(d.date === today() && !d.slots.length))
        : null,
    [busy, weeks, settings],
  );
  useEffect(() => {
    if (days && !day) setDay(days.find((d) => d.slots.length)?.date || null);
  }, [days, day]);

  const onStreet = onAllowedStreet(state.address, settings.pickup_street);
  useEffect(() => {
    if (!onStreet && pickupNeeded(state.pickup)) set({ pickup: 'dropoff' });
  }, [onStreet]); // eslint-disable-line react-hooks/exhaustive-deps

  if (base == null) return null;
  const sel = days?.find((d) => d.date === day);
  const fee = money(prices.pickup_fee, lang);
  const total = withPickup(base, state.pickup, prices);
  const opts = ['dropoff', 'pickup', 'return', 'both'];

  return (
    <div className="screen">
      {!state.quote && <BackBtn to="/book/price" />}
      <div>
        <h2>{t('timeTitle')}</h2>
        <p className="lede" style={{ marginTop: 10 }}>{t('timeSub')}</p>
      </div>

      {!days ? (
        <div className="skeleton" style={{ height: 150 }} role="status" aria-label={t('loading')} />
      ) : days.every((d) => !d.slots.length) ? (
        <div className="notice">{t('noSlots')}</div>
      ) : (
        <>
          <div className="days" role="group" aria-label={t('timeTitle')}>
            {days.map((d) => {
              const dt = parseDate(d.date);
              const loc = lang === 'fr' ? 'fr-CA' : 'en-CA';
              return (
                <button key={d.date} type="button" className="day" aria-pressed={d.date === day}
                  disabled={!d.slots.length} onClick={() => setDay(d.date)}
                  aria-label={dt.toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' })}>
                  <span className="dw">{dt.toLocaleDateString(loc, { weekday: 'short' })}</span>
                  <span className="dn">{dt.getDate()}</span>
                  <span className="ds">{!d.open ? t('closed') : !d.slots.length ? t('full') : dt.toLocaleDateString(loc, { month: 'short' })}</span>
                </button>
              );
            })}
          </div>
          {sel && (
            <div className="times" role="group" aria-label={t('when')}>
              {sel.slots.map((m) => {
                const on = state.slot?.date === sel.date && state.slot?.start_min === m;
                return (
                  <button key={m} type="button" className="time" aria-pressed={on}
                    onClick={() => set({ slot: { date: sel.date, start_min: m } })}>
                    {formatTime(m, lang)}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <h3 style={{ marginTop: 10 }}>{t('pickupTitle')}</h3>
      <Field id="t-address" label={t('streetAddress')} hint={onStreet ? t('pickupUnlocked') : t('pickupOnlySimonet')}>
        <input id="t-address" className="input" autoComplete="street-address" placeholder={t('addressPh')}
          value={state.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <div className="choices" role="group" aria-label={t('pickupTitle')}>
        {opts.map((o) => (
          <button key={o} type="button" className="choice" aria-pressed={state.pickup === o}
            disabled={o !== 'dropoff' && !onStreet} onClick={() => set({ pickup: o })}>
            <span>{t(`pk_${o}`)}</span>
            <span className="fee">{o === 'dropoff' ? t('free') : t('plusFee', { fee })}</span>
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="btn btn-primary" type="button" disabled={!state.slot || !days?.find((d) => d.date === state.slot.date)?.slots.includes(state.slot.start_min)}
          onClick={() => go('/book/info')}>
          {state.slot ? `${t('continue')}  ${money(total, lang)}` : t('pickTimeFirst')}
        </button>
      </div>
    </div>
  );
}

// ───────── Step 4: info ─────────
function StepInfo() {
  const { t, lang } = useLang();
  const { state, set } = useFlow();
  const { settings, prices } = useConfig();
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const base = basePrice(state, prices);
  useEffect(() => {
    if (base == null || !state.slot) go('/book');
  }, [base, state.slot]);
  if (base == null || !state.slot) return null;

  const onStreet = onAllowedStreet(state.address, settings.pickup_street);
  const pickup = onStreet ? state.pickup : 'dropoff';
  const total = withPickup(base, pickup, prices);
  const car = state.quote ? carLabel(state.quote) : carLabel(state.sel);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!state.name.trim()) er.name = t('required');
    if (!phoneValid(state.phone)) er.phone = t('phoneInvalid');
    if (!state.address.trim()) er.address = t('required');
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setFail(null);
    try {
      const req = {
        date: state.slot.date, start_min: state.slot.start_min,
        name: state.name.trim(), phone: state.phone, address: state.address.trim(), notes: state.notes.trim(), lang,
        own_oil: state.ownOil, pickup,
        ...(state.quote
          ? { quote_id: state.quote.id, car_text: state.quote.car_text || '' }
          : { year: state.sel.year, make: state.sel.make, model: state.sel.model, trim: state.sel.trim }),
      };
      const res = await backend.createBooking(req);
      set({ pickup, result: { ...req, ...(state.quote || {}), ...req, id: res.id, price: res.price } });
      go('/book/done');
    } catch (err) {
      if (err.code === 'slot_taken') {
        set({ slot: null });
        setFail('slotTaken');
      } else setFail('genericError');
    } finally {
      setBusy(false);
    }
  };

  const bind = (k) => ({
    id: `i-${k}`, value: state[k], 'aria-invalid': errs[k] ? 'true' : undefined,
    onChange: (e) => set({ [k]: e.target.value }),
  });

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <BackBtn to="/book/time" />
      <h2>{t('infoTitle')}</h2>
      <div className="summary">
        <dl>
          <div className="row"><dt>{t('when')}</dt><dd>{whenLabel(state.slot, lang)}</dd></div>
          <div className="row"><dt>{t('car')}</dt><dd>{car}</dd></div>
          <div className="row"><dt>{t('pickup')}</dt><dd>{t(`pk_${pickup}`)}</dd></div>
          <div className="row"><dt>{t('price')}</dt><dd className="price tnum">{money(total, lang)}</dd></div>
        </dl>
      </div>
      {pickup !== state.pickup && <div className="notice warn" role="alert">{t('pickupLost')}</div>}
      <Field id="i-name" label={t('name')} error={errs.name}>
        <input className="input" autoComplete="name" {...bind('name')} />
      </Field>
      <Field id="i-phone" label={t('phone')} error={errs.phone}>
        <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('phonePh')} {...bind('phone')} />
      </Field>
      <Field id="i-address" label={t('address')} error={errs.address}>
        <input className="input" autoComplete="street-address" placeholder={t('addressPh')} {...bind('address')} />
      </Field>
      <Field id="i-notes" label={t('notesOpt')}>
        <textarea className="input" placeholder={t('notesPh')} {...bind('notes')} />
      </Field>
      <p className="small muted">{t('payNoteFull', { email: settings.etransfer_email })}</p>
      {fail === 'slotTaken' && (
        <div className="notice warn" role="alert">
          {t('slotTaken')} <button type="button" className="link-btn" onClick={() => go('/book/time')}>{t('timeTitle')}</button>
        </div>
      )}
      {fail === 'genericError' && <div className="notice warn" role="alert">{t('genericError', { phone: prettyPhone(settings.roy_phone) })}</div>}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <><Spinner /> {t('booking')}</> : t('book')}</button>
      </div>
    </form>
  );
}

// ───────── Booked ─────────
function Booked() {
  const { t, lang } = useLang();
  const { state, reset } = useFlow();
  const { settings } = useConfig();
  const b = state.result;
  useEffect(() => {
    if (!b) go('/');
  }, [b]);
  if (!b) return null;
  const car = carLabel(b);
  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div className="done-mark"><Icon name="check" size={36} stroke={2.6} /></div>
      <div>
        <h2>{t('bookedTitle')}</h2>
        <p className="lede" style={{ marginTop: 10 }}>{t('bookedSub', { when: whenLabel(b, lang) })}</p>
      </div>
      <div className="summary">
        <dl>
          <div className="row"><dt>{t('when')}</dt><dd>{whenLabel(b, lang)}</dd></div>
          <div className="row"><dt>{t('car')}</dt><dd>{car}</dd></div>
          <div className="row"><dt>{t('pickup')}</dt><dd>{t(`pk_${b.pickup}`)}</dd></div>
          <div className="row"><dt>{t('price')}</dt><dd className="price tnum">{money(b.price, lang)}</dd></div>
        </dl>
      </div>
      <p className="small muted">{t('payNoteFull', { email: settings.etransfer_email })}</p>
      <div className="actions actions-static">
        <button className="btn btn-primary" type="button" onClick={() => icsFile({ booking: b, t, lang, settings })}>
          <Icon name="cal" /> {t('addCal')}
        </button>
        <a className="btn btn-block" href={smsLink(settings.roy_phone, '')}><Icon name="msg" /> {t('textRoy')}</a>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>{t('changePlans')}</p>
        <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => { reset(); go('/'); }}>{t('backHome')}</button>
      </div>
    </div>
  );
}
