import { NavLink, useNavigate, useLocation, matchPath } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectCanOpenConfiguration, selectIsAdmin, selectIsDeveloper, selectRole, selectUser } from "../redux/slices/authSlice";
import {
  selectSelectedProjectId,
  selectProjects,
  selectCurrentProject,
  setSelectedProjectId,
} from "../redux/slices/projectsSlice";
import { selectIsStreaming } from "../redux/slices/telemetrySlice";
import {
  LayoutDashboard,
  Radio,
  LineChart,
  Search,
  FolderArchive,
  Sliders,
  FileSpreadsheet,
  Users,
  Shield,
  Satellite,
  ArrowLeft,
} from "lucide-react";

const PROJECT_NAV_ITEMS = [
  { path: "", icon: LayoutDashboard, label: "Overview", adminOnly: false },
  { path: "monitoring", icon: Radio, label: "Live Telemetry", adminOnly: false },
  { path: "history", icon: LineChart, label: "Historical Explorer", adminOnly: false },
  { path: "frame-inspector", icon: Search, label: "Frame Inspector", adminOnly: false },
  { path: "telemetry", icon: FolderArchive, label: "Telemetry Files", adminOnly: false },
  { path: "configuration", icon: Sliders, label: "Configuration", adminOnly: false },
  { path: "export-center", icon: FileSpreadsheet, label: "Export Center", adminOnly: false },
];

const GLOBAL_NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Mission Dashboard", adminOnly: false },
  { to: "/tester-management", icon: Users, label: "Team Management", permission: "manage_users" },
  { to: "/audit-logs", icon: Shield, label: "Security Audit Logs", devOnly: true },
];

