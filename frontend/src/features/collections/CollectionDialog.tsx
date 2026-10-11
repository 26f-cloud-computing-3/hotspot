import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type RefObject, type SubmitEvent, useId, useState } from "react";
import { queryKeys } from "../../lib/query";
import {
  COLLECTION_NAME_MAX_LENGTH,
  type Collection,
  type CollectionFields,
  createCollection,
  deleteCollection,
  invalidateCollections,
  updateCollection,
} from "./api";

const LABELS = {
  create: {
    title: "새 컬렉션",
    visibility: "공개 컬렉션으로 만들기",
    submit: "만들기",
    saving: "만드는 중…",
    error: "컬렉션을 만들지 못했습니다. 다시 시도해 주세요.",
  },
  edit: {
    title: "컬렉션 수정",
    visibility: "공개 컬렉션",
    submit: "저장",
    saving: "저장 중…",
    error: "컬렉션을 저장하지 못했습니다. 다시 시도해 주세요.",
  },
};

interface CollectionDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** The collection to edit, which can also be deleted; omit it to create a new one. */
  collection?: Collection;
  /** Called once the lists on screen include the saved collection. */
  onSaved?: (collection: Collection) => void;
  onClose?: () => void;
}

export const CollectionDialog = ({
  dialogRef,
  collection,
  onSaved,
  onClose,
}: CollectionDialogProps) => {
  const initialName = collection?.name ?? "";
  const initialIsPublic = collection?.is_public ?? false;
  const [name, setName] = useState(initialName);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleId = useId();

  const editing = collection !== undefined;
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (fields: CollectionFields) =>
      editing
        ? updateCollection(collection.id, fields)
        : createCollection(fields),
    onSuccess: () => invalidateCollections(queryClient),
  });
  const remove = useMutation({
    mutationFn: deleteCollection,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.collections.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.collections.places(id) });
      return invalidateCollections(queryClient);
    },
  });
  const saving = save.isPending || remove.isPending;
  const labels = editing ? LABELS.edit : LABELS.create;
  const unchanged = name.trim() === initialName && isPublic === initialIsPublic;

  const reset = () => {
    setName(initialName);
    setIsPublic(initialIsPublic);
    setError("");
    setConfirmingDelete(false);
  };
  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      const saved = await save.mutateAsync({
        name: name.trim(),
        is_public: isPublic,
      });
      onSaved?.(saved);
      dialogRef.current?.close();
    } catch {
      setError(labels.error);
    }
  };
  const handleDelete = async () => {
    if (!collection) return;
    setError("");
    try {
      await remove.mutateAsync(collection.id);
      dialogRef.current?.close();
    } catch {
      setError("컬렉션을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  };
  const errorMessage = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
  return (
    <dialog
      ref={dialogRef}
      className="collection-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        reset();
        onClose?.();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dialogRef.current?.close();
      }}
    >
      {confirmingDelete && collection ? (
        <div className="collection-form">
          <h2 id={titleId}>컬렉션 삭제</h2>
          <p className="dialog-message">
            ‘{collection.name}’ 컬렉션을 삭제할까요? 삭제하면 되돌릴 수
            없습니다.
          </p>
          {errorMessage}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setConfirmingDelete(false);
                setError("");
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={saving}
              onClick={handleDelete}
            >
              {saving ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </div>
      ) : (
        <form className="collection-form" onSubmit={handleSubmit}>
          <h2 id={titleId}>{labels.title}</h2>
          <label className="field">
            <span>이름</span>
            <input
              className="text-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 서울 카페"
              maxLength={COLLECTION_NAME_MAX_LENGTH}
              required
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            <span>
              {labels.visibility}
              <small>공개하면 팔로워의 피드에 노출됩니다.</small>
            </span>
          </label>
          {errorMessage}
          <div className="form-actions">
            {editing && (
              <button
                type="button"
                className="button button-danger-text"
                disabled={saving}
                onClick={() => {
                  setConfirmingDelete(true);
                  setError("");
                }}
              >
                삭제
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => dialogRef.current?.close()}
            >
              취소
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving || !name.trim() || (editing && unchanged)}
            >
              {saving ? labels.saving : labels.submit}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
};
