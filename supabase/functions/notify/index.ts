// Emails Roy when a quote request or booking comes in.
// Deploy: supabase functions deploy notify --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=... NOTIFY_FROM="Roy's Garage <onboarding@resend.dev>"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const PICKUP: Record<string, string> = { dropoff: 'Drop-off', pickup: 'Roy picks up', return: 'Roy brings back', both: 'Both ways' };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { kind, id } = await req.json();
    const table = kind === 'booking' ? 'bookings' : 'quote_requests';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: row } = await sb.from(table).select('*').eq('id', id).maybeSingle();
    // Only fresh, un-notified rows, so this endpoint can't be used to spam Roy.
    if (!row || row.notified_at || Date.now() - new Date(row.created_at).getTime() > 10 * 60_000) return json({ skipped: true });
    const { data: s } = await sb.from('settings').select('notification_email, site_url').eq('id', 1).single();

    const car = row.car_text || [row.year, row.make, row.model].filter(Boolean).join(' ') + (row.trim ? ` (${row.trim})` : '');
    const fields: [string, unknown][] =
      kind === 'booking'
        ? [['When', `${row.date} at ${hhmm(row.start_min)}`], ['Name', row.name], ['Phone', row.phone], ['Address', row.address],
           ['Car', car], ['Own oil', row.own_oil ? 'Yes' : 'No'], ['Pickup', PICKUP[row.pickup]],
           ['Price', `$${Number(row.price).toFixed(2)}`], ['Language', row.lang], ['Notes', row.notes]]
        : [['Name', row.name], ['Phone', row.phone], ['Address', row.address], ['Car', car],
           ['Own oil', row.own_oil ? 'Yes' : 'No'], ['Why a quote', row.reason], ['Language', row.lang], ['Notes', row.notes]];
    const subject = kind === 'booking'
      ? `New booking: ${row.name}, ${row.date} ${hhmm(row.start_min)}`
      : `New quote request: ${row.name}, ${car}`;
    const html = `<h2 style="font-family:sans-serif">${esc(subject)}</h2><table style="font-family:sans-serif;font-size:15px">${fields
      .map(([k, v]) => `<tr><td style="color:#666;padding:4px 12px 4px 0">${k}</td><td>${esc(v)}</td></tr>`)
      .join('')}</table><p><a href="${esc(s?.site_url)}#/admin">Open admin</a></p>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('NOTIFY_FROM') ?? "Roy's Garage <onboarding@resend.dev>",
        to: [s!.notification_email],
        subject,
        html,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    await sb.from(table).update({ notified_at: new Date().toISOString() }).eq('id', id);
    return json({ sent: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
