// Server-side style checks shared by the local backend. The Supabase RPC `create_booking`
// enforces the same rules in SQL (supabase/migrations/001_init.sql).
import { priceCar, withPickup, pickupNeeded } from './pricing.js';
import { availableDays } from './slots.js';
import { onAllowedStreet, phoneValid } from './messages.js';

export class BookingError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const carKey = (c) =>
  [c.year, c.make, c.model, c.trim].map((x) => String(x ?? '').trim().toLowerCase()).join('|');

export function matchCar(cars, sel) {
  const k = carKey(sel);
  return cars.find((c) => carKey(c) === k) || null;
}

/**
 * Validate a booking request and compute its final price.
 * @returns {{ price:number, base_price:number, breakdown:Array }}
 */
export function validateBooking(req, { cars, prices, settings, weeks, busy, quote }) {
  if (!req.name?.trim() || !req.address?.trim() || !phoneValid(req.phone)) throw new BookingError('missing_fields');
  if (pickupNeeded(req.pickup) && !onAllowedStreet(req.address, settings.pickup_street)) throw new BookingError('pickup_street');

  const ok = availableDays({ weeks, template: settings.default_week, busy, rules: settings })
    .find((d) => d.date === req.date)
    ?.slots.includes(req.start_min);
  if (!ok) throw new BookingError('slot_taken');

  if (quote) {
    if (quote.price == null) throw new BookingError('quote_not_priced');
    return { base_price: quote.price, price: withPickup(quote.price, req.pickup, prices), breakdown: null };
  }
  const car = matchCar(cars, req);
  const p = priceCar({ car, ownOil: req.own_oil, prices, pickup: req.pickup });
  if (p.mode !== 'instant') throw new BookingError('needs_quote');
  const base = p.lines.filter((l) => l.key !== 'pickup').reduce((s, l) => s + l.amount, 0);
  return { base_price: base, price: p.total, breakdown: p.lines };
}
