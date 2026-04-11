import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import UploadPage from "@/pages/UploadPage";
import MoodPage from "@/pages/MoodPage";
import ProcessingPage from "@/pages/ProcessingPage";
import ExportPage from "@/pages/ExportPage";
import { useAuthStore } from "./store/authStore";
import { useEffect } from "react";

// user: logined USER
// Private Route: need login
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuthStore();

  if (loading) return <div className="min-h-screen bg-gray-950" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Public Route: without login
function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuthStore();

  if (loading) return <div className="min-h-screen bg-gray-950" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void initAuth().then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      cleanup?.();
    };
  }, [initAuth]);
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/mood" element={<MoodPage />} />
        <Route path="/processing/:jobId" element={<ProcessingPage />} />
        {/* For Debugging */}
        <Route path="/processing" element={<ProcessingPage />} />
        <Route path="/export/:jobId" element={<ExportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
