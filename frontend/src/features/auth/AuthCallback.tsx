import { Navigate } from "react-router";

import { useAuth } from "./AuthProvider";

// supabase-js exchanges the ?code= param for a session on load; once the
// provider reports the result, send the user on their way.
export function AuthCallback() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={session ? "/" : "/login"} replace />;
}
