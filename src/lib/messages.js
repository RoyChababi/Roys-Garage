// Customer texts (sent from Roy's own phone through sms: links) and the .ics calendar file.
import { money } from './pricing.js';
import { formatDate, formatTime, minToHHMM } from './slots.js';

export const digits = (s) => String(s || '').replace(/\D/g, '');
export function normalizePhone(s) {
  const d = digits(s);
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}
export const phoneValid = (s) => normalizePhone(s).length === 10;
export function prettyPhone(s) {
  const d = normalizePhone(s);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : s;
}

/** `sms:` link that works on iOS and Android. */
export function smsLink(phone, body) {
  return `sms:+1${normalizePhone(phone)}?&body=${encodeURIComponent(body)}`;
}
export const telLink = (phone) => `tel:+1${normalizePhone(phone)}`;
export const mapLink = (address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Montréal, QC')}`;

/** True when an address is on the street allowed for pickup (default: rue Simonet). */
export function onAllowedStreet(address, street = 'rue Simonet') {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(rue|street|st|avenue|ave|av|boulevard|boul|blvd|croissant|crescent|place|pl)\b\.?/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const key = norm(street);
  return key.length > 0 && ` ${norm(address)} `.includes(` ${key} `);
}

export const carLabel = (c) =>
  c ? (c.car_text ? c.car_text : [c.year, c.make, c.model].filter(Boolean).join(' ') + (c.trim ? ` (${c.trim})` : '')) : '';
export const carShort = (c) => (c ? c.car_text || [c.year, c.make, c.model].filter(Boolean).join(' ') : '');

const PICKUP_TEXT = {
  en: { dropoff: 'drop-off', pickup: 'I pick it up', return: 'I bring it back', both: 'I pick it up and bring it back' },
  fr: { dropoff: 'dépôt', pickup: 'je passe la chercher', return: 'je la ramène', both: 'je passe la chercher et je la ramène' },
};

export function quoteText({ quote, link, lang }) {
  const car = carShort(quote);
  const price = money(quote.price, lang);
  const spec = quote.own_oil
    ? lang === 'fr' ? 'avec votre huile, filtre inclus' : 'with your oil, filter included'
    : `${quote.litres} L ${quote.oil_grade}`;
  return lang === 'fr'
    ? `Bonjour ${quote.name}, ici Roy du Garage Roy. Changement d'huile pour votre ${car} : ${price} (${spec}, filtre et main-d'œuvre). Réservez votre heure ici : ${link}`
    : `Hi ${quote.name}, it's Roy from Roy's Garage. Oil change for your ${car}: ${price} (${spec}, filter and labour). Book your time here: ${link}`;
}

export function confirmText({ booking, lang }) {
  const time = formatTime(booking.start_min, lang);
  const car = carShort(booking);
  const price = money(booking.price, lang);
  const pk = booking.pickup && booking.pickup !== 'dropoff' ? PICKUP_TEXT[lang][booking.pickup] : null;
  return lang === 'fr'
    ? `Bonjour ${booking.name}, ici Roy. Je confirme votre changement d'huile aujourd'hui à ${time} pour votre ${car}. Total ${price}, payable après par virement ou comptant.${pk ? ` Cueillette : ${pk}.` : ''} À tantôt!`
    : `Hi ${booking.name}, Roy here. Confirming your oil change today at ${time} for your ${car}. Total ${price}, pay after by e-transfer or cash.${pk ? ` Pickup: ${pk}.` : ''} See you soon!`;
}

export function reminderText({ customer, link, lang }) {
  const car = customer.cars?.[0] || (lang === 'fr' ? 'votre auto' : 'your car');
  return lang === 'fr'
    ? `Bonjour ${customer.name}, ici Roy du Garage Roy. Ça fait 6 mois depuis le dernier changement d'huile de votre ${car}. Réservez le prochain ici : ${link}`
    : `Hi ${customer.name}, Roy from Roy's Garage. It's been 6 months since your ${car}'s last oil change. Book the next one here: ${link}`;
}

export function siteUrl(settings) {
  if (settings?.site_url) return settings.site_url.replace(/\/$/, '') + '/';
  return window.location.origin + window.location.pathname;
}

/** Build and download an .ics file for a booking. */
export function icsFile({ booking, t, lang, settings }) {
  const [y, m, d] = booking.date.split('-');
  const dt = (min) => `${y}${m}${d}T${minToHHMM(min).replace(':', '')}00`;
  const len = Number(settings?.slot_minutes || 60);
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const desc = t('calDesc', { car: carLabel(booking), price: money(booking.price, lang), phone: prettyPhone(settings.roy_phone) });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Roy's Garage//Booking//EN",
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.id || Date.now()}@roys-garage`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=America/Toronto:${dt(booking.start_min)}`,
    `DTEND;TZID=America/Toronto:${dt(booking.start_min + len)}`,
    `SUMMARY:${esc(t('calTitle'))}`,
    `DESCRIPTION:${esc(desc)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(t('calTitle'))}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'roys-garage-oil-change.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const whenLabel = (b, lang) => `${formatDate(b.date, lang)}, ${formatTime(b.start_min, lang)}`;
