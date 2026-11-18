// Prebuilds year → make → model menus into public/vehicle-menus.json so the first dropdowns
// load instantly and keep working if FuelEconomy.gov is down. Trim/engine lists stay lazy
// (fetched once, then cached in Supabase and the browser).
//   npm run build:cars            # model years 2005 and newer
//   npm run build:cars -- 1995    # from 1995
import { writeFile } from 'node:fs/promises';

const FE = 'https://www.fueleconomy.gov/ws/rest/vehicle';
const fromYear = Number(process.argv[2] || 2005);
const asList = (j) => {
  const i = j?.menuItem;
  return i ? (Array.isArray(i) ? i : [i]).map((x) => ({ text: x.text, value: x.value })) : [];
};
async function get(path, tries = 3) {
  for (let n = 1; ; n++) {
    try {
      const r = await fetch(`${FE}/${path}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      const t = await r.text();
      return asList(t ? JSON.parse(t) : null);
    } catch (e) {
      if (n >= tries) throw e;
      await new Promise((r) => setTimeout(r, 500 * n));
    }
  }
}
async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

const out = {};
const years = (await get('menu/year')).filter((y) => Number(y.value) >= fromYear);
out['year|||'] = (await get('menu/year')).filter((y) => Number(y.value) >= 1984);
await pool(years, 4, async (y) => {
  const makes = await get(`menu/make?year=${y.value}`);
  out[`make|${y.value}||`] = makes;
  await pool(makes, 4, async (m) => {
    out[`model|${y.value}|${m.value}|`] = await get(`menu/model?${new URLSearchParams({ year: y.value, make: m.value })}`);
  });
  console.log(`${y.value}: ${makes.length} makes`);
});
await writeFile(new URL('../public/vehicle-menus.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} menus to public/vehicle-menus.json`);
