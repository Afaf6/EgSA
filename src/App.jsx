import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ThemeProvider } from "./context/ThemeContext";
import MainLayout from "./layouts/MainLayout";
import RequireAdmin from "./components/common/RequireAdmin";
import RequireDeveloper from "./components/common/RequireDeveloper";
import RequireConfigAccess from "./components/common/RequireConfigAccess";
import RequireUserManagement from "./components/common/RequireUserManagement";

import {
  selectIsAuthenticated,
  fetchCurrentUser,
  forceLogout,
} from "./redux/slices/authSlice";
import {
  fetchProjects,
  fetchProjectById,
  selectSelectedProjectId,
} from "./redux/slices/projectsSlice";
import {
  receiveLivePacket,
  setStreamingStatus,
} from "./redux/slices/telemetrySlice";
import socketService from "./services/socketService";

import ProjectScope from "./layouts/ProjectScope";

// PERF: route-level code splitting. Previously every page (incl. Chart.js, the 3D login
// canvas and the large Config Studio / Decoded Data views) shipped in one ~1.2 MB entry
// chunk that had to be downloaded and parsed before anything rendered. Each page is now
// loaded on demand the first time its route is visited; behaviour is unchanged.
const LoginPage = lazy(() => import("./pages/Auth/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/Auth/ResetPasswordPage"));
const DashboardPage = lazy(() => import("./pages/Dashboard/DashboardPage"));
const SatelliteOverviewPage = lazy(() => import("./pages/ProjectOverview/SatelliteOverviewPage"));
const LiveTelemetryPage = lazy(() => import("./pages/LiveTelemetry/LiveTelemetryPage"));
const HistoricalExplorerPage = lazy(() => import("./pages/HistoricalExplorer/HistoricalExplorerPage"));
const FrameInspectorPage = lazy(() => import("./pages/FrameInspector/FrameInspectorPage"));
const ConfigStudioPage = lazy(() => import("./pages/ConfigStudio/ConfigStudioPage"));
const AddFramePage = lazy(() => import("./pages/AddFrame/AddFramePage"));
const DataIngestionPage = lazy(() => import("./pages/DataIngestion/DataIngestionPage"));
const ExportCenterPage = lazy(() => import("./pages/ExportCenter/ExportCenterPage"));
const TesterManagementPage = lazy(() => import("./pages/TesterManagement/TesterManagementPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogs/AuditLogsPage"));

function PageLoader() {
  return (
    <div className="d-flex align-items-center justify-content-center py-5" role="status" aria-live="polite">
      <div className="spinner-border text-info" style={{ width: "2rem", height: "2rem" }}>
        <span className="visually-hidden">Loading…</span>
      </div>
    </div>
  );
}
import ErrorBoundary from "./components/common/ErrorBoundary";

function GlobalAppLifecycle({ children }) {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const selectedProjectId = useSelector(selectSelectedProjectId);

  // 1. Listen for global session expiry event from Axios
  useEffect(() => {
    const handleExpired = () => {
      dispatch(forceLogout());
    };
    window.addEventListener("egse:session_expired", handleExpired);
    return () => window.removeEventListener("egse:session_expired", handleExpired);
  }, [dispatch]);

  // 2. Initial fetch when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchProjects());
      dispatch(fetchCurrentUser());
      socketService.connect();
    } else {
      socketService.disconnect();
    }
  }, [isAuthenticated, dispatch]);

  // 3. Connect Socket subscriber for live telemetry packets
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = socketService.subscribe((event) => {
      if (event.type === "telemetry") {
        dispatch(receiveLivePacket(event.data));
      } else if (event.type === "connection") {
        dispatch(setStreamingStatus(event.status === "connected"));
      }
    });

    return unsubscribe;
  }, [isAuthenticated, dispatch]);

  // 4. Fetch details for selected project
  useEffect(() => {
    if (isAuthenticated && selectedProjectId) {
      dispatch(fetchProjectById(selectedProjectId));
    }
  }, [isAuthenticated, selectedProjectId, dispatch]);

  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <GlobalAppLifecycle>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

            <Route element={<ErrorBoundary><MainLayout /></ErrorBoundary>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/project/:projectId" element={<ProjectScope />}>
                <Route index element={<SatelliteOverviewPage />} />
                <Route path="overview" element={<SatelliteOverviewPage />} />
                <Route path="configuration" element={<RequireConfigAccess><ConfigStudioPage /></RequireConfigAccess>} />
                <Route path="monitoring" element={<LiveTelemetryPage />} />
                <Route path="telemetry" element={<DataIngestionPage />} />
                <Route path="data-ingestion" element={<DataIngestionPage />} />
                <Route path="shared-folder" element={<DataIngestionPage initialTab="shared-folder" />} />
                <Route path="decoded-data" element={<DataIngestionPage initialTab="decoded-telemetry" />} />
                <Route path="history" element={<HistoricalExplorerPage />} />
                <Route path="frames" element={<AddFramePage />} />
                <Route path="add-frame" element={<AddFramePage />} />
                <Route path="frame-inspector" element={<FrameInspectorPage />} />
                <Route path="export-center" element={<ExportCenterPage />} />
              </Route>
              <Route path="/configuration" element={<RequireConfigAccess><ConfigStudioPage /></RequireConfigAccess>} />
              <Route path="/live-telemetry" element={<LiveTelemetryPage />} />
              <Route path="/historical" element={<HistoricalExplorerPage />} />
              <Route path="/frame-inspector" element={<FrameInspectorPage />} />
              <Route path="/data-ingestion" element={<DataIngestionPage />} />
              <Route path="/config-studio" element={<RequireConfigAccess><ConfigStudioPage /></RequireConfigAccess>} />
              <Route path="/add-frame" element={<AddFramePage />} />
              <Route path="/export-center" element={<ExportCenterPage />} />
              <Route
                path="/tester-management"
                element={
                  <RequireUserManagement>
                    <TesterManagementPage />
                  </RequireUserManagement>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <RequireDeveloper>
                    <AuditLogsPage />
                  </RequireDeveloper>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </GlobalAppLifecycle>
    </ThemeProvider>
  );
}
