import { useState } from "react";
import { useDispatch } from "react-redux";
import { createProject, createSubsystem } from "../../../redux/slices/projectsSlice";
import { X, Plus, Satellite, Cpu, AlertCircle } from "lucide-react";

export default function NewProjectModal({ open, onClose }) {
  const dispatch = useDispatch();

  const [name, setName] = useState("");
  const [satelliteName, setSatelliteName] = useState("");
  const [description, setDescription] = useState("");
  const [subsystems, setSubsystems] = useState([]);
  const [newSubName, setNewSubName] = useState("");
  const [newSubCode, setNewSubCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleAddSubsystem = () => {
    const cleanName = newSubName.trim();
    const cleanCode = newSubCode.trim().toUpperCase();
    if (!cleanName) {
      setError("Subsystem name is required.");
      return;
    }
    if (!cleanCode || !/^[0-9A-F]{4}$/i.test(cleanCode)) {
      setError("Subsystem code must be a 4-character hex string (e.g., 0A01).");
      return;
    }
    if (subsystems.some((s) => s.name.toUpperCase() === cleanName.toUpperCase())) {
      setError(`Subsystem name "${cleanName}" is already added.`);
      return;
    }
    if (subsystems.some((s) => s.code.toUpperCase() === cleanCode)) {
      setError(`Subsystem code "${cleanCode}" is already in use.`);
      return;
    }
    setSubsystems([...subsystems, { name: cleanName, code: cleanCode }]);
    setNewSubName("");
    setNewSubCode("");
    setError("");
  };

  const handleRemoveSubsystem = (codeToRemove) => {
    setSubsystems(subsystems.filter((s) => s.code !== codeToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Mission project name is required.");
      return;
    }
    if (!satelliteName.trim()) {
      setError("Satellite name is required.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const projAction = await dispatch(
        createProject({
          name: name.trim(),
          satelliteName: satelliteName.trim(),
          description: description.trim(),
        })
      );

      if (projAction.error) {
        throw new Error(projAction.payload || "Failed to create project");
      }

      const createdProject = projAction.payload;
      const projectId = createdProject._id || createdProject.id;

      // Create initial subsystems in MongoDB for this project
      for (const sub of subsystems) {
        await dispatch(
          createSubsystem({
            projectId,
            data: {
              name: sub.name,
              subsystemCode: sub.code,
              protocol: createdProject.protocol || "Generic",
            },
          })
        );
      }

      onClose();
    } catch (err) {
      setError(err.message || "Failed to create project");
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
        style={{ width: "min(520px, 96vw)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="d-flex align-items-center justify-content-between pb-3 border-bottom mb-3" style={{ borderColor: "var(--egse-border-soft)" }}>
          <div className="d-flex align-items-center gap-2">
            <Satellite size={20} className="text-info" />
            <h2 className="egse-heading h5 mb-0">Create Mission Project</h2>
          </div>
          <button className="btn btn-sm btn-link text-muted p-0" onClick={onClose}>
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
            <label className="form-label small text-muted">Mission Project Name *</label>
            <input
              type="text"
              className="form-control egse-field"
              placeholder="e.g., EGYPT-SAT-2B"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label small text-muted">Satellite Identifier / Model *</label>
            <input
              type="text"
              className="form-control egse-field"
              placeholder="e.g., LEO-MicroSat-400"
              value={satelliteName}
              onChange={(e) => setSatelliteName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label small text-muted">Description / Campaign Notes</label>
            <textarea
              className="form-control egse-field"
              rows={2}
              placeholder="Primary ground testing phase for power and ADCS subsystems..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label small text-muted">Initial Subsystems (Optional)</label>
            <div className="d-flex gap-2 mb-2">
              <input
                type="text"
                className="form-control form-control-sm egse-field"
                placeholder="Subsystem Name (e.g. COMM)"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
              />
              <input
                type="text"
                maxLength={4}
                className="form-control form-control-sm egse-field egse-mono"
                style={{ maxWidth: "110px" }}
                placeholder="Hex (0A01)"
                value={newSubCode}
                onChange={(e) => setNewSubCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubsystem();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
                onClick={handleAddSubsystem}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            <div className="d-flex flex-wrap gap-2">
              {subsystems.map((sub) => (
                <span
                  key={sub.code}
                  className="badge d-inline-flex align-items-center gap-1 py-1 px-2"
                  style={{
                    background: "rgba(6, 182, 212, 0.15)",
                    color: "var(--egse-raw)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    fontSize: "0.78rem",
                  }}
                >
                  <Cpu size={12} /> {sub.name} ({sub.code})
                  <button
                    type="button"
                    className="btn btn-link p-0 text-muted hover-text-white ms-1"
                    onClick={() => handleRemoveSubsystem(sub.code)}
                    style={{ lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 pt-3 border-top mt-2" style={{ borderColor: "var(--egse-border-soft)" }}>
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
              className="btn btn-sm btn-egse-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating Project..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
