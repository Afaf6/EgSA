import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  selectProjects,
  selectSelectedProjectId,
  setSelectedProjectId,
} from "../redux/slices/projectsSlice";
import {
  selectUserName,
  selectRole,
  selectIsDeveloper,
  logoutUser,
} from "../redux/slices/authSlice";
import { selectIsStreaming } from "../redux/slices/telemetrySlice";
import ThemeToggle from "../components/common/ThemeToggle";
import ChangePasswordModal from "../components/common/ChangePasswordModal";
import { Search, Bell, ChevronDown, LogOut, Key, Menu, Satellite, X } from "lucide-react";

// "2026/09/07 09:15:31" in UTC (mission operations clock)
const formatUtc = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(
    d.getUTCMinutes()
  )}:${p(d.getUTCSeconds())}`;
};

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MO";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};

const pill = {
  backgroundColor: "var(--egse-bg-raised)",
  border: "1px solid var(--egse-border-soft)",
};

/**
 * Optional props:
 *  - notificationCount : number shown on the bell badge (badge hidden when 0)
 *  - onNotificationsClick : handler for the bell button
 */
export default function Topbar({ onMenuClick, notificationCount = 0, onNotificationsClick }) {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [utcNow, setUtcNow] = useState(() => formatUtc());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const userMenuRef = useRef(null);
  const searchRef = useRef(null);

  const dispatch = useDispatch();

  const projects = useSelector(selectProjects);
  const selectedProjectId = useSelector(selectSelectedProjectId);
  const userName = useSelector(selectUserName);
  const role = useSelector(selectRole);
  const isDeveloper = useSelector(selectIsDeveloper);
  const isStreaming = useSelector(selectIsStreaming);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => setUtcNow(formatUtc()), 1000);
    return () => clearInterval(interval);
  }, []);

  // close the user menu / search results on outside click or Escape
  useEffect(() => {
    const onDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleProjectChange = (nextProjectId) => {
    dispatch(setSelectedProjectId(nextProjectId));
    if (location.pathname.startsWith("/project/")) {
      const suffix = location.pathname.split("/").slice(3).join("/");
      navigate(`/project/${encodeURIComponent(nextProjectId)}${suffix ? `/${suffix}` : ""}`);
    }
  };

  const handleLogout = () => {
    setUserMenuOpen(false);
    dispatch(logoutUser());
  };

  // Search currently covers projects (the data available to this component).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return projects
      .filter((p) => `${p.name || ""} ${p.satelliteName || ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [projects, query]);

  const pickResult = (p) => {
    handleProjectChange(p.id);
    setQuery("");
    setSearchOpen(false);
  };

  const roleLabel = isDeveloper ? "System Admin" : role || "Tester";

  return (
    <header
      className="egse-topbar d-flex align-items-center justify-content-between gap-3 px-3 px-md-4 py-2 border-bottom"
      style={{ borderColor: "var(--egse-border-soft)" }}
    >
      {/* Left: mobile menu + global search */}
      <div className="d-flex align-items-center gap-2 gap-md-3 egse-topbar-left flex-grow-1" style={{ minWidth: 0 }}>
        <button
          type="button"
          className="btn btn-sm btn-egse-outline egse-mobile-menu-button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          title="Navigation menu"
        >
          <Menu size={19} />
        </button>

        <div ref={searchRef} className="d-none d-md-block position-relative flex-grow-1" style={{ maxWidth: 480 }}>
          <div
            className="d-flex align-items-center gap-2 px-3"
            style={{ ...pill, borderRadius: 999, height: 38 }}
          >
            <Search size={16} style={{ color: "var(--egse-text-muted)", flex: "none" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) pickResult(results[0]);
              }}
              placeholder="Search project, subsystem, frame, parameter..."
              aria-label="Search"
              className="flex-grow-1 border-0"
              style={{
                background: "transparent",
                outline: "none",
                color: "var(--egse-text-primary)",
                fontSize: "0.82rem",
                minWidth: 0,
              }}
            />
            {query && (
              <button
                type="button"
                className="btn p-0 border-0"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                style={{ color: "var(--egse-text-muted)", lineHeight: 1 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {searchOpen && query.trim() && (
            <div
              className="position-absolute w-100 mt-1 rounded overflow-hidden"
              style={{
                ...pill,
                backgroundColor: "var(--egse-bg-raised)",
                border: "1px solid var(--egse-border-strong)",
                zIndex: 1050,
                boxShadow: "0 8px 24px rgba(0,0,0,.35)",
              }}
            >
              {results.length === 0 ? (
                <div className="px-3 py-2 small" style={{ color: "var(--egse-text-muted)" }}>
                  No matching project
                </div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="d-flex align-items-center gap-2 w-100 px-3 py-2 border-0 text-start"
                    style={{ background: "transparent", color: "var(--egse-text-primary)", fontSize: "0.84rem" }}
                    onClick={() => pickResult(p)}
                  >
                    <Satellite size={14} style={{ color: "var(--egse-raw)" }} />
                    <span className="fw-semibold">{p.name}</span>
                    <span style={{ color: "var(--egse-text-muted)" }}>({p.satelliteName || "SAT"})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: project, status, clock, notifications, user */}
      <div className="d-flex align-items-center gap-2 gap-md-3 flex-shrink-0">
        {/* Project selector */}
        <div className="d-flex align-items-center gap-1 position-relative" style={{ fontSize: "0.85rem" }}>
          <span className="d-none d-sm-inline" style={{ color: "var(--egse-text-secondary)" }}>
            Project:
          </span>
          <select
            className="border-0 fw-semibold"
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              background: "transparent",
              color: "var(--egse-text-primary)",
              fontSize: "0.85rem",
              cursor: "pointer",
              paddingRight: 20,
              maxWidth: 190,
              outline: "none",
            }}
            value={selectedProjectId || ""}
            onChange={(e) => handleProjectChange(e.target.value)}
            aria-label="Select project"
          >
            {projects.length > 0 ? (
              projects.map((p) => (
                <option key={p.id} value={p.id} style={{ color: "#111" }}>
                  {p.name} ({p.satelliteName || "SAT"})
                </option>
              ))
            ) : (
              <option value="">No Active Projects</option>
            )}
          </select>
          <ChevronDown
            size={14}
            className="position-absolute"
            style={{ right: 2, pointerEvents: "none", color: "var(--egse-text-secondary)" }}
          />
        </div>

        {/* Connection / live stream status */}
        {/* <div
          className="d-none d-lg-flex align-items-center gap-2"
          style={{ fontSize: "0.82rem", color: "var(--egse-text-primary)" }}
          title={isStreaming ? "Telemetry stream is live" : "No live telemetry stream"}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: isStreaming ? "#22c55e" : "var(--egse-text-muted)",
              boxShadow: isStreaming ? "0 0 8px rgba(34,197,94,.8)" : "none",
            }}
          />
          <span>{isStreaming ? "Connected" : "Offline"}</span>
        </div> */}

        {/* UTC mission clock */}
        <div
          className="d-none d-xl-block font-monospace"
          style={{ fontSize: "0.8rem", color: "var(--egse-text-secondary)" }}
          title="Coordinated Universal Time (Mission Operations Clock)"
        >
          {utcNow}
        </div>

        <ThemeToggle />

        {/* Notifications */}
        {/* <button
          type="button"
          className="btn p-0 border-0 position-relative d-flex align-items-center justify-content-center"
          style={{ width: 34, height: 34, color: "var(--egse-text-primary)" }}
          onClick={onNotificationsClick}
          aria-label={notificationCount ? `${notificationCount} notifications` : "Notifications"}
          title="Notifications"
        >
          <Bell size={19} />
          {notificationCount > 0 && (
            <span
              className="position-absolute d-flex align-items-center justify-content-center fw-bold"
              style={{
                top: 0,
                right: 0,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: 999,
                background: "#ef4444",
                color: "#fff",
                fontSize: "0.62rem",
              }}
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button> */}

        {/* User menu (Security + Log Out live here) */}
        <div ref={userMenuRef} className="position-relative">
          <button
            type="button"
            className="btn p-0 border-0 d-flex align-items-center gap-2"
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            style={{ color: "var(--egse-text-primary)" }}
          >
            <span
              className="rounded-circle d-flex align-items-center justify-content-center fw-semibold"
              style={{
                width: 38,
                height: 38,
                background: "rgba(30, 123, 255, 0.18)",
                border: "1px solid rgba(30, 123, 255, 0.55)",
                color: "var(--egse-text-primary)",
                fontSize: "0.82rem",
              }}
            >
              {initialsOf(userName)}
            </span>
            <span className="d-none d-md-flex flex-column text-start">
              <span className="fw-semibold lh-1" style={{ fontSize: "0.85rem" }}>
                {userName || "Mission Operator"}
              </span>
              <span className="text-capitalize" style={{ color: "var(--egse-text-muted)", fontSize: "0.72rem" }}>
                {roleLabel}
              </span>
            </span>
            <ChevronDown
              size={15}
              className="d-none d-md-block"
              style={{
                color: "var(--egse-text-secondary)",
                transform: userMenuOpen ? "rotate(180deg)" : "none",
                transition: "transform .15s",
              }}
            />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              className="position-absolute end-0 mt-2 rounded overflow-hidden"
              style={{
                minWidth: 190,
                backgroundColor: "var(--egse-bg-raised)",
                border: "1px solid var(--egse-border-strong)",
                boxShadow: "0 8px 24px rgba(0,0,0,.35)",
                zIndex: 1050,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="d-flex align-items-center gap-2 w-100 px-3 py-2 border-0 text-start"
                style={{ background: "transparent", color: "var(--egse-text-primary)", fontSize: "0.85rem" }}
                onClick={() => {
                  setUserMenuOpen(false);
                  setChangePasswordOpen(true);
                }}
              >
                <Key size={15} /> Security / Change Password
              </button>
              <button
                type="button"
                role="menuitem"
                className="d-flex align-items-center gap-2 w-100 px-3 py-2 border-0 text-start"
                style={{ background: "transparent", color: "#f87171", fontSize: "0.85rem" }}
                onClick={handleLogout}
              >
                <LogOut size={15} /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </header>
  );
}
