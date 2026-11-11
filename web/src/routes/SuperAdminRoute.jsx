import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function SuperAdminRoute({ children }) {
  const { currentUser } = useAuth();

  if (currentUser?.role !== "superadmin") {
    return <Navigate to="/tickets" replace />;
  }

  return children;
}
