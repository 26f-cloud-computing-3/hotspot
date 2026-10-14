import { useState } from "react";
import { Navigate, useLocation } from "react-router";

import { appUrl, copyText } from "../../lib/share";
import { useAuth } from "./AuthProvider";
import { safeReturnPath, saveReturnPath } from "./returnPath";
import "./LoginPage.css";

// Google refuses to sign in inside apps' built-in browsers (403 disallowed_useragent),
// so a link opened from KakaoTalk and the like has to move to a real browser first.
const IN_APP_BROWSER = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|\bLine\//i;

export const LoginPage = () => {
  const { session, loading, signInWithGoogle } = useAuth();
  // Set by RequireAuth when a signed-out visitor opened a page, such as a shared collection.
  const from = safeReturnPath(useLocation().state?.from);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const inAppBrowser = IN_APP_BROWSER.test(navigator.userAgent);

  if (loading) return null;
  if (session) return <Navigate to={from} replace />;

  const handleClick = () => {
    setError(null);
    saveReturnPath(from);
    signInWithGoogle().catch(() =>
      setError("로그인에 실패했어요. 잠시 후 다시 시도해 주세요."),
    );
  };

  const copyLink = async () => {
    const copied = await copyText(appUrl(from));
    setCopyStatus(
      copied
        ? "링크를 복사했어요. Chrome이나 Safari에 붙여 넣어 열어 주세요."
        : "복사하지 못했어요. 주소창의 링크를 길게 눌러 복사해 주세요.",
    );
  };

  return (
    <main className="login">
      <div className="login__card">
        <h1 className="login__title">Hotspot</h1>
        <p className="login__subtitle">
          좋아하는 장소를 모아 친구들과 나눠보세요
        </p>
        {inAppBrowser && (
          <section className="login__in-app" aria-label="다른 브라우저로 열기">
            <p>
              카카오톡 같은 앱 안의 브라우저에서는 Google 로그인이 막혀 있어요.
              링크를 복사해 Chrome이나 Safari에서 열어 주세요.
            </p>
            <button type="button" className="login__copy" onClick={copyLink}>
              링크 복사
            </button>
            {copyStatus && (
              <p role="status" className="login__copy-status">
                {copyStatus}
              </p>
            )}
          </section>
        )}
        <button type="button" className="login__button" onClick={handleClick}>
          Google로 계속하기
        </button>
        {error && (
          <p role="alert" className="login__error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
};
