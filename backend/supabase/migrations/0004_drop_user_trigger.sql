-- The backend now creates the public."user" row on a user's first authenticated request
-- (app/core/users.py), so the signup trigger is no longer needed. Dropping it keeps a
-- single place that decides names and handles.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
