// Booking rules: open days, slot length, max cars per day, back-to-back, booking window.
// Times are minutes from midnight; dates are local 'YYYY-MM-DD' strings.

export const DEFAULT_RULES = {
  max_per_day: 3,
  slot_minutes: 60,
  back_to_back: true,
  window_days: 7,
  lead_minutes: 60, // can't book a slot that starts within the next hour
};

// Monday-first template. Thursday closed. Weekend default 9 am to 5 pm (still open: confirm with Roy).
export const DEFAULT_WEEK = [
  { open: true, start: 17 * 60, end: 22 * 60 }, // Mon
  { open: true, start: 17 * 60, end: 22 * 60 }, // Tue
  { open: true, start: 17 * 60, end: 22 * 60 }, // Wed
  { open: false, start: 17 * 60, end: 22 * 60 }, // Thu
  { open: true, start: 17 * 60, end: 22 * 60 }, // Fri
  { open: true, start: 9 * 60, end: 17 * 60 }, // Sat
  { open: true, start: 9 * 60, end: 17 * 60 }, // Sun
];

export const pad = (n) => String(n).padStart(2, '0');
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
/** 0 = Monday … 6 = Sunday */
export const dowMon = (s) => (parseDate(s).getDay() + 6) % 7;
export const weekStart = (s) => addDays(s, -dowMon(s));
export const today = () => toISODate(new Date());
export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function minToHHMM(m) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function hhmmToMin(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}
export function formatTime(m, lang = 'en') {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (lang === 'fr') return `${h} h${mm ? ' ' + pad(mm) : ''}`;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${mm ? ':' + pad(mm) : ''} ${h < 12 ? 'am' : 'pm'}`;
}
export function formatDate(s, lang = 'en', opts = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', opts);
}

/** Hours for one date, from that week's saved schedule or the default template. */
export function dayHours(date, weeks, template = DEFAULT_WEEK) {
  const ws = weekStart(date);
  const saved = weeks?.[ws];
  return (saved || template)[dowMon(date)];
}

/** Merge bookings into contiguous blocks [{start, end}]. */
function blocks(starts, len) {
  const sorted = [...starts].sort((a, b) => a - b);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last.end) last.end = Math.max(last.end, s + len);
    else out.push({ start: s, end: s + len });
  }
  return out;
}

/**
 * Bookable start times for one day.
 * @param {object} p
 * @param {{open:boolean,start:number,end:number}} p.hours
 * @param {number[]} p.booked start minutes of active bookings that day
 * @param {object} p.rules
 * @param {number} [p.notBefore] earliest allowed start (for today)
 */
export function slotsForDay({ hours, booked = [], rules = DEFAULT_RULES, notBefore = -1 }) {
  if (!hours || !hours.open) return [];
  const len = Number(rules.slot_minutes) || 60;
  if (booked.length >= Number(rules.max_per_day)) return [];
  const fits = (t) =>
    t >= hours.start && t + len <= hours.end && t >= notBefore && !booked.some((b) => t < b + len && b < t + len);

  let candidates = [];
  if (booked.length === 0 || !rules.back_to_back) {
    for (let t = hours.start; t + len <= hours.end; t += len) candidates.push(t);
    // When not back-to-back, also allow times aligned to existing bookings.
    if (booked.length) for (const b of booked) candidates.push(b - len, b + len);
  } else {
    for (const bl of blocks(booked, len)) candidates.push(bl.start - len, bl.end);
  }
  return [...new Set(candidates)].filter(fits).sort((a, b) => a - b);
}

/**
 * Open days within the booking window, each with its slots.
 * @param {object} p
 * @param {Record<string, Array>} p.weeks saved schedule keyed by week-start date
 * @param {Array} p.template default week
 * @param {Array<{date:string,start_min:number}>} p.busy active bookings
 * @param {object} p.rules
 * @param {string} [p.from] first day (defaults to today)
 */
export function availableDays({ weeks, template, busy, rules = DEFAULT_RULES, from = today(), nowMin = nowMinutes() }) {
  const days = [];
  const isToday = from === today();
  for (let i = 0; i < Number(rules.window_days); i++) {
    const date = addDays(from, i);
    const hours = dayHours(date, weeks, template);
    const booked = busy.filter((b) => b.date === date).map((b) => b.start_min);
    const notBefore = i === 0 && isToday ? nowMin + Number(rules.lead_minutes || 0) : -1;
    const slots = slotsForDay({ hours, booked, rules, notBefore });
    days.push({ date, open: !!hours?.open, slots });
  }
  return days;
}

export function isSlotAvailable(args, date, start) {
  const d = availableDays(args).find((x) => x.date === date);
  return !!d && d.slots.includes(start);
}
