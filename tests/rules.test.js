import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCar, DEFAULT_PRICES, quoteTotal, oilRate } from '../src/lib/pricing.js';
import { slotsForDay, availableDays, DEFAULT_RULES, DEFAULT_WEEK, addDays, dowMon } from '../src/lib/slots.js';
import { onAllowedStreet } from '../src/lib/messages.js';
import { validateBooking, BookingError } from '../src/lib/booking.js';

const cents = (n) => Math.round(n * 100) / 100;
const car = (litres, grade = '0W-20', extra = {}) => ({ year: '2020', make: 'X', model: 'Y', trim: 'Z', oil_litres: litres, oil_grade: grade, ...extra });

test('price examples from the requirements', () => {
  assert.equal(cents(priceCar({ car: car(4.2), prices: DEFAULT_PRICES }).total), 84.21);
  assert.equal(cents(priceCar({ car: car(8, '5W-20'), prices: DEFAULT_PRICES }).total), 124.21);
  assert.equal(priceCar({ car: car(8), ownOil: true, prices: DEFAULT_PRICES }).total, 50);
  assert.equal(cents(oilRate(DEFAULT_PRICES)), 10.53);
});

test('pickup adds $5 once, any direction', () => {
  for (const pickup of ['pickup', 'return', 'both'])
    assert.equal(cents(priceCar({ car: car(4.2), prices: DEFAULT_PRICES, pickup }).total), 89.21);
});

test('per-car filter price is used', () => {
  assert.equal(cents(priceCar({ car: car(4.2, '0W-20', { filter_price: 18 }), prices: DEFAULT_PRICES }).total), 92.21);
});

test('unknown car, other grades and quote-only cars go to a quote', () => {
  assert.equal(priceCar({ car: null, prices: DEFAULT_PRICES }).mode, 'quote');
  assert.equal(priceCar({ car: car(5, '0W-40'), prices: DEFAULT_PRICES }).reason, 'grade');
  assert.equal(priceCar({ car: car(5, '5W-30', { quote_only: true }), prices: DEFAULT_PRICES }).reason, 'special');
  assert.equal(quoteTotal({ litres: 4.2, rate: 50 / 4.75, filter: 10 }, DEFAULT_PRICES).toFixed(2), '84.21');
});

const evening = { open: true, start: 17 * 60, end: 22 * 60 };
test('empty day offers every start that fits', () => {
  assert.deepEqual(slotsForDay({ hours: evening }), [1020, 1080, 1140, 1200, 1260]);
});

test('back to back: only slots touching the booked block', () => {
  assert.deepEqual(slotsForDay({ hours: evening, booked: [1140] }), [1080, 1200]);
  assert.deepEqual(slotsForDay({ hours: evening, booked: [1140, 1200] }), [1080, 1260]);
  assert.deepEqual(slotsForDay({ hours: evening, booked: [1020] }), [1080]);
});

test('3-car limit', () => {
  assert.deepEqual(slotsForDay({ hours: evening, booked: [1080, 1140, 1200] }), []);
});

test('closed day has no slots', () => {
  assert.deepEqual(slotsForDay({ hours: { ...evening, open: false } }), []);
});

test('7-day window, Thursday closed', () => {
  const from = '2026-11-16'; // a Monday
  const days = availableDays({ weeks: {}, template: DEFAULT_WEEK, busy: [], rules: DEFAULT_RULES, from, nowMin: 0 });
  assert.equal(days.length, 7);
  assert.equal(days.at(-1).date, addDays(from, 6));
  const thu = days.find((d) => dowMon(d.date) === 3);
  assert.equal(thu.open, false);
  assert.equal(thu.slots.length, 0);
  const sat = days.find((d) => dowMon(d.date) === 5);
  assert.equal(sat.slots[0], 9 * 60);
});

test('pickup only on rue Simonet', () => {
  assert.ok(onAllowedStreet('41 rue Simonet', 'rue Simonet'));
  assert.ok(onAllowedStreet('41 Simonet St., Dollard', 'rue Simonet'));
  assert.ok(!onAllowedStreet('220 boul. Saint-Jean', 'rue Simonet'));
  assert.ok(!onAllowedStreet('12 Simonetti Ave', 'rue Simonet'));
});

test('booking validation rejects pickup off the street and taken slots', () => {
  const from = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // find an open day 1–6 days from now
  const settings = { ...DEFAULT_RULES, default_week: DEFAULT_WEEK, pickup_street: 'rue Simonet' };
  const target = [1, 2, 3, 4, 5, 6].map((i) => addDays(iso(from), i)).find((d) => dowMon(d) !== 3);
  const start = DEFAULT_WEEK[dowMon(target)].start;
  const ctx = { cars: [car(4.2)], prices: DEFAULT_PRICES, settings, weeks: {}, busy: [] };
  const req = { ...car(4.2), name: 'A', phone: '5145550000', address: '1 boul. X', date: target, start_min: start, pickup: 'dropoff' };
  assert.equal(cents(validateBooking(req, ctx).price), 84.21);
  assert.throws(() => validateBooking({ ...req, pickup: 'both' }, ctx), (e) => e instanceof BookingError && e.code === 'pickup_street');
  assert.throws(() => validateBooking(req, { ...ctx, busy: [{ date: target, start_min: start }] }), (e) => e.code === 'slot_taken');
  assert.throws(() => validateBooking({ ...req, date: addDays(iso(from), 8) }, ctx), (e) => e.code === 'slot_taken');
});
