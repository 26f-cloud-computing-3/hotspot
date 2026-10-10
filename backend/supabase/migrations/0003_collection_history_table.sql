-- Append-only log of what users did to their collections. The follower feed is built from it.
-- Only 'collection_created' is recorded for now; extend the action check as features land.

create table public.collection_history (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public."user" (id) on delete cascade,
  -- Kept (as null) after the collection is deleted so the history row survives.
  collection_id uuid references public.collection (id) on delete set null,
  action text not null check (action in ('collection_created')),
  -- Snapshots taken when the action happened: the row stays readable after the collection
  -- is renamed or deleted, and is_public records whether followers could see it at that time.
  collection_name text not null,
  is_public boolean not null,
  created_at timestamptz not null default now()
);

create index collection_history_actor_id_idx
  on public.collection_history (actor_id, created_at desc);

-- Written only by the backend (privileged direct connection), so there are no write policies.
alter table public.collection_history enable row level security;

create policy "collection_history_select_own_or_public" on public.collection_history
  for select to authenticated using (actor_id = auth.uid() or is_public);
