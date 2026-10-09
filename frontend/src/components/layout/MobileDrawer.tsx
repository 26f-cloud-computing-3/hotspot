import type { ReactNode, RefObject } from "react";
import { Icon } from "../Icon";

interface MobileDrawerProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  children: ReactNode;
}

export function MobileDrawer({
  dialogRef,
  onClose,
  children,
}: MobileDrawerProps) {
  return (
    <dialog
      ref={dialogRef}
      id="mobile-navigation"
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dialogRef.current?.close();
      }}
    >
      <div className="drawer-body">
        <div className="drawer-header">
          <span className="brand" id="drawer-title">
            Hotspot
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="내비게이션 닫기"
            onClick={() => dialogRef.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
