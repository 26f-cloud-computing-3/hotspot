import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthCallback } from "./features/auth/AuthCallback";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { CollectionsPage } from "./features/collections/CollectionsPage";
import { FollowersPage } from "./features/follows/FollowersPage";
import { PlaceSearch } from "./features/map/PlaceSearch";
import { ComingSoon } from "./pages/ComingSoon";
import { HomePage } from "./pages/HomePage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route element={<HomePage />}>
              <Route path="/places" element={<PlaceSearch />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/feed" element={<ComingSoon page="feed" />} />
              <Route path="/followers" element={<FollowersPage />} />
              <Route path="*" element={<Navigate to="/places" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
