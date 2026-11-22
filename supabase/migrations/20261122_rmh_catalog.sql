-- One complete, atomically replaced catalog per store.
create table public.rmh_catalogs (
  store_id text primary key check (length(store_id) between 1 and 80),
  captured_at timestamptz not null,
  products jsonb not null check (jsonb_typeof(products) = 'array' and jsonb_array_length(products) > 0)
);
alter table public.rmh_catalogs enable row level security;
revoke all on public.rmh_catalogs from public, anon, authenticated;
grant select, insert, update on public.rmh_catalogs to authenticated;

create policy "Read assigned store" on public.rmh_catalogs for select to authenticated
using (store_id = (select auth.jwt())->'app_metadata'->>'rmh_store');
create policy "Publish assigned store" on public.rmh_catalogs for insert to authenticated
with check (store_id = (select auth.jwt())->'app_metadata'->>'rmh_store'
  and (select auth.jwt())->'app_metadata'->>'rmh_publisher' = 'true');
create policy "Refresh assigned store" on public.rmh_catalogs for update to authenticated
using (store_id = (select auth.jwt())->'app_metadata'->>'rmh_store'
  and (select auth.jwt())->'app_metadata'->>'rmh_publisher' = 'true')
with check (store_id = (select auth.jwt())->'app_metadata'->>'rmh_store'
  and (select auth.jwt())->'app_metadata'->>'rmh_publisher' = 'true');

create function public.rmh_check_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.captured_at < old.captured_at then
    raise exception 'El catálogo publicado es más reciente';
  end if;
  return new;
end;
$$;
create trigger rmh_version before update on public.rmh_catalogs
for each row execute function public.rmh_check_version();
