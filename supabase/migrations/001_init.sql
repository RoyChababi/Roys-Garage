-- Roy's Garage: schema, row-level security and public RPCs.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run on an empty project.

create extension if not exists pgcrypto;

-- ───────────── Tables ─────────────
create table if not exists admin_users (
  email text primary key
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  roy_phone text not null default '4389222595',
  etransfer_email text not null default 'roychababi53@gmail.com',
  notification_email text not null default 'roychababi53@gmail.com',
  pickup_street text not null default 'rue Simonet',
  site_url text not null default 'https://roychababi.github.io/roys-garage/',
  max_per_day int not null default 3,
  slot_minutes int not null default 60,
  back_to_back boolean not null default true,
  window_days int not null default 7,
  lead_minutes int not null default 60,
  -- Monday-first. Thursday closed. Weekend default 9 am to 5 pm.
  default_week jsonb not null default '[
    {"open":true,"start":1020,"end":1320},{"open":true,"start":1020,"end":1320},
    {"open":true,"start":1020,"end":1320},{"open":false,"start":1020,"end":1320},
    {"open":true,"start":1020,"end":1320},{"open":true,"start":540,"end":1020},
    {"open":true,"start":540,"end":1020}]'::jsonb
);

create table if not exists prices (
  id int primary key default 1 check (id = 1),
  labour numeric not null default 30,
  filter numeric not null default 10,
  oil_jug_price numeric not null default 50,
  oil_jug_litres numeric not null default 4.75,
  own_oil numeric not null default 50,
  pickup_fee numeric not null default 5
);

create table if not exists schedule_weeks (
  week_start date not null,           -- Monday
  dow int not null check (dow between 0 and 6), -- 0 = Monday
  open boolean not null,
  start_min int not null,
  end_min int not null,
  primary key (week_start, dow)
);

create table if not exists car_table (
  id uuid primary key default gen_random_uuid(),
  year text not null,
  make text not null,
  model text not null,
  trim text not null,
  fe_id text,
  oil_litres numeric not null,
  oil_grade text not null,
  filter_price numeric,
  quote_only boolean not null default false,
  notes text default '',
  created_at timestamptz default now()
);
create unique index if not exists car_table_key on car_table (lower(year), lower(make), lower(model), lower(trim));

create table if not exists vehicle_menu_cache (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(), -- also the secret in the booking link
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','sent','booked','archived')),
  reason text,
  name text not null, phone text not null, address text not null,
  notes text default '', lang text default 'en',
  year text default '', make text default '', model text default '', trim text default '', fe_id text default '',
  car_text text default '',
  own_oil boolean not null default false,
  litres numeric, oil_grade text, rate numeric, filter numeric, price numeric,
  notified_at timestamptz
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  start_min int not null,
  status text not null default 'booked' check (status in ('booked','confirmed','done','cancelled')),
  name text not null, phone text not null, address text not null,
  lang text default 'en', notes text default '',
  year text default '', make text default '', model text default '', trim text default '', car_text text default '',
  own_oil boolean not null default false,
  pickup text not null default 'dropoff' check (pickup in ('dropoff','pickup','return','both')),
  price numeric not null, base_price numeric,
  quote_id uuid references quote_requests(id) on delete set null,
  notified_at timestamptz
);
create index if not exists bookings_date on bookings (date);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text, address text, lang text default 'en',
  cars text[] not null default '{}',
  last_service date,
  reminded_at date,
  visits int not null default 0
);

insert into settings (id) values (1) on conflict do nothing;
insert into prices (id) values (1) on conflict do nothing;

-- ───────────── Helpers ─────────────
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function local_today() returns date language sql stable as $$
  select (now() at time zone 'America/Toronto')::date;
$$;

create or replace function day_hours(p_date date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('open', open, 'start', start_min, 'end', end_min)
       from schedule_weeks
      where week_start = p_date - (extract(isodow from p_date)::int - 1)
        and dow = extract(isodow from p_date)::int - 1),
    (select default_week -> (extract(isodow from p_date)::int - 1) from settings where id = 1));
$$;

-- Bookable start minutes for a day: open hours, max cars, back-to-back, lead time, window.
create or replace function slots_for_day(p_date date) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare
  s settings%rowtype;
  h jsonb;
  booked int[];
  cands int[] := '{}';
  out int[] := '{}';
  len int; t int; b int; ok boolean; not_before int := -1;
  blk_start int; blk_end int;
