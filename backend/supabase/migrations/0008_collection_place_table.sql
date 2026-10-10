-- Places saved into a collection. There is no shared place table: each row carries its own
-- snapshot of the place as the map provider returned it when it was saved, because the
-- backend cannot verify place data sent by a client and a shared row would let one user's
-- input show up in other users' collections.

create table public.collection_place (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collection (id) on delete cascade,
  -- The provider's own identifier; unique only together with provider.
  provider text not null check (provider in ('kakao', 'naver', 'google')),
  provider_place_id text not null,
  name text not null,
  address text not null default '',
  road_address text,
  category text,
  phone text,
  url text,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  unique (collection_id, provider, provider_place_id)
);

create index collection_place_collection_id_idx
  on public.collection_place (collection_id, created_at desc);

-- The backend connects directly as a privileged role and enforces ownership itself;
-- these policies keep the table safe if it is ever reached through the Supabase API.
alter table public.collection_place enable row level security;

create policy "collection_place_select_own_or_public" on public.collection_place
  for select to authenticated using (
    exists (
      select 1 from public.collection c
      where c.id = collection_id and (c.owner_id = auth.uid() or c.is_public)
    )
  );

create policy "collection_place_insert_own" on public.collection_place
  for insert to authenticated with check (
    exists (
      select 1 from public.collection c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

create policy "collection_place_delete_own" on public.collection_place
  for delete to authenticated using (
    exists (
      select 1 from public.collection c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

-- Record places being added to and removed from collections in the collection history.

alter table public.collection_history
  -- Snapshot of the place's name; null for actions that are not about a place.
  add column place_name text;

alter table public.collection_history
  drop constraint collection_history_action_check;

alter table public.collection_history
  add constraint collection_history_action_check
  check (action in (
    'collection_created',
    'collection_renamed',
    'collection_published',
    'collection_unpublished',
    'collection_deleted',
    'place_added',
    'place_removed'
  ));
