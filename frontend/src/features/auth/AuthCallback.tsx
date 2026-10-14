import { Navigate } from "react-router";

import { useAuth } from "./AuthProvider";
import { readReturnPath } from "./returnPath";

// supabase-js exchanges the ?code= param for a session on load; once the
// provider reports the result, send the user back to where they were headed.
export const AuthCallback = () => {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={session ? readReturnPath() : "/login"} replace />;
};
