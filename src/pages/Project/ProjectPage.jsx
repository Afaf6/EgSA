import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  selectProjects,
  selectSelectedProjectFrames,
  setSelectedProjectId,
} from "../../redux/slices/projectsSlice";
import { selectIsAdmin, selectRole } from "../../redux/slices/authSlice";
import {
  fetchTelemetryStats,
  selectTelemetryStats,
} from "../../redux/slices/telemetrySlice";
import {
  Satellite,
  Layers,
  FileCode2,
  Database,
  Sliders,
  Activity,
  History,
  ArrowLeft,
  PlusCircle,
  ExternalLink,
} from "lucide-react";

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const projects = useSelector(selectProjects);
  const frames = useSelector(selectSelectedProjectFrames);
  const isAdmin = useSelector(selectIsAdmin);
  const role = useSelector(selectRole);
  const isTester = role === 'tester';
  const telemetryStats = useSelector(selectTelemetryStats);

  const project = useMemo(() => {
    return projects.find(
      (item) =>
        item.id === projectId ||
        item._id === projectId ||
        item.name === projectId
    );
  }, [projects, projectId]);

  // Synchronize active project selection & fetch stats
  useEffect(() => {
    const id = project?.id || project?._id;
    if (id) {
      dispatch(setSelectedProjectId(id));
      dispatch(fetchTelemetryStats(id));
    }
  }, [project, dispatch]);

  const projectFrames = useMemo(
    () => frames.filter((frame) => frame.projectId === (project?.id || project?._id)),
    [frames, project]
  );

  if (!project) {
    return (
      <div className="egse-panel p-4 text-center my-4">
        <Satellite size={48} className="text-secondary mb-3 opacity-50" />
        <h1 className="egse-heading h5 mb-2">Satellite Project Not Found</h1>
        <p className="small text-secondary mb-3">
          The requested project "{projectId}" could not be located in the database.
        </p>
        <button
          className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={16} /> Return to Dashboard
        </button>
      </div>
    );
  }

  const open = (path) => {
    const id = project.id || project._id;
    dispatch(setSelectedProjectId(id));
    navigate(`/project/${encodeURIComponent(id)}${path ? `/${path}` : ""}`);
  };

  const subsystems = Array.isArray(project.subsystems) ? project.subsystems : [];

  return (
    <div>
      {/* Header section */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <button
            className="btn btn-sm btn-egse-outline mb-2 d-inline-flex align-items-center gap-1"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div className="d-flex align-items-center gap-2">
            <Satellite size={26} className="text-info" />
            <h1 className="egse-heading h4 mb-0">{project.name}</h1>
            <span className="badge bg-dark border border-secondary text-info small ms-2">
              v{project.version ?? 0}
            </span>
          </div>
          <p className="small mb-0 mt-1" style={{ color: "var(--egse-text-secondary)" }}>
            {project.satelliteName || "Satellite designation pending"} · {project.description || "Mission telemetry profile"}
          </p>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-egse-primary d-flex align-items-center gap-1"
            onClick={() => open("add-frame")}
          >
            <PlusCircle size={15} /> Add Frame
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between">
              <span className="small text-secondary">Configured Subsystems</span>
              <Layers size={18} className="text-info" />
            </div>
            <div className="fs-3 fw-semibold mt-2" style={{ color: "var(--egse-text-primary)" }}>{subsystems.length}</div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between">
              <span className="small text-secondary">Telemetry Frames</span>
              <FileCode2 size={18} className="text-success" />
            </div>
            <div className="fs-3 fw-semibold mt-2" style={{ color: "var(--egse-text-primary)" }}>{projectFrames.length}</div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="egse-panel h-100 p-3">
            <div className="d-flex align-items-center justify-content-between">
              <span className="small text-secondary">Processed Telemetry</span>
              <Database size={18} className="text-warning" />
            </div>
            <div className="fs-3 fw-semibold mt-2" style={{ color: "var(--egse-text-primary)" }}>
              {telemetryStats?.totalFiles ?? telemetryStats?.filesCount ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Subsystem Configuration Breakdown */}
      <div className="egse-panel mb-4">
        <div className="egse-panel-header d-flex justify-content-between align-items-center">
          <h2 className="egse-panel-title mb-0">Project Architecture & Subsystems</h2>
          {!isTester && (
            <button
              className="btn btn-sm btn-link text-info text-decoration-none p-0 d-flex align-items-center gap-1"
              onClick={() => open("configuration")}
            >
              <span>Config Studio</span> <ExternalLink size={14} />
            </button>
          )}
        </div>

        <div className="egse-panel-body">
          {subsystems.length > 0 ? (
            <div className="d-flex flex-column gap-2">
              {subsystems.map((subsystem) => {
                const subName = typeof subsystem === "string" ? subsystem : subsystem?.name || "Subsystem";
                const subsystemFrames = projectFrames.filter(
                  (frame) => frame.subsystem === subName || frame.subsystem === subsystem
                );
                return (
                  <div
                    key={subName}
                    className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded p-3"
                    style={{ borderColor: "var(--egse-border)", backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="rounded p-2"
                        style={{ backgroundColor: "rgba(6, 182, 212, 0.1)", color: "var(--egse-raw)" }}
                      >
                        <Layers size={20} />
                      </div>
                      <div>
                        <div className="fw-semibold" style={{ color: "var(--egse-text-primary)" }}>{subName}</div>
                        <div className="small text-secondary">
                          {subsystemFrames.length} frame schema(s) active
                        </div>
                      </div>
                    </div>
                    {!isTester && (
                      <button
                        className="btn btn-sm btn-egse-outline"
                        onClick={() => open("configuration")}
                      >
                        Configure Frame
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <Layers size={36} className="text-secondary opacity-50 mb-2" />
              <div className="fw-semibold" style={{ color: "var(--egse-text-primary)" }}>No Subsystems Configured Yet</div>
              <p className="small text-secondary mt-1 mb-3">
                {isTester
                  ? "No telemetry frame schemas have been configured for this project yet."
                  : "Upload a mission configuration file or define telemetry frames manually to populate this project."}
              </p>
              {!isTester && (
                <button
                  className="btn btn-sm btn-egse-primary"
                  onClick={() => open("configuration")}
                >
                  Open Config Studio
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Quick Links */}
      <div className="d-flex flex-wrap gap-2 pt-2 border-top border-secondary border-opacity-25">
        {!isTester && (
          <button
            className="btn btn-egse-outline d-flex align-items-center gap-2"
            onClick={() => open("configuration")}
          >
            <Sliders size={16} /> Configuration Studio
          </button>
        )}
        <button
          className="btn btn-egse-outline d-flex align-items-center gap-2"
          onClick={() => open("monitoring")}
        >
          <Activity size={16} /> Live Telemetry
        </button>
        <button
          className="btn btn-egse-outline d-flex align-items-center gap-2"
          onClick={() => open("telemetry")}
        >
          <Database size={16} /> File Ingestion
        </button>
        <button
          className="btn btn-egse-outline d-flex align-items-center gap-2"
          onClick={() => open("history")}
        >
          <History size={16} /> Historical Explorer
        </button>
      </div>
    </div>
  );
}
