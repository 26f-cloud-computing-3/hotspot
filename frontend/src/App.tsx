import { BrowserRouter, Route, Routes } from "react-router";

import { AuthCallback } from "./features/auth/AuthCallback";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { MapView } from "./features/map/MapView";

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

function Home() {
  const { signOut } = useAuth();
  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <MapView center={SEOUL_CITY_HALL} />
      <button
        type="button"
        onClick={() => signOut()}
        style={{ position: "absolute", top: 12, right: 12, zIndex: 1 }}
      >
        로그아웃
      </button>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Home />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
