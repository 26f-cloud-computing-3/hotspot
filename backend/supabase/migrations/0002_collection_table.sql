-- A user's themed list of places. Private by default; public ones show up for followers.

create table public.collection (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public."user" (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create index collection_owner_id_idx on public.collection (owner_id, created_at desc);

-- The backend connects directly as a privileged role and enforces ownership itself;
-- these policies keep the table safe if it is ever reached through the Supabase API.
alter table public.collection enable row level security;

create policy "collection_select_own_or_public" on public.collection
  for select to authenticated using (owner_id = auth.uid() or is_public);

create policy "collection_insert_own" on public.collection
  for insert to authenticated with check (owner_id = auth.uid());

create policy "collection_update_own" on public.collection
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "collection_delete_own" on public.collection
  for delete to authenticated using (owner_id = auth.uid());
