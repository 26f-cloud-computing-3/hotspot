-- One-way follow between users. Following is immediate (no approval step); it lets the
-- follower see the followee's public collections in their feed.

create table public.follow (
  follower_id uuid not null references public."user" (id) on delete cascade,
  followee_id uuid not null references public."user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Also serves "who do I follow" lookups (follower_id is the leading column).
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- "Who follows me", newest first.
create index follow_followee_id_idx on public.follow (followee_id, created_at desc);

-- The backend connects directly as a privileged role and enforces ownership itself;
-- these policies keep the table safe if it is ever reached through the Supabase API.
alter table public.follow enable row level security;

-- Only the two users involved can see a follow: nobody else can list a user's followers.
create policy "follow_select_involved" on public.follow
  for select to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());

create policy "follow_insert_own" on public.follow
  for insert to authenticated with check (follower_id = auth.uid());

create policy "follow_delete_own" on public.follow
  for delete to authenticated using (follower_id = auth.uid());
