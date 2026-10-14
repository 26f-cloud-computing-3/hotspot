import { useEffect, useState } from "react";

import { appUrl, copyText } from "../lib/share";
import { Icon } from "./Icon";
import "./ShareLinkButton.css";

interface ShareLinkButtonProps {
  /** In-app path of the page to share, such as `/collections/:id`. */
  path: string;
  /** Title shown in the system share sheet. */
  title: string;
  /** Set while friends could not open the link (a private collection); shown instead of sharing. */
  blockedReason?: string;
}

// Phones get the system share sheet (KakaoTalk, messages, ...); elsewhere the link is copied.
const canUseShareSheet = (): boolean => {
  return (
    typeof navigator.share === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
};

export const ShareLinkButton = ({
  path,
  title,
  blockedReason,
}: ShareLinkButtonProps) => {
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const share = async () => {
    if (blockedReason) {
      setStatus(blockedReason);
      return;
    }
    const url = appUrl(path);
    if (canUseShareSheet()) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the sheet is not a failure; anything else falls back to copying.
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    setStatus(
      (await copyText(url))
        ? "링크를 복사했어요."
        : "복사하지 못했어요. 주소창의 링크를 복사해 주세요.",
    );
  };

  return (
    <span className="share-link">
      <button type="button" className="button button-secondary" onClick={share}>
        <Icon name="share" />
        링크 공유
      </button>
      <span role="status" className="share-link-status">
        {status}
      </span>
    </span>
  );
};
