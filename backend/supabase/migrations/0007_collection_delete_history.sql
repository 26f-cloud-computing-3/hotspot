-- Record collection deletions in the collection history. The row is written before the
-- collection is deleted, and the existing foreign key then sets its collection_id to null.

alter table public.collection_history
  drop constraint collection_history_action_check;

alter table public.collection_history
  add constraint collection_history_action_check
  check (action in (
    'collection_created',
    'collection_renamed',
    'collection_published',
    'collection_unpublished',
    'collection_deleted'
  ));