export default function Sidebar({ isMobileOpen = false, onNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const isAdmin = useSelector(selectIsAdmin);
  const isDeveloper = useSelector(selectIsDeveloper);
  const canOpenConfiguration = useSelector(selectCanOpenConfiguration);
  const role = useSelector(selectRole);
  const user = useSelector(selectUser);
  const reduxSelectedProjectId = useSelector(selectSelectedProjectId);
  const projects = useSelector(selectProjects);
  const currentProject = useSelector(selectCurrentProject);
  const isStreaming = useSelector(selectIsStreaming);

  // Requirement: on global routes (/dashboard, /tester-management, /audit-logs), always render the global sidebar even if Redux has a stale selectedProjectId.
  const isGlobalRoute =
    location.pathname === "/dashboard" ||
    location.pathname === "/tester-management" ||
    location.pathname === "/audit-logs" ||
    location.pathname.startsWith("/dashboard/") ||
    location.pathname.startsWith("/tester-management/") ||
    location.pathname.startsWith("/audit-logs/");

  // Match /project/:projectId from URL
  const projectMatch =
    matchPath({ path: "/project/:projectId/*", end: false }, location.pathname) ||
    matchPath({ path: "/project/:projectId", end: true }, location.pathname);

  const urlProjectId = projectMatch?.params?.projectId
    ? decodeURIComponent(projectMatch.params.projectId)
    : null;

  // Selected project is determined with priority:
  // 1. If on a global route -> strictly null (render only global items)
  // 2. If URL contains /project/:projectId -> urlProjectId
  // 3. Fallback to Redux selectedProjectId ONLY when there is no /project/:id in URL AND we are not on a global route (for existing RBAC tests that preload Redux with path "/")
  const effectiveProjectId = isGlobalRoute ? null : (urlProjectId || reduxSelectedProjectId);

  // Resolve current project info for header
  const project = effectiveProjectId
    ? (Array.isArray(projects) ? projects.find((p) => (p.id || p._id) === effectiveProjectId || p.name === effectiveProjectId) : null) ||
    ((currentProject?._id === effectiveProjectId || currentProject?.id === effectiveProjectId) ? currentProject : null)
    : null;

  const projectName = project?.name || effectiveProjectId;
  const satelliteCode = project?.satelliteName || project?.code || null;

  const handleSwitchSatellite = () => {
    dispatch(setSelectedProjectId(null));
    if (onNavigate) onNavigate();
    navigate("/dashboard");
  };

  const filterItem = (item) => {
    if (item.path === "configuration" || item.label === "Configuration") {
      return canOpenConfiguration;
    }
    if (item.devOnly) return isDeveloper;
    if (item.permission) return isDeveloper || user?.permissions?.includes(item.permission);
    if (item.adminOnly) return isAdmin;
    return true;
  };

  return (
    <aside className={`egse-sidebar d-flex flex-column${isMobileOpen ? " is-mobile-open" : ""}`}>
      {/* Brand Header with Aerospace Badge */}
      <div
        className="egse-sidebar-brand d-flex align-items-center gap-2 px-3 py-3 border-bottom"
        style={{ borderColor: "var(--egse-border-soft)" }}
      >
        <div
          className="p-1 rounded d-flex align-items-center justify-content-center"
          style={{
            background: "rgba(6, 182, 212, 0.15)",
            border: "1px solid rgba(6, 182, 212, 0.35)",
            boxShadow: "0 0 12px rgba(6, 182, 212, 0.15)",
          }}
        >
          <Satellite size={20} className="text-info" />
        </div>
        <div className="d-flex flex-column">
          <span className="fw-bold tracking-wide" style={{ letterSpacing: "1px" }}>
            EgSA
          </span>
          <span style={{ color: "var(--egse-text-muted)", fontSize: "0.68rem" }}>
            Telemetry Analysis Platform
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="py-3 flex-grow-1 overflow-auto d-flex flex-column gap-1 px-2 egse-nav">
        {effectiveProjectId ? (
          <>
            {/* Active Satellite Context Card */}
            <div
              className="p-2 mb-2 rounded border"
              style={{
                backgroundColor: "var(--egse-bg-raised, rgba(255,255,255,0.03))",
                borderColor: "var(--egse-border-soft)",
              }}
            >
              <div className="d-flex align-items-center justify-content-between mb-1">
                <span
                  className="small text-uppercase fw-semibold"
                  style={{
                    fontSize: "0.62rem",
                    letterSpacing: "0.08em",
                    color: "var(--egse-raw, #06b6d4)",
                  }}
                >
                  Working on
                </span>
                <button
                  type="button"
                  onClick={handleSwitchSatellite}
                  className="btn btn-link p-0 text-decoration-none small d-inline-flex align-items-center gap-1 opacity-75 hover-opacity-100"
                  style={{ fontSize: "0.72rem", color: "var(--egse-text-secondary)" }}
                  title="Switch satellite or return to dashboard"
                >
                  <ArrowLeft size={12} />
                  <span>Switch</span>
                </button>
              </div>
              <div
                className="fw-bold text-truncate"
                style={{ fontSize: "0.85rem", color: "var(--egse-text-primary)" }}
                title={projectName}
              >
                {projectName}
              </div>
              {satelliteCode && (
                <div
                  className="small text-truncate"
                  style={{ fontSize: "0.70rem", color: "var(--egse-text-muted)" }}
                >
                  {satelliteCode}
                </div>
              )}
            </div>

            {/* Satellite-Scoped Items */}
            <div className="d-flex flex-column gap-1">
              {PROJECT_NAV_ITEMS.filter(filterItem).map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  projectId={effectiveProjectId}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            {/* Subtle Divider */}
            <div
              className="my-2 border-top"
              style={{ borderColor: "var(--egse-border-soft)" }}
            />

            {/* Global Links (Accessible while inside a project) */}
            <div className="d-flex flex-column gap-1">
              <span
                className="px-3 py-1 small text-uppercase"
                style={{ fontSize: "0.6rem", letterSpacing: "0.06em", color: "var(--egse-text-muted)" }}
              >
                Global Navigation
              </span>
              {GLOBAL_NAV_ITEMS.filter(filterItem).map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  projectId={null}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        ) : (
          /* Global Navigation Only (When no satellite is selected or on /dashboard) */
          <div className="d-flex flex-column gap-1">
            {GLOBAL_NAV_ITEMS.filter(filterItem).map((item) => (
              <NavItem
                key={item.to}
                item={item}
                projectId={null}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Ground Station Stream Link & Privileges Footer */}
      <div className="p-3 border-top mt-auto d-none d-md-block" style={{ borderColor: "var(--egse-border-soft)" }}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="small text-muted" style={{ fontSize: "0.75rem" }}>Telemetry Link</span>
          <span
            className={`badge ${isStreaming ? "bg-success" : "bg-secondary"} d-flex align-items-center gap-1`}
            style={{ fontSize: "0.7rem", letterSpacing: "0.03em" }}
          >
            <span
              className="rounded-circle d-inline-block"
              style={{
                width: 6,
                height: 6,
                backgroundColor: isStreaming ? "#10b981" : "#94a3b8",
                boxShadow: isStreaming ? "0 0 8px #10b981" : "none",
              }}
            />
            {isStreaming ? "ONLINE" : "STANDBY"}
          </span>
        </div>

        <div
          className="egse-chip w-100 justify-content-center"
          style={{ fontSize: "0.73rem", backgroundColor: "var(--egse-bg-raised)" }}
        >
          <Shield size={13} className="me-1" />
          {isDeveloper || isAdmin ? "Admin Console" : "Flight Controller"}
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, projectId, onNavigate }) {
  const Icon = item.icon;
  const to = item.path !== undefined && projectId
    ? (item.path ? `/project/${encodeURIComponent(projectId)}/${item.path}` : `/project/${encodeURIComponent(projectId)}`)
    : item.to || "/dashboard";

  const isExactRoot = item.path === "" || item.path === "overview";

  const content = (
    <>
      <Icon size={17} style={{ opacity: 0.9 }} />
      <span style={{ fontSize: "0.88rem" }}>{item.label}</span>
    </>
  );

  const className = "egse-nav-link d-flex align-items-center gap-2 px-3 py-2 rounded";

  return (
    <NavLink
      to={to}
      end={isExactRoot}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${className}${isActive ? " active" : ""}`
      }
    >
      {content}
    </NavLink>
  );
}
