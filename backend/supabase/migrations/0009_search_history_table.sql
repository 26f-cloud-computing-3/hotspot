-- A user's recent place-search queries, shown under the search box on the place search screen.
-- The backend keeps at most 10 per user, dropping the least recently searched ones.

create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."user" (id) on delete cascade,
  query text not null check (query = btrim(query) and char_length(query) between 1 and 100),
  -- When the query was last searched; searching it again moves it to the top instead of
  -- adding a second row.
  searched_at timestamptz not null default now(),
  unique (user_id, query)
);

-- "My recent searches", newest first.
create index search_history_user_id_idx on public.search_history (user_id, searched_at desc);

-- The backend connects directly as a privileged role and enforces ownership itself;
-- these policies keep the table safe if it is ever reached through the Supabase API.
alter table public.search_history enable row level security;

create policy "search_history_select_own" on public.search_history
  for select to authenticated using (user_id = auth.uid());

create policy "search_history_insert_own" on public.search_history
  for insert to authenticated with check (user_id = auth.uid());

create policy "search_history_update_own" on public.search_history
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "search_history_delete_own" on public.search_history
  for delete to authenticated using (user_id = auth.uid());
