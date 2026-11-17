import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { updateProject } from "../../../redux/slices/projectsSlice";
import { X, Satellite, AlertCircle } from "lucide-react";

export default function EditProjectModal({ open, project, onClose }) {
  const dispatch = useDispatch();

  const [name, setName] = useState("");
  const [satelliteName, setSatelliteName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setSatelliteName(project.satelliteName || "");
      setDescription(project.description || "");
      setError("");
    }
  }, [project]);

  if (!open || !project) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Mission project name is required.");
      return;
    }
    if (!satelliteName.trim()) {
      setError("Satellite designation is required.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const projectId = project._id || project.id;
      const res = await dispatch(
        updateProject({
          projectId,
          data: {
            name: name.trim(),
            satelliteName: satelliteName.trim(),
            description: description.trim(),
          },
        })
      );

      if (res.error) {
        throw new Error(res.payload || "Failed to update project settings");
      }

      onClose();
    } catch (err) {
      setError(err.message || "Failed to update project");
    } finally {
      setIsSubmitting(false);
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
    >
      <div
        className="egse-panel p-4"
        style={{ width: "min(500px, 96vw)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2" style={{ borderColor: "var(--egse-border-soft)" }}>
          <div className="d-flex align-items-center gap-2">
            <Satellite size={20} className="text-info" />
            <h2 className="egse-heading h5 mb-0">Edit Mission Project</h2>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted p-0"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-3">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Project Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control form-control-sm egse-field"
              placeholder="e.g., SAT_DEMO_01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Satellite Designation / Model <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control form-control-sm egse-field"
              placeholder="e.g., EGY-SAT-2"
              value={satelliteName}
              onChange={(e) => setSatelliteName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label small fw-semibold text-secondary mb-1">
              Mission Description
            </label>
            <textarea
              className="form-control form-control-sm egse-field"
              rows={3}
              placeholder="Enter brief mission description and objectives..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="d-flex justify-content-end gap-2 pt-2 border-top" style={{ borderColor: "var(--egse-border-soft)" }}>
            <button
              type="button"
              className="btn btn-sm btn-egse-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-egse-primary d-flex align-items-center gap-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
