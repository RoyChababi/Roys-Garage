// Local demo backend: everything lives in this browser's localStorage.
// Same interface as backend/supabase.js so the app runs before Supabase is set up.
import { DEFAULT_PRICES } from '../lib/pricing.js';
import { DEFAULT_RULES, DEFAULT_WEEK, today, addDays, weekStart } from '../lib/slots.js';
import { validateBooking } from '../lib/booking.js';
import { normalizePhone, carShort } from '../lib/messages.js';

const KEY = 'rg_local_db_v1';
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));
const clone = (v) => JSON.parse(JSON.stringify(v));

export const DEFAULT_SETTINGS = {
  roy_phone: '4389222595',
  etransfer_email: 'roychababi53@gmail.com',
  notification_email: 'roychababi53@gmail.com',
  admin_email: 'roychababi53@gmail.com',
  pickup_street: 'rue Simonet',
  site_url: '',
  ...DEFAULT_RULES,
  default_week: DEFAULT_WEEK,
};

// Starter car table (scripts/build-car-table.mjs). Loaded on demand so it never ships in the
// production bundle; merged once into the demo DB without overwriting cars Roy already edited.
const CAR_SEED_VERSION = 2;
const SAMPLE_CARS = [];
const carKeyOf = (c) => [c.year, c.make, c.model, c.trim].map((x) => String(x ?? '').toLowerCase()).join('|');
let carSeedPromise = null;
function ensureCars() {
  if (load().carSeed >= CAR_SEED_VERSION) return Promise.resolve();
  carSeedPromise ||= import('../data/car-table.json').then(({ default: rows }) => {
    const db = load();
    const have = new Set(db.cars.map(carKeyOf));
    for (const r of rows) if (!have.has(carKeyOf(r))) db.cars.push({ id: uid(), ...r });
    db.carSeed = CAR_SEED_VERSION;
    save(db);
  });
  return carSeedPromise;
}

function seed() {
  const d0 = today();
  const now = new Date().toISOString();
  const cars = SAMPLE_CARS.map((c) => ({ id: uid(), quote_only: false, notes: '', ...c }));
  const bk = (o) => ({ id: uid(), created_at: now, status: 'booked', lang: 'en', own_oil: false, pickup: 'dropoff', notes: '', quote_id: null, car_text: '', ...o });
  return {
    settings: clone(DEFAULT_SETTINGS),
    prices: clone(DEFAULT_PRICES),
    cars,
    weeks: {},
    bookings: [
      bk({ date: d0, start_min: 18 * 60, name: 'Marie Tremblay', phone: '5145550142', address: '41 rue Simonet', lang: 'fr', year: '2019', make: 'Honda', model: 'Civic 4Dr', trim: 'Auto (variable gear ratios), 4 cyl, 2.0 L', pickup: 'both', price: 83.95, base_price: 78.95 }),
      bk({ date: d0, start_min: 19 * 60, name: 'Dave Wilson', phone: '4385550187', address: '220 boul. Saint-Jean', year: '2018', make: 'Ford', model: 'F150 Pickup 4WD', trim: 'Auto (S10), 8 cyl, 5.0 L', price: 124.21, base_price: 124.21 }),
      bk({ date: addDays(d0, 2), start_min: 17 * 60, name: 'Priya Nair', phone: '5145550199', address: '12 av. Douglas-Shand', year: '2020', make: 'Hyundai', model: 'Elantra', trim: 'Auto (variable gear ratios), 4 cyl, 2.0 L', price: 84.21, base_price: 84.21 }),
    ],
    quotes: [
      { id: uid(), created_at: now, status: 'new', reason: 'unknown', name: 'Luc Gagnon', phone: '5145550111', address: '8 rue Simonet', lang: 'fr', notes: 'Disponible le soir', year: '2016', make: 'Kia', model: 'Soul', trim: 'Auto 6-spd, 4 cyl, 2.0 L', fe_id: '', car_text: '', own_oil: false, litres: null, oil_grade: '5W-30', rate: null, filter: null, price: null },
      { id: uid(), created_at: now, status: 'new', reason: 'manual', name: 'Sam Patel', phone: '4385550123', address: '77 ch. Bord-du-Lac', lang: 'en', notes: '', year: '', make: '', model: '', trim: '', fe_id: '', car_text: '2012 Mazda 3 Sport (Canadian GS)', own_oil: false, litres: null, oil_grade: '5W-20', rate: null, filter: null, price: null },
    ],
    customers: [
      { id: uid(), name: 'Jean Roy', phone: '5145550166', address: '30 rue Simonet', lang: 'fr', cars: ['2017 Toyota Corolla'], last_service: addDays(d0, -200), reminded_at: null, visits: 2 },
      { id: uid(), name: 'Alex Chen', phone: '4385550155', address: '5 av. Lakeview', lang: 'en', cars: ['2020 Hyundai Elantra'], last_service: addDays(d0, -45), reminded_at: null, visits: 1 },
    ],
    menuCache: {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const db = seed();
  save(db);
  return db;
}
function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}
function tx(fn) {
  const db = load();
  const out = fn(db);
  save(db);
  return delay(clone(out ?? null));
}

const active = (b) => b.status !== 'cancelled';
const authListeners = new Set();
const SESSION_KEY = 'rg_local_session';
const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};

function notify(kind, record, db) {
  // In production a Supabase Edge Function emails these. Locally we log them.
  console.info(`[Roy's Garage] Email to ${db.settings.notification_email}: new ${kind}`, record);
}

