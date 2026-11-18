// Cascading car menus from FuelEconomy.gov (US-market vehicles from 1984).
// Lookup order: memory → browser cache → prebuilt JSON → backend cache (Supabase) → live API.
// Every live answer is written back to the caches so dropdowns stay instant and survive outages.
import { backend } from '../backend/index.js';

const FE = 'https://www.fueleconomy.gov/ws/rest/vehicle';
const LS_PREFIX = 'rg_menu:';
const mem = new Map();
let prebuilt; // undefined = not loaded yet, null = none available

async function loadPrebuilt() {
  if (prebuilt !== undefined) return prebuilt;
  try {
    const r = await fetch('./vehicle-menus.json', { cache: 'force-cache' });
    prebuilt = r.ok ? await r.json() : null;
  } catch {
    prebuilt = null;
  }
  return prebuilt;
}

const asList = (j) => {
  const items = j?.menuItem;
  if (!items) return [];
  return (Array.isArray(items) ? items : [items]).map((i) => ({ text: i.text, value: i.value }));
};

async function feGet(path) {
  const r = await fetch(`${FE}/${path}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`FuelEconomy ${r.status}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/** Classify one engine option: diesel, electric and hydrogen are not offered. */
export function classify(detail, text = '') {
  const fuel = `${detail?.fuelType1 || ''} ${detail?.fuelType || ''}`.toLowerCase();
  const atv = String(detail?.atvType || '').toLowerCase();
  if (/diesel/i.test(text) || fuel.includes('diesel') || atv === 'diesel') return 'diesel';
  if (atv === 'ev' || atv === 'fcv' || fuel.includes('electricity') || fuel.includes('hydrogen')) return 'electric';
  return null;
}

async function live(key) {
  const [kind, year, make, model] = key.split('|');
  const q = (o) => new URLSearchParams(o).toString();
  if (kind === 'year') return asList(await feGet('menu/year')).filter((y) => Number(y.value) >= 1984);
  if (kind === 'make') return asList(await feGet(`menu/make?${q({ year })}`));
  if (kind === 'model') return asList(await feGet(`menu/model?${q({ year, make })}`));
  if (kind === 'options') {
    const opts = asList(await feGet(`menu/options?${q({ year, make, model })}`));
    const details = await Promise.all(opts.map((o) => feGet(o.value).catch(() => null)));
    return opts.map((o, i) => ({ ...o, blocked: classify(details[i], o.text) }));
  }
  throw new Error('bad menu key');
}

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    // Year/make lists can grow when a new model year lands; refresh those weekly.
    if ((key.startsWith('year') || key.startsWith('make')) && Date.now() - at > 7 * 864e5) return null;
    return data;
  } catch {
    return null;
  }
}
function lsSet(key, data) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

export async function getMenu(kind, year = '', make = '', model = '') {
  const key = [kind, year, make, model].join('|');
  if (mem.has(key)) return mem.get(key);
  const p = (async () => {
    const local = lsGet(key);
    if (local) return local;
    const pre = (await loadPrebuilt())?.[key];
    if (pre) return pre;
    let data = await backend.getMenuCache(key).catch(() => null);
    if (!data) {
      data = await backend.fetchMenu?.(key).catch(() => null);
      if (!data) {
        data = await live(key);
        backend.setMenuCache?.(key, data).catch(() => {});
      }
    }
    lsSet(key, data);
    return data;
  })();
  mem.set(key, p);
  p.catch(() => mem.delete(key));
  return p;
}

export const _live = live; // used by the prebuild script and the edge function design
