import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectIsAdmin } from "../../redux/slices/authSlice";

/** Wraps routes that only Admin/Developer-role users may see. */
export default function RequireAdmin({ children }) {
  const isAdmin = useSelector(selectIsAdmin);
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
