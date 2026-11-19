-- Newer Supabase projects don't grant table privileges to the API roles automatically.
-- Row-level security (001_init.sql) still decides which rows each role can touch:
-- signed-in users only get data when is_admin() is true; visitors only read public tables.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  admin_users, settings, prices, schedule_weeks, car_table,
  vehicle_menu_cache, quote_requests, bookings, customers
to authenticated;

grant select on prices, schedule_weeks, vehicle_menu_cache to anon;
