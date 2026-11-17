import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function ConfirmDeleteUserModal({ user, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError("");
    try {
      await onConfirm(user);
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : err?.message || "Failed to delete this user.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.68)", zIndex: 1060, backdropFilter: "blur(4px)" }}
      onClick={() => !deleting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-user-title"
    >
      <div
        className="egse-panel p-4"
        style={{ width: "min(460px, 94vw)", border: "1px solid rgba(239,68,68,.45)", boxShadow: "0 10px 40px rgba(0,0,0,.7)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center gap-2 mb-3">
          <AlertTriangle size={20} className="text-danger" />
          <h3 id="confirm-delete-user-title" className="egse-heading h6 mb-0">Delete User</h3>
        </div>
        <p className="mb-3" style={{ color: "var(--egse-text-primary)" }}>
          Delete <strong>{user.name}</strong> ({user.email})? This action cannot be undone.
        </p>
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-danger d-inline-flex align-items-center gap-1" onClick={handleConfirm} disabled={deleting}>
            <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete User"}
          </button>
        </div>
      </div>
    </div>
  );
}
