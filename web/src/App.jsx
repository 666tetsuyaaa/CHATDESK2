import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import SuperAdminRoute from "./routes/SuperAdminRoute.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminResetPassword from "./pages/AdminResetPassword.jsx";
import AdminDashboardLayout from "./pages/AdminDashboardLayout.jsx";
import TicketManagement from "./pages/TicketManagement.jsx";
import FaqManagement from "./pages/FaqManagement.jsx";
import AdminSettings from "./pages/AdminSettings.jsx";
import AnalyticsOverview from "./pages/AnalyticsOverview.jsx";
import UserManagement from "./pages/UserManagement.jsx";
import InquiryLogs from "./pages/InquiryLogs.jsx";
import UnansweredQuestions from "./pages/UnansweredQuestions.jsx";
import AnnouncementManagement from "./pages/AnnouncementManagement.jsx";
import PhaseManagement from "./pages/PhaseManagement.jsx";
import OfficeManagement from "./pages/OfficeManagement.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/reset-password" element={<AdminResetPassword />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminDashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/tickets" replace />} />
        <Route
          path="users"
          element={
            <SuperAdminRoute>
              <UserManagement />
            </SuperAdminRoute>
          }
        />
        <Route path="tickets" element={<TicketManagement />} />
        <Route path="faqs" element={<FaqManagement />} />
        <Route path="analytics" element={<AnalyticsOverview />} />
        <Route path="logs" element={<InquiryLogs />} />
        <Route path="unanswered" element={<UnansweredQuestions />} />
        <Route
          path="announcements"
          element={
            <SuperAdminRoute>
              <AnnouncementManagement />
            </SuperAdminRoute>
          }
        />
        <Route
          path="phases"
          element={
            <SuperAdminRoute>
              <PhaseManagement />
            </SuperAdminRoute>
          }
        />
        <Route
          path="offices"
          element={
            <SuperAdminRoute>
              <OfficeManagement />
            </SuperAdminRoute>
          }
        />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
