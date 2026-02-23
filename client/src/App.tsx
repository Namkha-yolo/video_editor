import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import UploadPage from "@/pages/UploadPage";
import MoodPage from "@/pages/MoodPage";
import ProcessingPage from "@/pages/ProcessingPage";
import ExportPage from "@/pages/ExportPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/mood" element={<MoodPage />} />
        <Route path="/processing/:jobId" element={<ProcessingPage />} />
        <Route path="/export/:jobId" element={<ExportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
