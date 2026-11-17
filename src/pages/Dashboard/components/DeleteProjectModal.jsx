import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { deleteProject } from "../../../redux/slices/projectsSlice";
import { AlertTriangle, Trash2, X, Loader2, Satellite } from "lucide-react";

export default function DeleteProjectModal({ open, project, onClose }) {
  const dispatch = useDispatch();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setIsDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isDeleting, onClose]);

  if (!open || !project) return null;

  const projectId = project._id || project.id;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");

    try {
      const res = await dispatch(deleteProject(projectId));
      if (res.error) {
        throw new Error(res.payload || "Failed to delete project");
      }
      onClose();
    } catch (err) {
      setError(err.message || "An unexpected error occurred while deleting the project.");
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{
        backgroundColor: "rgba(3, 7, 18, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 1050,
      }}
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        className="egse-panel p-4"
        style={{
          width: "min(460px, 94vw)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          boxShadow: "0 0 32px rgba(239, 68, 68, 0.18)",
          borderRadius: "10px",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2"
          style={{ borderColor: "var(--egse-border-soft, rgba(255,255,255,0.08))" }}
        >
          <div className="d-flex align-items-center gap-2">
            <div
              className="p-2 rounded-circle d-flex align-items-center justify-content-center"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--egse-alarm, #ef4444)",
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <h2 id="delete-project-title" className="egse-heading h5 mb-0 text-danger">
              Delete Mission Project
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted p-0"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-3">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="d-flex flex-column gap-3 mb-4">
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary, #94a3b8)", lineHeight: 1.6 }}>
            Are you sure you want to permanently delete this mission project? This action cannot be undone and will delete all associated configurations, telemetry data, and logs.
          </p>

          <div
            className="p-3 rounded d-flex align-items-center gap-3"
            style={{
              background: "rgba(15, 23, 42, 0.5)",
              border: "1px solid var(--egse-border-soft, rgba(255,255,255,0.08))",
            }}
          >
            <div
              className="p-2 rounded d-flex align-items-center justify-content-center"
              style={{
                background: "rgba(6, 182, 212, 0.12)",
                color: "var(--egse-raw, #06b6d4)",
              }}
            >
              <Satellite size={22} />
            </div>
            <div className="overflow-hidden">
              <div className="fw-bold text-truncate" style={{ color: "var(--egse-text-primary, #f8fafc)" }}>
                {project.name}
              </div>
              <div className="small text-muted text-truncate" style={{ fontSize: "0.78rem" }}>
                Target Platform: {project.satelliteName || "Unspecified"}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="d-flex justify-content-end gap-2 pt-2 border-top" style={{ borderColor: "var(--egse-border-soft, rgba(255,255,255,0.08))" }}>
          <button
            type="button"
            className="btn btn-sm btn-egse-outline px-3"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger d-flex align-items-center gap-2 px-3"
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              boxShadow: "0 0 14px rgba(239, 68, 68, 0.3)",
            }}
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="spinner-border spinner-border-sm" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={14} />
                <span>Delete Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
