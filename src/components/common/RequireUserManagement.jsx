import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectCanManageUsers } from "../../redux/slices/authSlice";

/**
 * Route guard that ensures the user has permission to manage users.
 * Accessible to Admin, Developer, or users with the 'manage_users' permission.
 * Unauthorized users are redirected to /dashboard.
 */
export default function RequireUserManagement({ children }) {
  const canManage = useSelector(selectCanManageUsers);
  if (!canManage) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

