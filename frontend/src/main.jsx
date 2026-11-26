import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import "./index.css";
import App from "./App.jsx";
import RequireAuth from "./routes/RequireAuth.jsx";

const LoginPage = lazy(() => import("./routes/LoginPage.jsx"));
const MyTicketsPage = lazy(() => import("./routes/MyTicketsPage.jsx"));
const MyReservationsPage = lazy(() => import("./routes/MyReservationsPage.jsx"));
const NotFoundPage = lazy(() => import("./routes/NotFoundPage.jsx"));
const PolicyPage = lazy(() => import("./routes/PolicyPage.jsx"));
const AdminLoginPage = lazy(() => import("./routes/AdminLoginPage.jsx"));
const AdminOnlyRoute = lazy(() => import("./routes/AdminOnlyRoute.jsx"));
const AdminDashboardPage = lazy(() => import("./routes/AdminDashboardPage.jsx"));

function AnimatedRoutes() {
  const location = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    if (!location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [location.pathname]);

  return (
    <div key={`${location.pathname}${location.search}`} className="route-transition">
      <Suspense fallback={<p className="p-8 text-center" role="status">Loading…</p>}>
        <Routes location={location}>
          <Route path="/" element={<App />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/my-tickets"
            element={
              <RequireAuth>
                <MyTicketsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/my-reservations"
            element={
              <RequireAuth>
                <MyReservationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminOnlyRoute>
                <AdminDashboardPage />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="/admin/workshops"
            element={
              <AdminOnlyRoute>
                <AdminDashboardPage />
              </AdminOnlyRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AnimatedRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
