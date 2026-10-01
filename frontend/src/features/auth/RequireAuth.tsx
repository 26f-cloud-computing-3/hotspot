import { Navigate, Outlet } from "react-router";

import { useAuth } from "./AuthProvider";

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
