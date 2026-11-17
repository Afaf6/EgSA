import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectIsDeveloper } from "../../redux/slices/authSlice";

/** Wraps routes that only Developer-role users may access (Audit Logs). */
export default function RequireDeveloper({ children }) {
  const isDeveloper = useSelector(selectIsDeveloper);
  if (!isDeveloper) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
