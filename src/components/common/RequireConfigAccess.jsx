import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../../redux/slices/authSlice";

/**
 * Route guard that prevents 'tester' role users from accessing Configuration routes.
 * Redirects unauthorized users to the dashboard.
 */
export default function RequireConfigAccess({ children }) {
  const user = useSelector(selectUser);
  const hasAccess = user?.role === "admin" ||
    user?.permissions?.includes("upload_config") ||
    user?.permissions?.includes("manage_projects");
  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
