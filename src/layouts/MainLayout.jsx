import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import TelemetryDatasetNotice from "../components/common/TelemetryDatasetNotice";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import SpaceBackground from "../pages/Auth/components/SpaceBackground";
import StaticSpaceBackground from "../pages/Auth/components/StaticSpaceBackground";
import { ANIMATED_SPACE_BACKGROUND } from "../config/background";
import { selectIsAuthenticated } from "../redux/slices/authSlice";

import ErrorBoundary from "../components/common/ErrorBoundary";

export default function MainLayout() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="egse-shell">
      {/* Background: static for now (see src/config/background.js to switch back to the animated one) */}
      {ANIMATED_SPACE_BACKGROUND ? <SpaceBackground maxFps={30} /> : <StaticSpaceBackground />}
      {mobileSidebarOpen && (
        <button
          type="button"
          className="egse-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <Sidebar
        isMobileOpen={mobileSidebarOpen}
        onNavigate={() => setMobileSidebarOpen(false)}
      />
      <div className="egse-main">
        <Topbar onMenuClick={() => setMobileSidebarOpen((open) => !open)} />
        <main className="egse-content">
          <ErrorBoundary>
            <TelemetryDatasetNotice />
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
