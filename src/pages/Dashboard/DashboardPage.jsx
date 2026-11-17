import { useState, useMemo, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Search, X, FolderSearch, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import KpiBar from "./components/KpiBar";
import ProjectCard from "./components/ProjectCard";
import NewProjectModal from "./components/NewProjectModal";
import {
  selectProjects,
  createProject,
  fetchProjects,
  selectProjectsPagination,
  selectProjectsLoading,
} from "../../redux/slices/projectsSlice";
import { selectCanManageProjects } from "../../redux/slices/authSlice";

const PROJECTS_PER_PAGE = 12;

export default function DashboardPage() {
  const dispatch = useDispatch();
  const rawProjects = useSelector(selectProjects);
  const projects = Array.isArray(rawProjects) ? rawProjects : [];
  const canCreateProject = useSelector(selectCanManageProjects);
  const pagination = useSelector(selectProjectsPagination);
  const isLoading = useSelector(selectProjectsLoading);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    dispatch(fetchProjects({ page: 1, limit: PROJECTS_PER_PAGE }));
  }, [dispatch]);

  const totalInDb = pagination?.total ?? projects.length;
  const currentPage = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const limit = pagination?.limit ?? PROJECTS_PER_PAGE;

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage || isLoading) return;
    dispatch(fetchProjects({ page: newPage, limit: PROJECTS_PER_PAGE }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startItem = totalInDb === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(totalInDb, (currentPage - 1) * limit + projects.length);

  const handleCreateProject = async (projectData) => {
    const result = await dispatch(createProject(projectData));
    if (createProject.fulfilled.match(result)) {
      await dispatch(fetchProjects({ page: 1, limit: PROJECTS_PER_PAGE }));
    }
    return result;
  };

  // Filter projects by search query (name, satellite name, description, protocol, or subsystems)
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const name = (project.name || "").toLowerCase();
      const sat = (project.satelliteName || "").toLowerCase();
      const desc = (project.description || "").toLowerCase();
      const protocol = (project.mainTlmProtocol || project.protocol || "").toLowerCase();
      const subs = Array.isArray(project.subsystems)
        ? project.subsystems
          .map((s) => (typeof s === "string" ? s : s?.name || s?.subsystemCode || ""))
          .join(" ")
          .toLowerCase()
        : "";
      return (
        name.includes(q) ||
        sat.includes(q) ||
        desc.includes(q) ||
        protocol.includes(q) ||
        subs.includes(q)
      );
    });
  }, [projects, searchQuery]);

  return (
    <div>
      {/* Top Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="egse-heading h4 mb-1">Mission & Projects Dashboard</h1>
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            Overview of every active mission and its telemetry status
          </p>
        </div>
        {canCreateProject && <button
          className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={16} />
          <span>New Project</span>
        </button>}
      </div>

      {/* <KpiBar /> */}

      {/* Projects Section Header with Search Bar */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 mt-4">
        <div className="d-flex align-items-center gap-2">
          <h2 className="egse-heading h6 mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            Projects
          </h2>
          <span
            className="badge rounded-pill"
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.15)",
              color: "var(--egse-raw)",
              border: "1px solid rgba(6, 182, 212, 0.3)",
              fontSize: "0.75rem",
            }}
          >
            {searchQuery
              ? `${filteredProjects.length} / ${projects.length}`
              : `${totalInDb} Projects`}
          </span>
        </div>

        {/* Project Search Input */}
        <div style={{ minWidth: "260px", maxWidth: "420px", width: "100%" }}>
          <div className="input-group input-group-sm">
            <span
              className="input-group-text border-end-0"
              style={{
                backgroundColor: "var(--egse-bg-raised)",
                borderColor: "var(--egse-border-soft)",
                color: "var(--egse-text-muted)",
              }}
            >
              <Search size={15} />
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              placeholder="Search projects by name or satellite..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: "var(--egse-bg-raised)",
                borderColor: "var(--egse-border-soft)",
                color: "var(--egse-text-primary)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-outline-secondary border-start-0"
                style={{
                  backgroundColor: "var(--egse-bg-raised)",
                  borderColor: "var(--egse-border-soft)",
                  color: "var(--egse-text-muted)",
                }}
                onClick={() => setSearchQuery("")}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Projects Grid / Empty State */}
      {filteredProjects.length === 0 ? (
        <div
          className="p-5 text-center rounded"
          style={{
            backgroundColor: "var(--egse-bg-panel)",
            border: "1px dashed var(--egse-border-soft)",
          }}
        >
          <FolderSearch size={44} className="text-muted mb-2 opacity-50" />
          <h6 className="fw-bold mb-1" style={{ color: "var(--egse-text-primary)" }}>
            No projects found
          </h6>
          <p className="small mb-3" style={{ color: "var(--egse-text-muted)" }}>
            {searchQuery
              ? `No project matches "${searchQuery}". Check the project name or clear the search.`
              : "No projects have been added yet. Add one using New Project."}
          </p>
          {searchQuery && (
            <button
              type="button"
              className="btn btn-outline-info btn-sm px-3"
              onClick={() => setSearchQuery("")}
            >
              Clear search and show all projects
            </button>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {filteredProjects.map((project) => (
            <ProjectCard key={project._id || project.id} project={project} />
          ))}
        </div>
      )}

      {/* Pagination Footer */}
      {totalInDb > 0 && (
        <div
          className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-4 pt-3 border-top"
          style={{ borderColor: "var(--egse-border-soft, rgba(255, 255, 255, 0.08))" }}
        >
          {/* Total & Current Range */}
          <div className="small text-muted d-flex align-items-center gap-2">
            <span>
              Showing <strong className="text-light">{startItem}-{endItem}</strong> of{" "}
              <strong className="text-info">{totalInDb}</strong> projects
            </span>
            {searchQuery && (
              <span className="badge bg-secondary bg-opacity-25 text-info">
                Filtered: {filteredProjects.length}
              </span>
            )}
          </div>

          {/* Page Buttons: Previous / Page X of Y / Next */}
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1 px-3"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>

            <span
              className="px-3 py-1 small rounded border fw-medium"
              style={{
                backgroundColor: "var(--egse-bg-raised, #0f172a)",
                borderColor: "var(--egse-border-soft, rgba(255, 255, 255, 0.12))",
                color: "var(--egse-text-primary, #f8fafc)",
              }}
            >
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1 px-3"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