export const localBackend = {
  mode: 'local',

  // ---------- public ----------
  getPublicConfig: () =>
    tx((db) => {
      const { notification_email, admin_email, ...pub } = db.settings;
      return { settings: pub, prices: db.prices, weeks: db.weeks };
    }),
  getBusy: (from, to) =>
    tx((db) => db.bookings.filter((b) => active(b) && b.date >= from && b.date <= to).map((b) => ({ date: b.date, start_min: b.start_min }))),
  findCar: async (sel) => {
    await ensureCars();
    return tx((db) => db.cars.find((c) => carKeyOf(c) === carKeyOf(sel)) || null);
  },
  createQuoteRequest: (q) =>
    tx((db) => {
      const rec = { id: uid(), created_at: new Date().toISOString(), status: 'new', litres: null, rate: null, filter: null, price: null, ...q };
      db.quotes.unshift(rec);
      notify('quote request', rec, db);
      return { id: rec.id };
    }),
  getQuoteForBooking: (id) =>
    tx((db) => {
      const q = db.quotes.find((x) => x.id === id);
      if (!q || q.price == null) return null;
      const { year, make, model, trim, car_text, own_oil, price, name, phone, address, lang } = q;
      return { id, year, make, model, trim, car_text, own_oil, price, name, phone, address, lang };
    }),
  createBooking: async (req) => {
    await ensureCars();
    const db = load();
    const quote = req.quote_id ? db.quotes.find((q) => q.id === req.quote_id) : null;
    const busy = db.bookings.filter(active).map((b) => ({ date: b.date, start_min: b.start_min }));
    const priced = validateBooking(req, { cars: db.cars, prices: db.prices, settings: db.settings, weeks: db.weeks, busy, quote });
    const rec = {
      id: uid(), created_at: new Date().toISOString(), status: 'booked', notes: '',
      ...req, phone: normalizePhone(req.phone), price: priced.price, base_price: priced.base_price,
    };
    db.bookings.push(rec);
    if (quote) quote.status = 'booked';
    notify('booking', rec, db);
    save(db);
    return delay({ id: rec.id, price: rec.price });
  },
  getMenuCache: (key) => tx((db) => db.menuCache[key] || null),
  setMenuCache: (key, data) =>
    tx((db) => {
      db.menuCache[key] = data;
    }),

  // ---------- auth ----------
  getUser: async () => getSession(),
  signIn: async (email) => {
    const db = load();
    if (String(email).trim().toLowerCase() !== db.settings.admin_email.toLowerCase()) throw new Error('not_allowed');
    // Local demo: no email is sent; we log in right away.
    const user = { email: db.settings.admin_email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    authListeners.forEach((f) => f(user));
    return { user, sent: false };
  },
  signOut: async () => {
    localStorage.removeItem(SESSION_KEY);
    authListeners.forEach((f) => f(null));
  },
  onAuthChange: (cb) => {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },

  // ---------- admin ----------
  getAdmin: () => tx((db) => ({ settings: db.settings, prices: db.prices })),
  saveSettings: (s) => tx((db) => void (db.settings = { ...db.settings, ...s })),
  savePrices: (p) => tx((db) => void (db.prices = { ...db.prices, ...p })),

  listBookings: (from, to) =>
    tx((db) => db.bookings.filter((b) => b.date >= from && b.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min)),
  updateBooking: (id, patch) =>
    tx((db) => {
      const b = db.bookings.find((x) => x.id === id);
      Object.assign(b, patch);
      return b;
    }),
  markDone: (id) =>
    tx((db) => {
      const b = db.bookings.find((x) => x.id === id);
      b.status = 'done';
      const phone = normalizePhone(b.phone);
      let c = db.customers.find((x) => x.phone === phone);
      if (!c) {
        c = { id: uid(), phone, cars: [], visits: 0, reminded_at: null };
        db.customers.push(c);
      }
      Object.assign(c, { name: b.name, address: b.address, lang: b.lang, last_service: b.date, visits: (c.visits || 0) + 1 });
      const car = carShort(b);
      c.cars = [car, ...c.cars.filter((x) => x !== car)];
      return b;
    }),

  listQuotes: () => tx((db) => db.quotes),
  updateQuote: (id, patch) =>
    tx((db) => {
      const q = db.quotes.find((x) => x.id === id);
      Object.assign(q, patch);
      return q;
    }),
  deleteQuote: (id) => tx((db) => void (db.quotes = db.quotes.filter((q) => q.id !== id))),

  listCustomers: () => tx((db) => db.customers),
  updateCustomer: (id, patch) => tx((db) => Object.assign(db.customers.find((c) => c.id === id), patch)),

  listCars: async () => {
    await ensureCars();
    return tx((db) => db.cars);
  },
  saveCar: (car) =>
    tx((db) => {
      const k = (c) => [c.year, c.make, c.model, c.trim].map((x) => String(x ?? '').toLowerCase()).join('|');
      const existing = car.id ? db.cars.find((c) => c.id === car.id) : db.cars.find((c) => k(c) === k(car));
      if (existing) return Object.assign(existing, car, { id: existing.id });
      const rec = { id: uid(), quote_only: false, notes: '', ...car };
      db.cars.push(rec);
      return rec;
    }),
  deleteCar: (id) => tx((db) => void (db.cars = db.cars.filter((c) => c.id !== id))),

  getWeeks: () => tx((db) => db.weeks),
  saveWeek: (ws, days) => tx((db) => void (db.weeks[ws] = days)),
  clearWeek: (ws) => tx((db) => void delete db.weeks[ws]),

  resetDemo: () => {
    localStorage.removeItem(KEY);
    carSeedPromise = null;
    return delay(null);
  },
};

export { weekStart };
