import { useState } from "react";
import StatusChip from "../../../components/common/StatusChip";
import { ShieldCheck, UserX, UserCheck, Pencil } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../../redux/slices/authSlice";
import ConfirmStatusModal from "./ConfirmStatusModal";

export default function DeveloperTable({ developers = [], onToggleStatus, onEditUser }) {
  const currentUser = useSelector(selectUser);
  const currentUserId = currentUser?._id || currentUser?.id;
  const [statusModalUser, setStatusModalUser] = useState(null);

  return (
    <div className="egse-panel">
      <div className="egse-panel-header d-flex align-items-center justify-content-between">
        <h3 className="egse-panel-title mb-0 d-flex align-items-center gap-2">
          <ShieldCheck size={18} className="text-warning" />
          <span>System Administrators ({developers.length})</span>
        </h3>
      </div>
      <div className="egse-panel-body p-0" style={{ overflowX: "auto" }}>
        <table className="table egse-table mb-0 align-middle">
          <thead>
            <tr>
              <th className="ps-3">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created At</th>
              <th>Status</th>
              <th className="pe-3 text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {developers.length > 0 ? (
              developers.map((dev) => {
                const id = dev._id || dev.id;
                const isActive = dev.isActive !== false;
                const isCurrentSession = currentUserId && (id === currentUserId || dev.email === currentUser?.email);

                return (
                  <tr key={id}>
                    <td className="ps-3 fw-semibold text-light">{dev.name}</td>
                    <td className="egse-mono small" style={{ color: "var(--egse-text-secondary)" }}>
                      {dev.email}
                    </td>
                    <td>
                      <span className="badge bg-warning bg-opacity-20 text-warning border border-warning text-uppercase">
                        Admin
                      </span>
                    </td>
                    <td className="small text-muted">
                      {dev.createdAt ? new Date(dev.createdAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td>
                      <StatusChip
                        level={isActive ? "nominal" : "alarm"}
                        label={isActive ? "ACTIVE" : "SUSPENDED"}
                      />
                    </td>
                    <td className="pe-3 text-end">
                      <div className="d-inline-flex flex-wrap justify-content-end align-items-center gap-1">
                        {isCurrentSession && (
                          <span
                            className="badge bg-secondary bg-opacity-25 text-muted border border-secondary"
                            style={{ fontSize: "0.72rem" }}
                          >
                            Current Session
                          </span>
                        )}
                        {onEditUser && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
                            style={{ fontSize: "0.78rem" }}
                            onClick={() => onEditUser(dev)}
                            title={`Edit ${dev.name}`}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                        )}
                        {!isCurrentSession && (
                          <button
                            className={`btn btn-sm ${
                              isActive ? "btn-outline-danger" : "btn-outline-success"
                            } d-inline-flex align-items-center gap-1`}
                            style={{ fontSize: "0.78rem" }}
                            onClick={() => setStatusModalUser(dev)}
                          >
                            {isActive ? (
                              <>
                                <UserX size={13} /> Suspend
                              </>
                            ) : (
                              <>
                                <UserCheck size={13} /> Reactivate
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-4 text-muted small">
                  No admin accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmStatusModal
        open={Boolean(statusModalUser)}
        user={statusModalUser}
        onConfirm={(targetDev) => {
          onToggleStatus?.(targetDev);
        }}
        onClose={() => setStatusModalUser(null)}
      />
    </div>
  );
}
