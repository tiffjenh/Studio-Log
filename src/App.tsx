import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useStoreContext } from "./context/StoreContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import AddStudent from "./pages/AddStudent";
import Earnings from "./pages/Earnings";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import EditLesson from "./pages/EditLesson";

function AuthGate() {
  const { data, loaded } = useStoreContext();
  const location = useLocation();
  if (!loaded) return <div className="loading-screen">Loading…</div>;
  if (!data.user) {
    if (location.pathname === "/") return <Landing />;
    return <Navigate to="/" replace />;
  }
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/" element={<AuthGate />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="add-student" element={<AddStudent />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="edit-lesson/:id" element={<EditLesson />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
