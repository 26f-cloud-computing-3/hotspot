import { type RefObject, type SubmitEvent, useId, useState } from "react";
import { ApiError } from "../../lib/api";
import type { Me } from "../auth/AuthProvider";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  updateMe,
} from "./api";

const HANDLE_PATTERN = /^[a-z0-9_]+$/;

interface ProfileDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  me: Me;
  onSaved: (me: Me) => void;
}

/** Edits the signed-in user's name and handle. */
export const ProfileDialog = ({
  dialogRef,
  me,
  onSaved,
}: ProfileDialogProps) => {
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const hintId = useId();

  const nameChanged = name.trim() !== me.name;
  const handleChanged = handle !== me.handle;
  // A handle made at signup may break these rules; it only has to pass once it is changed.
  const handleValid =
    !handleChanged ||
    (HANDLE_PATTERN.test(handle) && handle.length >= HANDLE_MIN_LENGTH);

  const reset = () => {
    setName(me.name);
    setHandle(me.handle);
    setError("");
  };
  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved(
        await updateMe({
          name: nameChanged ? name.trim() : undefined,
          handle: handleChanged ? handle : undefined,
        }),
      );
      dialogRef.current?.close();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "이미 사용 중인 핸들입니다. 다른 핸들을 입력해 주세요."
          : "프로필을 저장하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialogRef}
      className="collection-dialog"
      aria-labelledby={titleId}
      onClose={reset}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dialogRef.current?.close();
      }}
    >
      <form className="collection-form" onSubmit={handleSubmit}>
        <h2 id={titleId}>프로필 수정</h2>
        <label className="field">
          <span>이름</span>
          <input
            className="text-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={USER_NAME_MAX_LENGTH}
            autoComplete="name"
            required
          />
        </label>
        <label className="field">
          <span>핸들</span>
          <input
            className="text-input"
            type="text"
            value={handle}
            onChange={(event) =>
              setHandle(
                event.target.value.trim().replace(/^@/, "").toLowerCase(),
              )
            }
            maxLength={HANDLE_MAX_LENGTH}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            aria-invalid={!handleValid}
            required
          />
          <small id={hintId} className="field-hint">
            영문 소문자 · 숫자 · 밑줄(_) {HANDLE_MIN_LENGTH}~{HANDLE_MAX_LENGTH}
            자. 다른 사람이 나를 검색할 때 쓰입니다.
          </small>
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
            disabled={
              saving ||
              !name.trim() ||
              !handleValid ||
              !(nameChanged || handleChanged)
            }
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </dialog>
  );
};