begin
  select * into s from settings where id = 1;
  len := s.slot_minutes;
  if p_date < local_today() or p_date > local_today() + (s.window_days - 1) then return out; end if;
  h := day_hours(p_date);
  if h is null or not (h ->> 'open')::boolean then return out; end if;
  select coalesce(array_agg(start_min order by start_min), '{}') into booked
    from bookings where date = p_date and status <> 'cancelled';
  if coalesce(array_length(booked, 1), 0) >= s.max_per_day then return out; end if;
  if p_date = local_today() then
    not_before := extract(hour from now() at time zone 'America/Toronto')::int * 60
                + extract(minute from now() at time zone 'America/Toronto')::int + s.lead_minutes;
  end if;

  if coalesce(array_length(booked, 1), 0) = 0 or not s.back_to_back then
    t := (h ->> 'start')::int;
    while t + len <= (h ->> 'end')::int loop cands := cands || t; t := t + len; end loop;
    foreach b in array booked loop cands := cands || (b - len) || (b + len); end loop;
  else
    -- contiguous blocks: offer the slot right before and right after each block
    blk_start := null;
    foreach b in array booked loop
      if blk_start is null then blk_start := b; blk_end := b + len;
      elsif b <= blk_end then blk_end := greatest(blk_end, b + len);
      else cands := cands || (blk_start - len) || blk_end; blk_start := b; blk_end := b + len;
      end if;
    end loop;
    cands := cands || (blk_start - len) || blk_end;
  end if;

  foreach t in array cands loop
    ok := t >= (h ->> 'start')::int and t + len <= (h ->> 'end')::int and t >= not_before and not (t = any(out));
    if ok then
      foreach b in array booked loop
        if t < b + len and b < t + len then ok := false; end if;
      end loop;
    end if;
    if ok then out := out || t; end if;
  end loop;
  return (select coalesce(array_agg(x order by x), '{}') from unnest(out) x);
end $$;

-- ───────────── Public RPCs ─────────────
create or replace function public_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'notification_email' - 'id' from settings s where id = 1),
    'prices', (select to_jsonb(p) - 'id' from prices p where id = 1),
    'weeks', coalesce((
      select jsonb_object_agg(ws, days) from (
        select week_start::text ws,
               jsonb_agg(jsonb_build_object('open', open, 'start', start_min, 'end', end_min) order by dow) days
          from schedule_weeks
         where week_start >= local_today() - 7
         group by week_start having count(*) = 7) w), '{}'::jsonb));
$$;

create or replace function get_busy(p_from date, p_to date) returns table (date date, start_min int)
language sql stable security definer set search_path = public as $$
  select date, start_min from bookings
   where date between p_from and p_to and status <> 'cancelled';
$$;

