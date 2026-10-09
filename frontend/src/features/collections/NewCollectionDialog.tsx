import { type RefObject, type SubmitEvent, useState } from "react";
import {
  COLLECTION_NAME_MAX_LENGTH,
  type Collection,
  createCollection,
} from "./api";

interface NewCollectionDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onCreated: (collection: Collection) => void;
}

export function NewCollectionDialog({
  dialogRef,
  onCreated,
}: NewCollectionDialogProps) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setName("");
    setIsPublic(false);
    setError("");
  }
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onCreated(
        await createCollection({ name: name.trim(), is_public: isPublic }),
      );
      dialogRef.current?.close();
    } catch {
      setError("컬렉션을 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="collection-dialog"
      aria-labelledby="new-collection-title"
      onClose={reset}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dialogRef.current?.close();
      }}
    >
      <form className="collection-form" onSubmit={handleSubmit}>
        <h2 id="new-collection-title">새 컬렉션</h2>
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
            공개 컬렉션으로 만들기
            <small>공개하면 팔로워의 피드에 노출됩니다.</small>
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
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
            disabled={saving || !name.trim()}
          >
            {saving ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
