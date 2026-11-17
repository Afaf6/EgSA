import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Satellite, ArrowRight, Layers, Trash2, Edit2, Cpu, Activity, Sliders } from "lucide-react";
import { deleteProject, setSelectedProjectId } from "../../../redux/slices/projectsSlice";
import { selectCanManageProjects, selectCanOpenConfiguration, selectIsDeveloper, selectUser } from "../../../redux/slices/authSlice";
import EditProjectModal from "./EditProjectModal";
import DeleteProjectModal from "./DeleteProjectModal";

export default function ProjectCard({ project }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const canManageProjects = useSelector(selectCanManageProjects);
  const canOpenConfiguration = useSelector(selectCanOpenConfiguration);
  const isDeveloper = useSelector(selectIsDeveloper);
  const user = useSelector(selectUser);
  const canDeleteProject = isDeveloper || user?.permissions?.includes("delete_project");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const projectId = project._id || project.id;
  const subsystems = Array.isArray(project.subsystems)
    ? project.subsystems.map((s) => (typeof s === "string" ? s : s?.name || s?.subsystemCode))
    : [];

  const openProject = () => {
    dispatch(setSelectedProjectId(projectId));
    navigate(`/project/${encodeURIComponent(projectId)}`);
  };

  const openConfiguration = (event) => {
    event.stopPropagation();
    dispatch(setSelectedProjectId(projectId));
    navigate(`/project/${encodeURIComponent(projectId)}/configuration`);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setIsDeleteOpen(true);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    setIsEditOpen(true);
  };

  return (
    <>
      <div className="col-md-6 col-xl-4">
        <div
          className="egse-panel h-100 d-flex flex-column"
          style={{
            cursor: "pointer",
            transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
          }}
          onClick={openProject}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-3px)";
            e.currentTarget.style.borderColor = "var(--egse-border-strong)";
            e.currentTarget.style.boxShadow = "var(--egse-shadow-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.borderColor = "var(--egse-border-soft)";
            e.currentTarget.style.boxShadow = "var(--egse-shadow-panel)";
          }}
        >
          {/* Card Header with Satellite Designation */}
          <div className="egse-panel-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <div
                className="p-1 rounded d-flex align-items-center justify-content-center"
                style={{
                  background: "rgba(6, 182, 212, 0.15)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  color: "var(--egse-raw)",
                }}
              >
                <Satellite size={17} />
              </div>
              <h3 className="egse-panel-title mb-0 fs-6">{project.name}</h3>
            </div>

            {(canManageProjects || canDeleteProject) && (
              <div className="d-flex align-items-center gap-2">
                {canManageProjects && <button
                  className="btn btn-sm btn-link text-info p-0 opacity-75 hover-opacity-100"
                  onClick={handleEdit}
                  title="Edit project"
                >
                  <Edit2 size={14} />
                </button>}
                {canDeleteProject && <button
                  className="btn btn-sm btn-link text-danger p-0 opacity-75 hover-opacity-100"
                  onClick={handleDelete}
                  title="Delete project"
                >
                  <Trash2 size={14} />
                </button>}
              </div>
            )}
          </div>

          {/* Card Body */}
          <div className="egse-panel-body d-flex flex-column gap-3 flex-grow-1">
            <div>
              <div className="small text-muted mb-1" style={{ fontSize: "0.74rem", letterSpacing: "0.03em" }}>
                TARGET SATELLITE PLATFORM
              </div>
              <div className="fw-semibold" style={{ fontSize: "0.95rem", color: "var(--egse-text-primary)" }}>
                {project.satelliteName || "Unspecified Platform"}
              </div>
            </div>

            {project.description && (
              <p
                className="small mb-0 text-truncate"
                style={{ color: "var(--egse-text-secondary)" }}
                title={project.description}
              >
                {project.description}
              </p>
            )}

            <div>
              <div className="small text-muted mb-1" style={{ fontSize: "0.74rem", letterSpacing: "0.03em" }}>
                CONFIGURED SUBSYSTEMS ({subsystems.length})
              </div>
              <div className="d-flex flex-wrap gap-1">
                {subsystems.length > 0 ? (
                  subsystems.map((sub, i) => (
                    <span
                      key={i}
                      className="badge d-inline-flex align-items-center gap-1"
                      style={{
                        background: "var(--egse-raw-bg)",
                        color: "var(--egse-raw)",
                        border: "1px solid var(--egse-raw-border)",
                        fontSize: "0.72rem",
                        fontWeight: 500,
                      }}
                    >
                      <Cpu size={10} /> {sub}
                    </span>
                  ))
                ) : (
                  <span className="small text-muted fst-italic" style={{ fontSize: "0.75rem" }}>
                    No subsystems defined
                  </span>
                )}
              </div>
            </div>

            <div className="d-flex flex-column flex-sm-row gap-2 mt-auto">
              <button
                className="btn btn-sm btn-egse-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                onClick={openProject}
              >
                <span>Open Mission Workspace</span>
                <ArrowRight size={14} />
              </button>
              {canOpenConfiguration && (
                <button
                  type="button"
                  className="btn btn-sm btn-egse-outline d-flex align-items-center justify-content-center gap-2"
                  onClick={openConfiguration}
                  title={`Configure ${project.name}`}
                >
                  <Sliders size={14} />
                  <span>Configure</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <EditProjectModal
        open={isEditOpen}
        project={project}
        onClose={() => setIsEditOpen(false)}
      />
      <DeleteProjectModal
        open={isDeleteOpen}
        project={project}
        onClose={() => setIsDeleteOpen(false)}
      />
    </>
  );
}
