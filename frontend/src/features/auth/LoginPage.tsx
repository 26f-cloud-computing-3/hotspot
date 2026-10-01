import { useState } from "react";
import { Navigate } from "react-router";

import { useAuth } from "./AuthProvider";
import "./LoginPage.css";

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  const handleClick = () => {
    setError(null);
    signInWithGoogle().catch(() =>
      setError("로그인에 실패했어요. 잠시 후 다시 시도해 주세요."),
    );
  };

  return (
    <main className="login">
      <div className="login__card">
        <h1 className="login__title">Hotspot</h1>
        <p className="login__subtitle">
          좋아하는 장소를 모아 친구들과 나눠보세요
        </p>
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
}
