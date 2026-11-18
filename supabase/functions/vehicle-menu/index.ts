// Proxies FuelEconomy.gov car menus and caches each answer in vehicle_menu_cache.
// Deploy: supabase functions deploy vehicle-menu --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const FE = 'https://www.fueleconomy.gov/ws/rest/vehicle';

async function feGet(path: string) {
  const r = await fetch(`${FE}/${path}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`FuelEconomy ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const asList = (j: any) => {
  const i = j?.menuItem;
  return i ? (Array.isArray(i) ? i : [i]).map((x: any) => ({ text: x.text, value: x.value })) : [];
};
function classify(d: any, text: string) {
  const fuel = `${d?.fuelType1 ?? ''} ${d?.fuelType ?? ''}`.toLowerCase();
  const atv = String(d?.atvType ?? '').toLowerCase();
  if (/diesel/i.test(text) || fuel.includes('diesel') || atv === 'diesel') return 'diesel';
  if (atv === 'ev' || atv === 'fcv' || fuel.includes('electricity') || fuel.includes('hydrogen')) return 'electric';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { key } = await req.json();
    const [kind, year, make, model] = String(key).split('|');
    if (!['year', 'make', 'model', 'options'].includes(kind) || String(key).length > 200) return json({ error: 'bad key' }, 400);
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
    let data;
    if (kind === 'year') data = asList(await feGet('menu/year')).filter((y: any) => Number(y.value) >= 1984);
    else if (kind === 'make') data = asList(await feGet(`menu/make?${q({ year })}`));
    else if (kind === 'model') data = asList(await feGet(`menu/model?${q({ year, make })}`));
    else {
      const opts = asList(await feGet(`menu/options?${q({ year, make, model })}`));
      const details = await Promise.all(opts.map((o: any) => feGet(o.value).catch(() => null)));
      data = opts.map((o: any, i: number) => ({ ...o, blocked: classify(details[i], o.text) }));
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (data.length) await sb.from('vehicle_menu_cache').upsert({ key, data, updated_at: new Date().toISOString() });
    return json({ data });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
