-- App user row, created automatically on first Google sign-in (no signup step).
-- NOTE: "user" is a reserved word in Postgres; always quote it as public."user".

create table public."user" (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  handle text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public."user" enable row level security;

-- Profiles are visible to signed-in users (follower search, feed); only the owner can edit.
create policy "user_select_authenticated" on public."user"
  for select to authenticated using (true);

create policy "user_update_own" on public."user"
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, new.id::text), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if base = '' then
    base := 'user';
  end if;

  candidate := base;
  while exists (select 1 from public."user" where handle = candidate) loop
    candidate := base || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public."user" (id, name, handle, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', base),
    candidate,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
