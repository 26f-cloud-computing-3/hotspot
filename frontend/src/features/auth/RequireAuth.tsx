import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "./AuthProvider";

export const RequireAuth = () => {
  const { session, loading } = useAuth();
  const { pathname, search } = useLocation();
  if (loading) return null;
  // The login screen sends the user back here once they have signed in (a shared link, say).
  if (!session) {
    return <Navigate to="/login" replace state={{ from: pathname + search }} />;
  }
  return <Outlet />;
};
