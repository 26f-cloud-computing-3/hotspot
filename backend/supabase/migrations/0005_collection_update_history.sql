-- Record collection edits in the collection history: renames, and visibility changes so the
-- feed can show when a collection was made public (and stop treating it as visible once it
-- is made private).

alter table public.collection_history
  drop constraint collection_history_action_check;

alter table public.collection_history
  add constraint collection_history_action_check
  check (action in (
    'collection_created',
    'collection_renamed',
    'collection_published',
    'collection_unpublished'
  ));
