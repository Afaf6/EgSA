import React from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export default function ConfirmStatusModal({ open, user, onConfirm, onClose }) {
  if (!open || !user) return null;

  const isSuspending = user.isActive !== false;
  const isDev = user.role === "admin";

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 1060, backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-status-modal-title"
    >
      <div
        className="egse-panel p-4"
        style={{
          width: "min(480px, 94vw)",
          border: isSuspending ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(34, 197, 94, 0.4)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            {isSuspending ? (
              <AlertTriangle size={20} className="text-danger" />
            ) : (
              <CheckCircle2 size={20} className="text-success" />
            )}
            <h3 id="confirm-status-modal-title" className="egse-heading h6 mb-0">
              {isSuspending ? "Confirm Account Suspension" : "Confirm Account Reactivation"}
            </h3>
          </div>
          <button
            type="button"
            className="btn-close btn-close-white"
            onClick={onClose}
            aria-label="Close"
          ></button>
        </div>

        <div className="mb-4">
          <p className="mb-2" style={{ color: "var(--egse-text-primary, #f1f5f9)" }}>
            Are you sure you want to {isSuspending ? "suspend" : "reactivate"}{" "}
            <strong>{user.name}</strong> (
            <span className="egse-mono text-info small">{user.email}</span>)?
          </p>
          {isSuspending ? (
            <div
              className="p-3 rounded small"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--egse-alarm-text, #fca5a5)",
              }}
            >
              <strong>Notice:</strong> Active sessions will be terminated immediately. The user will be evicted from all project rooms, live telemetry streams, and API access will be revoked.
            </div>
          ) : (
            <div
              className="p-3 rounded small"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                color: "var(--egse-nominal-text, #86efac)",
              }}
            >
              The user account will be reactivated, restoring authorization to log in and access permitted project workspaces.
            </div>
          )}
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary px-3"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${isSuspending ? "btn-danger" : "btn-success"} px-3`}
            onClick={() => {
              onConfirm(user);
              onClose();
            }}
          >
            {isSuspending ? "Suspend Account" : "Reactivate Account"}
          </button>
        </div>
      </div>
    </div>
  );
}