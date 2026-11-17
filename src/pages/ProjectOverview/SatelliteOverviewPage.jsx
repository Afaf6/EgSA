import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import projectService from "../../services/projectService";
import {
  selectCurrentProject,
  selectProjects,
  setSelectedProjectId,
  fetchProjectById,
} from "../../redux/slices/projectsSlice";
import HealthDonutChart from "./components/HealthDonutChart";
import { formatTimeAgo } from "../../utils/timeAgo";
import {
  Satellite,
  Layers,
  FileCode2,
  Sliders,
  Database,
  FolderArchive,
  Clock,
  ArrowRight,
  Radio,
  LineChart,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function SatelliteOverviewPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const currentProject = useSelector(selectCurrentProject);
  const projects = useSelector(selectProjects);

  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const loadData = async (controller) => {
    if (!projectId) return;
    const signal = controller?.signal;
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectOverview(projectId, { signal });
      if (signal?.aborted || abortControllerRef.current !== controller) {
        return;
      }
      setOverviewData(data);
    } catch (err) {
      if (signal?.aborted || abortControllerRef.current !== controller || err.name === "CanceledError" || err.name === "AbortError" || err.code === "ERR_CANCELED") {
        return; // Request was aborted cleanly due to unmount or project switch
      }
      setError(err?.response?.data?.message || err.message || "Failed to load project overview");
    } finally {
      if (!signal?.aborted && abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  // Every load, including Retry, gets its own controller and aborts the one before it,
  // so only the latest request may update the page.
  const startLoad = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadData(controller);
    return controller;
  };

  useEffect(() => {
    // Abort the in-flight request when projectId changes or the component unmounts
    const controller = startLoad();

    return () => {
      controller.abort();
    };
  }, [projectId]);

  // Synchronize Redux selected project id
  useEffect(() => {
    if (projectId) {
      dispatch(setSelectedProjectId(projectId));
    }
  }, [projectId, dispatch]);

  const project =
    overviewData?.project ||
    ((currentProject?._id === projectId || currentProject?.id === projectId) ? currentProject : null) ||
    (Array.isArray(projects) ? projects.find((p) => (p.id || p._id) === projectId || p.name === projectId) : null);

  const summary = overviewData?.summary || {
    subsystemsCount: 0,
    framesCount: 0,
    parametersCount: 0,
    totalReadings: 0,
    processedFilesCount: 0,
    lastDataReceived: null,
  };

  const statusCounts = overviewData?.statusCounts || {
    normal: 0,
    warning: 0,
    alarm: 0,
    invalid: 0,
    unmonitored: 0,
    total: 0,
  };

  const subsystems = Array.isArray(overviewData?.subsystems) ? overviewData.subsystems : [];
  // Only show files that were actually decoded and stored. Rejected / failed / empty uploads are hidden.
  const recentFiles = (Array.isArray(overviewData?.recentFiles) ? overviewData.recentFiles : []).filter(
    (f) => (f.status === "completed" || f.status === "processed") && (f.recordCount ?? 0) > 0
  );

  const handleOpenTelemetryFiles = () => {
    navigate(`/project/${encodeURIComponent(projectId)}/telemetry`);
  };

  const handleOpenLiveMonitoring = () => {
    navigate(`/project/${encodeURIComponent(projectId)}/monitoring`);
  };

  const handleOpenHistorical = () => {
    navigate(`/project/${encodeURIComponent(projectId)}/history`);
  };

  const handleOpenSubsystem = (subsystemId) => {
    if (!subsystemId) return;
    navigate(`/project/${encodeURIComponent(projectId)}/decoded-data`, {
      state: { subsystemId },
    });
  };

  if (loading && !overviewData) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center p-5" style={{ minHeight: "60vh" }}>
        <div className="spinner-border text-info mb-3" role="status">
          <span className="visually-hidden">Loading satellite overview...</span>
        </div>
        <div className="small text-muted">Loading satellite health and mission metrics...</div>
      </div>
    );
  }

  if (error && !overviewData) {
    return (
      <div className="egse-panel p-4 text-center my-4" data-testid="overview-error-state">
        <AlertTriangle size={42} className="text-warning mb-2" />
        <h2 className="egse-heading h5 mb-2">Unable to load satellite overview</h2>
        <p className="small text-muted mb-3">{error}</p>
        <button
          type="button"
          className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2"
          onClick={() => startLoad()}
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-4" data-testid="satellite-overview-page">
      {/* ── 1. Satellite Header Banner (NO Configuration button) ── */}
      <div className="egse-panel p-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="p-3 rounded d-flex align-items-center justify-content-center"
              style={{
                background: "rgba(6, 182, 212, 0.15)",
                border: "1px solid rgba(6, 182, 212, 0.35)",
                boxShadow: "0 0 16px rgba(6, 182, 212, 0.2)",
              }}
            >
              <Satellite size={32} className="text-info" />
            </div>
            <div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <h1 className="egse-heading h4 mb-0 fw-bold" style={{ color: "var(--egse-text-primary, #fff)" }}>
                  {project?.name || projectId}
                </h1>
                <span className="badge bg-dark border border-secondary text-info small">
                  v{project?.version ?? 0}
                </span>
                {project?.satelliteName && (
                  <span
                    className="badge rounded-pill"
                    style={{
                      background: "rgba(6, 182, 212, 0.12)",
                      color: "var(--egse-raw, #06b6d4)",
                      border: "1px solid rgba(6, 182, 212, 0.25)",
                      fontSize: "0.75rem",
                    }}
                  >
                    Platform: {project.satelliteName}
                  </span>
                )}
              </div>
              <p className="small mb-0 mt-1" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                {project?.description || "Active satellite telemetry mission profile"}
              </p>
            </div>
          </div>

          {/* Quick Mission Operations Actions (NO Configuration button) */}
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1"
              onClick={handleOpenLiveMonitoring}
              title="Stream live telemetry packets"
            >
              <Radio size={14} className="text-success" />
              <span>Live Telemetry</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1"
              onClick={handleOpenHistorical}
              title="Parameter historical trends"
            >
              <LineChart size={14} className="text-info" />
              <span>Historical Explorer</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
              onClick={handleOpenTelemetryFiles}
              title="Upload and inspect telemetry files"
            >
              <FolderArchive size={14} />
              <span>Telemetry Files</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Summary KPI Cards Grid (Real numbers, no NaN) ── */}
      <div className="row g-3" data-testid="kpi-cards-grid">
        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Subsystems</span>
              <Layers size={17} className="text-info" />
            </div>
            <div className="fs-3 fw-bold mt-2" style={{ color: "var(--egse-text-primary, #fff)" }} data-testid="kpi-subsystems">
              {(summary.subsystemsCount ?? 0).toLocaleString('en-US')}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              Active Modules
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Telemetry Frames</span>
              <FileCode2 size={17} className="text-success" />
            </div>
            <div className="fs-3 fw-bold mt-2" style={{ color: "var(--egse-text-primary, #fff)" }} data-testid="kpi-frames">
              {(summary.framesCount ?? 0).toLocaleString('en-US')}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              Registered Formats
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Parameters</span>
              <Sliders size={17} className="text-warning" />
            </div>
            <div className="fs-3 fw-bold mt-2" style={{ color: "var(--egse-text-primary, #fff)" }} data-testid="kpi-parameters">
              {(summary.parametersCount ?? 0).toLocaleString('en-US')}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              Mapped Fields
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Total Readings</span>
              <Database size={17} className="text-primary" />
            </div>
            <div className="fs-3 fw-bold mt-2" style={{ color: "var(--egse-text-primary, #fff)" }} data-testid="kpi-readings">
              {(summary.totalReadings ?? 0).toLocaleString('en-US')}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              Decoded Values
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Processed Files</span>
              <FolderArchive size={17} className="text-info" />
            </div>
            <div className="fs-3 fw-bold mt-2" style={{ color: "var(--egse-text-primary, #fff)" }} data-testid="kpi-files">
              {(summary.processedFilesCount ?? 0).toLocaleString('en-US')}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              Ingested Logs
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-4 col-xl-2">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between text-secondary small">
              <span>Last Data Received</span>
              <Clock size={17} className="text-secondary" />
            </div>
            <div
              className="fw-semibold mt-2 text-truncate"
              style={{
                fontSize: "1.05rem",
                color: summary.lastDataReceived ? "var(--egse-text-primary, #fff)" : "var(--egse-text-muted, #64748b)",
                minHeight: "2.1rem",
                display: "flex",
                alignItems: "center",
              }}
              data-testid="kpi-last-received"
              title={summary.lastDataReceived ? new Date(summary.lastDataReceived).toLocaleString() : "No telemetry data received yet"}
            >
              {summary.lastDataReceived ? formatTimeAgo(summary.lastDataReceived) || new Date(summary.lastDataReceived).toLocaleTimeString() : "Never"}
            </div>
            <div className="small text-muted mt-1" style={{ fontSize: "0.72rem" }}>
              {summary.lastDataReceived ? new Date(summary.lastDataReceived).toLocaleDateString() : "No telemetry downlinked"}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Health Donut Chart & Architecture Overview ── */}
      <div className="row g-3">
        {/* Donut Chart Card */}
        <div className="col-lg-5">
          <div className="egse-panel h-100 p-3 d-flex flex-column" data-testid="health-card">
            <div className="egse-panel-header d-flex align-items-center justify-content-between mb-3">
              <h2 className="egse-panel-title mb-0 fs-6 fw-bold">Telemetry Health Status</h2>
              <span className="badge bg-secondary bg-opacity-25 text-info small" style={{ fontSize: "0.7rem" }}>
                LimitStatus Verification
              </span>
            </div>

            <div className="flex-grow-1 d-flex align-items-center justify-content-center">
              <HealthDonutChart statusCounts={statusCounts} size={170} />
            </div>

            <div className="small text-muted text-center mt-3 pt-2 border-top" style={{ borderColor: "var(--egse-border-soft)", fontSize: "0.74rem" }}>
              Status matches parameters verified in the Decoded Telemetry View
            </div>
          </div>
        </div>

        {/* Subsystems Architecture Summary Table */}
        <div className="col-lg-7">
          <div className="egse-panel h-100 p-3 d-flex flex-column" data-testid="subsystems-card">
            <div className="egse-panel-header d-flex align-items-center justify-content-between mb-3">
              <h2 className="egse-panel-title mb-0 fs-6 fw-bold">Subsystems Breakdown</h2>
            </div>

            {subsystems.length > 0 ? (
              <div className="table-responsive flex-grow-1">
                <table className="table table-sm table-borderless align-middle mb-0" style={{ fontSize: "0.82rem" }}>
                  <thead>
                    <tr className="border-bottom" style={{ borderColor: "var(--egse-border-soft)", color: "var(--egse-text-muted)" }}>
                      <th className="fw-medium pb-2">Subsystem</th>
                      <th className="fw-medium pb-2 text-center">Frames</th>
                      <th className="fw-medium pb-2 text-center">Parameters</th>
                      <th className="fw-medium pb-2 text-center">Readings</th>
                      <th className="fw-medium pb-2 text-end">Health Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsystems.map((sub) => {
                      const sNormal = sub.statusCounts?.normal || 0;
                      const sWarn = sub.statusCounts?.warning || 0;
                      const sAlarm = sub.statusCounts?.alarm || 0;
                      const sInvalid = sub.statusCounts?.invalid || 0;
                      const sUnmon = Math.max(0, (sub.statusCounts?.unmonitored || 0) - sInvalid);
                      const sTotal = sub.readingsCount || (sNormal + sWarn + sAlarm + sInvalid + sUnmon);
                      const subsystemId = sub.id || sub._id;

                      return (
                        <tr
                          key={sub.id || sub._id || sub.name}
                          className="border-bottom"
                          onClick={() => handleOpenSubsystem(subsystemId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleOpenSubsystem(subsystemId);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open decoded telemetry for ${sub.name}`}
                          style={{ borderColor: "var(--egse-border-soft, rgba(255, 255, 255, 0.04))", cursor: "pointer" }}
                        >
                          <td className="py-2">
                            <div className="fw-semibold" style={{ color: "var(--egse-text-primary, #fff)" }}>
                              {sub.name}
                            </div>
                            {sub.subsystemCode && (
                              <div className="small text-muted" style={{ fontSize: "0.7rem" }}>
                                Code: {sub.subsystemCode}
                              </div>
                            )}
                          </td>
                          <td className="text-center py-2">{sub.framesCount ?? 0}</td>
                          <td className="text-center py-2">{sub.parametersCount ?? 0}</td>
                          <td className="text-center py-2 font-monospace">{sTotal.toLocaleString('en-US')}</td>
                          <td className="text-end py-2">
                            {sTotal > 0 ? (
                              <div className="d-inline-flex align-items-center gap-1">
                                {sNormal > 0 && (
                                  <span className="badge bg-success bg-opacity-75" title={`${sNormal} Normal`}>
                                    {sNormal}
                                  </span>
                                )}
                                {sWarn > 0 && (
                                  <span className="badge bg-warning text-dark" title={`${sWarn} Warning`}>
                                    {sWarn}
                                  </span>
                                )}
                                {sAlarm > 0 && (
                                  <span className="badge bg-danger" title={`${sAlarm} Critical`}>
                                    {sAlarm}
                                  </span>
                                )}
                                {sInvalid > 0 && (
                                  <span
                                    className="badge"
                                    style={{
                                      backgroundColor: "rgba(168, 85, 247, 0.2)",
                                      color: "#c084fc",
                                      border: "1px solid rgba(168, 85, 247, 0.4)",
                                    }}
                                    title={`${sInvalid} Invalid`}
                                  >
                                    {sInvalid}
                                  </span>
                                )}
                                {sUnmon > 0 && (
                                  <span className="badge bg-secondary" title={`${sUnmon} Unmonitored`}>
                                    {sUnmon}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="small text-muted fst-italic">No readings</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 flex-grow-1 d-flex flex-column align-items-center justify-content-center">
                <Layers size={32} className="text-secondary opacity-50 mb-2" />
                <div className="fw-semibold text-secondary">No subsystems defined</div>
                <p className="small text-muted mt-1 mb-0">Define telemetry frames in Architecture to populate subsystems.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. "What Was Read" Section: Recent Ingested Telemetry Files ── */}
      <div className="egse-panel p-3" data-testid="recent-files-card">
        <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h2 className="egse-panel-title mb-0 fs-6 fw-bold">Recent Telemetry Ingestions</h2>
            <div className="small text-muted mt-1" style={{ fontSize: "0.75rem" }}>
              Latest telemetry log files decoded and archived for this satellite
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1"
            onClick={handleOpenTelemetryFiles}
          >
            <span>View All Files</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {recentFiles.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-sm table-borderless align-middle mb-0" style={{ fontSize: "0.84rem" }}>
              <thead>
                <tr className="border-bottom" style={{ borderColor: "var(--egse-border-soft)", color: "var(--egse-text-muted)" }}>
                  <th className="fw-medium pb-2">Log File Name</th>
                  <th className="fw-medium pb-2">Subfolder</th>
                  <th className="fw-medium pb-2 text-center">Status</th>
                  <th className="fw-medium pb-2 text-center">Records</th>
                  <th className="fw-medium pb-2 text-end">Ingested</th>
                </tr>
              </thead>
              <tbody>
                {recentFiles.map((f) => (
                  <tr
                    key={f.id || f._id || f.fileName}
                    className="border-bottom"
                    style={{ borderColor: "var(--egse-border-soft, rgba(255, 255, 255, 0.04))" }}
                  >
                    <td className="py-2">
                      <div className="d-flex align-items-center gap-2">
                        <FileText size={15} className="text-info opacity-75" />
                        <span className="fw-medium font-monospace" style={{ color: "var(--egse-text-primary, #fff)" }}>
                          {f.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2">
                      {f.subfolder ? (
                        <span className="badge bg-secondary bg-opacity-25 text-light small">
                          {f.subfolder}
                        </span>
                      ) : (
                        <span className="text-muted small">root</span>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        className={`badge ${f.status === "completed" || f.status === "processed" ? "bg-success bg-opacity-25 text-success border border-success border-opacity-50" : "bg-warning bg-opacity-25 text-warning"}`}
                        style={{ fontSize: "0.72rem" }}
                      >
                        {f.status || "completed"}
                      </span>
                    </td>
                    <td className="py-2 text-center font-monospace">
                      {(f.recordCount ?? 0).toLocaleString('en-US')}
                    </td>
                    <td className="py-2 text-end text-muted small">
                      {f.processedAt ? formatTimeAgo(f.processedAt) || new Date(f.processedAt).toLocaleString() : "Recently"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4">
            <FolderArchive size={36} className="text-secondary opacity-50 mb-2" />
            <div className="fw-semibold" style={{ color: "var(--egse-text-primary, #fff)" }}>
              No telemetry files ingested yet
            </div>
            <p className="small text-muted mt-1 mb-3">
              Upload raw satellite telemetry (.txt) files or connect a shared folder to start decoding and archiving data.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
              onClick={handleOpenTelemetryFiles}
            >
              <FolderArchive size={14} /> Ingest Telemetry Files
            </button>
          </div>
        )}
      </div>
    </div>
  );
}