import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import type { Place } from "../map/types";
import {
  addPlaceToCollection,
  type Collection,
  listMyCollectionsForPlace,
  removePlaceFromCollection,
} from "./api";
import { CollectionDialog } from "./CollectionDialog";
import "./CollectionsPage.css";
import "./SavePlaceDialog.css";

interface SavePlaceDialogProps {
  place: Place;
  onClose: () => void;
}

/** Checklist of my collections; ticking one saves `place` into it, unticking removes it. */
export function SavePlaceDialog({ place, onClose }: SavePlaceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const newDialog = useRef<HTMLDialogElement>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on retry
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    listMyCollectionsForPlace(place)
      .then((items) => {
        if (!cancelled) setCollections(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [place, attempt]);

  async function setSaved(collection: Collection, saved: boolean) {
    setPendingIds((ids) => [...ids, collection.id]);
    setError("");
    try {
      if (saved) await addPlaceToCollection(collection.id, place);
      else await removePlaceFromCollection(collection.id, place);
      setCollections((items) =>
        (items ?? []).map((item) =>
          item.id === collection.id
            ? {
                ...item,
                contains_place: saved,
                place_count: item.place_count + (saved ? 1 : -1),
              }
            : item,
        ),
      );
    } catch {
      setError(
        saved
          ? `‘${collection.name}’에 담지 못했습니다. 다시 시도해 주세요.`
          : `‘${collection.name}’에서 제외하지 못했습니다. 다시 시도해 주세요.`,
      );
    } finally {
      setPendingIds((ids) => ids.filter((id) => id !== collection.id));
    }
  }

  let content = null;
  if (failed) {
    content = (
      <div className="save-place-status" role="alert">
        <p>컬렉션을 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          다시 시도
        </button>
      </div>
    );
  } else if (collections === null) {
    content = (
      <p className="save-place-status" role="status">
        불러오는 중…
      </p>
    );
  } else if (collections.length === 0) {
    content = (
      <p className="save-place-status">
        아직 컬렉션이 없어요. 새 컬렉션을 만들어 담아 보세요.
      </p>
    );
  } else {
    content = (
      <ul className="save-place-list">
        {collections.map((collection) => (
          <li key={collection.id}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={collection.contains_place === true}
                disabled={pendingIds.includes(collection.id)}
                onChange={(event) => setSaved(collection, event.target.checked)}
              />
              <span>
                {collection.name}
                <small>
                  {collection.is_public ? "공개" : "비공개"} · 장소{" "}
                  {collection.place_count}개
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="collection-dialog"
        aria-labelledby={titleId}
        onClose={onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialogRef.current?.close();
        }}
      >
        <div className="collection-form">
          <div className="save-place-heading">
            <h2 id={titleId}>컬렉션에 담기</h2>
            <p>{place.name}</p>
          </div>
          {content}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions save-place-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={collections === null}
              onClick={() => newDialog.current?.showModal()}
            >
              <Icon name="plus" />새 컬렉션
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => dialogRef.current?.close()}
            >
              완료
            </button>
          </div>
        </div>
      </dialog>
      {/* A sibling, not a child, so its Escape and backdrop clicks don't also close this dialog. */}
      <CollectionDialog
        dialogRef={newDialog}
        onSaved={(created) => {
          setCollections((items) => [
            { ...created, contains_place: false },
            ...(items ?? []),
          ]);
          // A collection made from here is meant for this place, so save it right away.
          void setSaved(created, true);
        }}
      />
    </>
  );
}
