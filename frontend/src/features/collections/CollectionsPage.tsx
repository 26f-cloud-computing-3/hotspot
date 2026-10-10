import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { type Collection, listMyCollections } from "./api";
import { CollectionDialog } from "./CollectionDialog";
import "./CollectionsPage.css";

export function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Collection | null>(null);
  const newDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on retry
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    listMyCollections()
      .then((items) => {
        if (!cancelled) setCollections(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (editing) editDialog.current?.showModal();
  }, [editing]);

  const newCollectionButton = (
    <button
      type="button"
      className="button button-primary"
      onClick={() => newDialog.current?.showModal()}
    >
      <Icon name="plus" />새 컬렉션
    </button>
  );

  let content = null;
  if (failed) {
    content = (
      <section className="empty-panel" role="alert">
        <p>컬렉션을 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          다시 시도
        </button>
      </section>
    );
  } else if (collections === null) {
    content = (
      <p className="collections-status" role="status">
        불러오는 중…
      </p>
    );
  } else if (collections.length === 0) {
    content = (
      <section className="empty-panel">
        <Icon name="collection" />
        <h2>아직 컬렉션이 없어요</h2>
        <p>좋아하는 장소를 테마별로 모아 보세요.</p>
        {newCollectionButton}
      </section>
    );
  } else {
    content = (
      <>
        <div className="collections-toolbar">
          <p className="collections-status">컬렉션 {collections.length}개</p>
          {newCollectionButton}
        </div>
        <ul className="collection-grid">
          {collections.map((collection) => (
            <li key={collection.id} className="collection-card">
              <div className="collection-card-header">
                <span className="badge" data-public={collection.is_public}>
                  {collection.is_public ? "공개" : "비공개"}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${collection.name} 수정`}
                  onClick={() => setEditing(collection)}
                >
                  <Icon name="edit" />
                </button>
              </div>
              <h2>
                <Link to={`/collections/${collection.id}`}>
                  {collection.name}
                </Link>
              </h2>
              <p>장소 {collection.place_count}개</p>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      {content}
      <CollectionDialog
        dialogRef={newDialog}
        onSaved={(created) =>
          setCollections((items) => [created, ...(items ?? [])])
        }
      />
      {editing && (
        <CollectionDialog
          key={editing.id}
          dialogRef={editDialog}
          collection={editing}
          onSaved={(updated) =>
            setCollections((items) =>
              (items ?? []).map((item) =>
                item.id === updated.id ? updated : item,
              ),
            )
          }
          onDeleted={(id) =>
            setCollections((items) =>
              (items ?? []).filter((item) => item.id !== id),
            )
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
