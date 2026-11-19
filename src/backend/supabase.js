// Supabase backend. Same interface as backend/local.js.
import { createClient } from '@supabase/supabase-js';
import { BookingError } from '../lib/booking.js';
import { normalizePhone, carShort } from '../lib/messages.js';

const toWeekRows = (ws, days) =>
  days.map((d, dow) => ({ week_start: ws, dow, open: d.open, start_min: d.start, end_min: d.end }));

export function createSupabaseBackend(url, key) {
  const sb = createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
  const ok = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      const code = ['slot_taken', 'pickup_street', 'needs_quote', 'missing_fields', 'quote_not_priced'].find((c) =>
        error.message?.includes(c));
      throw code ? new BookingError(code) : error;
    }
    return data;
  };
  const notify = (kind, id) => sb.functions.invoke('notify', { body: { kind, id } }).catch(() => {});

  return {
    mode: 'supabase',

    // ---------- public ----------
    getPublicConfig: () => rpc('public_config'),
    getBusy: (from, to) => rpc('get_busy', { p_from: from, p_to: to }),
    findCar: (c) => rpc('find_car', { p_year: String(c.year), p_make: c.make, p_model: c.model, p_trim: c.trim }),
    createQuoteRequest: async (q) => {
      const id = await rpc('create_quote_request', { q });
      notify('quote', id);
      return { id };
    },
    getQuoteForBooking: (id) => rpc('get_quote_for_booking', { p_id: id }),
    createBooking: async (b) => {
      const res = await rpc('create_booking', { b });
      notify('booking', res.id);
      return res;
    },
    getMenuCache: async (key) => {
      const { data } = await sb.from('vehicle_menu_cache').select('data').eq('key', key).maybeSingle();
      return data?.data ?? null;
    },
    // Edge Function fetches from FuelEconomy.gov and writes the cache with the service key.
    fetchMenu: async (key) => {
      const { data, error } = await sb.functions.invoke('vehicle-menu', { body: { key } });
      if (error) throw error;
      return data?.data ?? null;
    },

    // ---------- auth ----------
    getUser: async () => (await sb.auth.getSession()).data.session?.user ?? null,
    signIn: async (email) => {
      // No "#/admin" here: Supabase appends its own #access_token, and two hashes break the login.
      const redirect = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: redirect },
      });
      if (error) throw error;
      return { sent: true };
    },
    signOut: () => sb.auth.signOut(),
    onAuthChange: (cb) => {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },

    // ---------- admin ----------
    getAdmin: async () => {
      const [settings, prices, admins] = await Promise.all([
        sb.from('settings').select('*').eq('id', 1).single().then(ok),
        sb.from('prices').select('*').eq('id', 1).single().then(ok),
        sb.from('admin_users').select('email').then(ok),
      ]);
      return { settings: { ...settings, admin_email: admins[0]?.email }, prices };
    },
    saveSettings: async ({ admin_email, id, ...s }) => ok(await sb.from('settings').update(s).eq('id', 1)),
    savePrices: async ({ id, ...p }) => ok(await sb.from('prices').update(p).eq('id', 1)),

    listBookings: async (from, to) =>
      ok(await sb.from('bookings').select('*').gte('date', from).lte('date', to).order('date').order('start_min')),
    updateBooking: async (id, patch) => ok(await sb.from('bookings').update(patch).eq('id', id).select().single()),
    markDone: async (id) => {
      const b = ok(await sb.from('bookings').update({ status: 'done' }).eq('id', id).select().single());
      const phone = normalizePhone(b.phone);
      const existing = ok(await sb.from('customers').select('*').eq('phone', phone).maybeSingle());
      const car = carShort(b);
      const row = {
        phone, name: b.name, address: b.address, lang: b.lang, last_service: b.date,
        visits: (existing?.visits || 0) + 1,
        cars: [car, ...(existing?.cars || []).filter((x) => x !== car)],
      };
      ok(await sb.from('customers').upsert(row, { onConflict: 'phone' }));
      return b;
    },

    listQuotes: async () => ok(await sb.from('quote_requests').select('*').neq('status', 'archived').order('created_at', { ascending: false })),
    updateQuote: async (id, patch) => ok(await sb.from('quote_requests').update(patch).eq('id', id).select().single()),
    deleteQuote: async (id) => ok(await sb.from('quote_requests').update({ status: 'archived' }).eq('id', id)),

    listCustomers: async () => ok(await sb.from('customers').select('*').order('last_service', { ascending: true })),
    updateCustomer: async (id, patch) => ok(await sb.from('customers').update(patch).eq('id', id)),

    listCars: async () => ok(await sb.from('car_table').select('*').order('make').order('model').order('year')),
    saveCar: async (car) => {
      const { created_at, ...row } = car;
      if (row.id) return ok(await sb.from('car_table').update(row).eq('id', row.id).select().single());
      const { data: existing } = await sb.rpc('find_car', { p_year: String(row.year), p_make: row.make, p_model: row.model, p_trim: row.trim });
      if (existing) return ok(await sb.from('car_table').update(row).eq('id', existing.id).select().single());
      return ok(await sb.from('car_table').insert(row).select().single());
    },
    deleteCar: async (id) => ok(await sb.from('car_table').delete().eq('id', id)),

    getWeeks: async () => {
      const rows = ok(await sb.from('schedule_weeks').select('*').order('week_start').order('dow'));
      const weeks = {};
      for (const r of rows) (weeks[r.week_start] ||= [])[r.dow] = { open: r.open, start: r.start_min, end: r.end_min };
      return weeks;
    },
    saveWeek: async (ws, days) => ok(await sb.from('schedule_weeks').upsert(toWeekRows(ws, days))),
    clearWeek: async (ws) => ok(await sb.from('schedule_weeks').delete().eq('week_start', ws)),
  };
}
