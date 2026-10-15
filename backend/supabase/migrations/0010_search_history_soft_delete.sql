-- Popular searches count every user's queries of the last day, so a query pushed out of a
-- user's 10 recent searches is hidden instead of deleted and keeps counting until it ages
-- out. Queries a user deletes themselves are still deleted for real.

-- When the query was pushed out of the user's recent searches; null while it is shown.
alter table public.search_history add column deleted_at timestamptz;

-- "Popular searches": every user's rows searched in the last day, and the cleanup of hidden
-- rows older than that.
create index search_history_searched_at_idx on public.search_history (searched_at desc);