create or replace function find_car(p_year text, p_make text, p_model text, p_trim text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'notes' - 'created_at' from car_table c
   where lower(year) = lower(p_year) and lower(make) = lower(p_make)
     and lower(model) = lower(p_model) and lower(trim) = lower(p_trim)
   limit 1;
$$;

create or replace function create_quote_request(q jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare new_id uuid;
begin
  if coalesce(trim(q ->> 'name'), '') = '' or length(regexp_replace(q ->> 'phone', '\D', '', 'g')) < 10
     or coalesce(trim(q ->> 'address'), '') = '' then
    raise exception 'missing_fields';
  end if;
  insert into quote_requests (reason, name, phone, address, notes, lang, year, make, model, trim, fe_id, car_text, own_oil, oil_grade)
  values (q ->> 'reason', left(q ->> 'name', 120), left(q ->> 'phone', 30), left(q ->> 'address', 200),
          left(coalesce(q ->> 'notes', ''), 1000), coalesce(q ->> 'lang', 'en'),
          coalesce(q ->> 'year', ''), coalesce(q ->> 'make', ''), coalesce(q ->> 'model', ''), coalesce(q ->> 'trim', ''),
          coalesce(q ->> 'fe_id', ''), left(coalesce(q ->> 'car_text', ''), 200),
          coalesce((q ->> 'own_oil')::boolean, false), q ->> 'oil_grade')
  returning id into new_id;
  return new_id;
end $$;

create or replace function get_quote_for_booking(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'year', year, 'make', make, 'model', model, 'trim', trim,
         'car_text', car_text, 'own_oil', own_oil, 'price', price,
         'name', name, 'phone', phone, 'address', address, 'lang', lang)
    from quote_requests where id = p_id and price is not null and status in ('sent', 'new');
$$;

create or replace function create_booking(b jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s settings%rowtype; p prices%rowtype; c car_table%rowtype; q quote_requests%rowtype;
  v_date date := (b ->> 'date')::date;
  v_start int := (b ->> 'start_min')::int;
  v_pickup text := coalesce(b ->> 'pickup', 'dropoff');
  v_own boolean := coalesce((b ->> 'own_oil')::boolean, false);
  street_key text; base numeric; total numeric; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('booking:' || v_date::text));
  select * into s from settings where id = 1;
  select * into p from prices where id = 1;

  if coalesce(trim(b ->> 'name'), '') = '' or coalesce(trim(b ->> 'address'), '') = ''
     or length(regexp_replace(b ->> 'phone', '\D', '', 'g')) < 10 then
    raise exception 'missing_fields';
  end if;

  if v_pickup <> 'dropoff' then
    street_key := regexp_replace(lower(s.pickup_street), '^(rue|street|st|avenue|ave|av)\.?\s+', '');
    if position(street_key in lower(b ->> 'address')) = 0 then raise exception 'pickup_street'; end if;
  end if;

  if not (v_start = any(slots_for_day(v_date))) then raise exception 'slot_taken'; end if;

  if b ? 'quote_id' and nullif(b ->> 'quote_id', '') is not null then
    select * into q from quote_requests where id = (b ->> 'quote_id')::uuid;
    if q.id is null or q.price is null then raise exception 'quote_not_priced'; end if;
    base := q.price;
  else
    select * into c from car_table
     where lower(year) = lower(b ->> 'year') and lower(make) = lower(b ->> 'make')
       and lower(model) = lower(b ->> 'model') and lower(trim) = lower(b ->> 'trim');
    if c.id is null or c.quote_only then raise exception 'needs_quote'; end if;
    if v_own then
      base := p.own_oil;
    else
      if upper(replace(c.oil_grade, ' ', '')) not in ('0W-20', '5W-20', '5W-30') then raise exception 'needs_quote'; end if;
      base := p.labour + coalesce(c.filter_price, p.filter) + c.oil_litres * p.oil_jug_price / p.oil_jug_litres;
    end if;
  end if;
  total := base + case when v_pickup <> 'dropoff' then p.pickup_fee else 0 end;

  insert into bookings (date, start_min, name, phone, address, lang, notes, year, make, model, trim, car_text,
                        own_oil, pickup, price, base_price, quote_id)
  values (v_date, v_start, left(b ->> 'name', 120), regexp_replace(b ->> 'phone', '\D', '', 'g'), left(b ->> 'address', 200),
          coalesce(b ->> 'lang', 'en'), left(coalesce(b ->> 'notes', ''), 1000),
          coalesce(b ->> 'year', q.year, ''), coalesce(b ->> 'make', q.make, ''), coalesce(b ->> 'model', q.model, ''),
          coalesce(b ->> 'trim', q.trim, ''), coalesce(nullif(b ->> 'car_text', ''), q.car_text, ''),
          v_own, v_pickup, round(total, 2), base, q.id)
  returning id into new_id;
  if q.id is not null then update quote_requests set status = 'booked' where id = q.id; end if;
  return jsonb_build_object('id', new_id, 'price', round(total, 2));
end $$;

grant execute on function public_config, get_busy, find_car, create_quote_request, get_quote_for_booking, create_booking, is_admin
  to anon, authenticated;
revoke execute on function slots_for_day, day_hours from anon;

-- ───────────── Row-level security ─────────────
alter table admin_users enable row level security;
alter table settings enable row level security;
alter table prices enable row level security;
alter table schedule_weeks enable row level security;
alter table car_table enable row level security;
alter table vehicle_menu_cache enable row level security;
alter table quote_requests enable row level security;
alter table bookings enable row level security;
alter table customers enable row level security;

-- Public: car menus and the price list are readable. Everything else goes through the RPCs above.
create policy "public read menus" on vehicle_menu_cache for select using (true);
create policy "public read prices" on prices for select using (true);
create policy "public read schedule" on schedule_weeks for select using (true);

-- Roy (the one address in admin_users) can do everything.
create policy "admin all" on admin_users for all using (is_admin()) with check (is_admin());
create policy "admin all" on settings for all using (is_admin()) with check (is_admin());
create policy "admin all" on prices for all using (is_admin()) with check (is_admin());
create policy "admin all" on schedule_weeks for all using (is_admin()) with check (is_admin());
create policy "admin all" on car_table for all using (is_admin()) with check (is_admin());
create policy "admin all" on vehicle_menu_cache for all using (is_admin()) with check (is_admin());
create policy "admin all" on quote_requests for all using (is_admin()) with check (is_admin());
create policy "admin all" on bookings for all using (is_admin()) with check (is_admin());
create policy "admin all" on customers for all using (is_admin()) with check (is_admin());

-- Roy's login. Change if his admin address is different.
insert into admin_users (email) values ('roychababi53@gmail.com') on conflict do nothing;
