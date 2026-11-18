// Pricing rules. Every number comes from the editable `prices` record.
// Price = labour + filter + litres × $/L (+ pickup fee). No rounding until display.

export const STANDARD_GRADES = ['0W-20', '5W-20', '5W-30'];

export const DEFAULT_PRICES = {
  labour: 30,
  filter: 10,
  oil_jug_price: 50,
  oil_jug_litres: 4.75,
  own_oil: 50,
  pickup_fee: 5,
};

/** $/L derived from the jug price, e.g. 50 / 4.75 = 10.526… (shown as $10.53). */
export function oilRate(prices) {
  const l = Number(prices.oil_jug_litres) || 0;
  return l > 0 ? Number(prices.oil_jug_price) / l : 0;
}

export function isStandardGrade(grade) {
  return STANDARD_GRADES.includes(String(grade || '').toUpperCase().replace(/\s/g, ''));
}

export function pickupNeeded(pickup) {
  return pickup && pickup !== 'dropoff';
}

/**
 * Decide whether a car gets an instant price, and build its breakdown.
 * @returns {{ mode: 'instant'|'quote', reason?: string, lines?: Array<{key:string, amount:number, litres?:number, rate?:number}>, total?: number }}
 */
export function priceCar({ car, ownOil, prices, pickup = 'dropoff' }) {
  if (!car) return { mode: 'quote', reason: 'unknown' };
  if (car.quote_only) return { mode: 'quote', reason: 'special' };
  const lines = [];
  if (ownOil) {
    lines.push({ key: 'ownOil', amount: Number(prices.own_oil) });
  } else {
    if (!isStandardGrade(car.oil_grade)) return { mode: 'quote', reason: 'grade' };
    const rate = oilRate(prices);
    const filter = car.filter_price != null && car.filter_price !== '' ? Number(car.filter_price) : Number(prices.filter);
    lines.push({ key: 'labour', amount: Number(prices.labour) });
    lines.push({ key: 'filter', amount: filter });
    lines.push({ key: 'oil', amount: Number(car.oil_litres) * rate, litres: Number(car.oil_litres), rate, grade: car.oil_grade });
  }
  if (pickupNeeded(pickup)) lines.push({ key: 'pickup', amount: Number(prices.pickup_fee) });
  return { mode: 'instant', lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** Total for a manual quote Roy builds in admin. */
export function quoteTotal({ litres, rate, filter, ownOil }, prices) {
  if (ownOil) return Number(prices.own_oil);
  return Number(prices.labour) + Number(filter || 0) + Number(litres || 0) * Number(rate || 0);
}

export function withPickup(base, pickup, prices) {
  return Number(base) + (pickupNeeded(pickup) ? Number(prices.pickup_fee) : 0);
}

export function money(n, lang = 'en') {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return lang === 'fr'
    ? v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $'
    : '$' + v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
