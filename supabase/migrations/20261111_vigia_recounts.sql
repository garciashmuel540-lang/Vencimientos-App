begin;

create table if not exists public.vigia_recounts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 60),
  count_date date not null,
  updated_at timestamptz not null default now(),
  reviewed boolean not null default false,
  item_count integer not null default 0 check (item_count >= 0),
  measured_count integer not null default 0 check (measured_count between 0 and item_count),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists vigia_recounts_owner_recent on public.vigia_recounts (user_id, updated_at desc);
alter table public.vigia_recounts enable row level security;
revoke all on public.vigia_recounts from anon, public;
grant select, insert, update, delete on public.vigia_recounts to authenticated;
drop policy if exists vigia_recounts_owner on public.vigia_recounts;
create policy vigia_recounts_owner on public.vigia_recounts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
notify pgrst, 'reload schema';

commit;
