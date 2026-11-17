import { useState } from "react";
import StatusChip from "../../../components/common/StatusChip";
import { UserX, UserCheck, Trash2, Pencil } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../../redux/slices/authSlice";
import ConfirmStatusModal from "./ConfirmStatusModal";
import ConfirmDeleteUserModal from "./ConfirmDeleteUserModal";

export default function TesterTable({
  testers = [],
  pagination = {},
  onPageChange,
  onToggleStatus,
  onDeleteUser,
  onEditUser,
}) {
  const user = useSelector(selectUser);
  const currentUserId = user?._id || user?.id;
  const [statusModalUser, setStatusModalUser] = useState(null);
  const [deleteModalUser, setDeleteModalUser] = useState(null);

  const currentPage = pagination.page || 1;
  const limit = pagination.limit || 50;
  const totalCount = pagination.total !== undefined ? pagination.total : testers.length;
  const totalPages = pagination.totalPages || Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="egse-panel">
      <div className="egse-panel-header d-flex align-items-center justify-content-between">
        <h3 className="egse-panel-title mb-0">
          👥 Mission Engineers & Testers Directory ({totalCount})
        </h3>
      </div>
      <div className="egse-panel-body p-0" style={{ overflowX: "auto" }}>
        <table className="table egse-table mb-0 align-middle">
          <thead>
            <tr>
              <th className="ps-3">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Status</th>
              <th className="pe-3 text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {testers.length > 0 ? (
              testers.map((t) => {
                const id = t._id || t.id;
                const isActive = t.isActive !== false;
                const isDev = t.role === "admin";
                const displayRole = t.teamRole || t.role || "tester";
                const roleStyle = {
                  admin: { color: "var(--egse-role-admin-fg, #fbbf24)", borderColor: "var(--egse-role-admin-bd, rgba(251,191,36,.45))", backgroundColor: "var(--egse-role-admin-bg, rgba(251,191,36,.12))" },
                  lead: { color: "var(--egse-role-lead-fg, #67e8f9)", borderColor: "var(--egse-role-lead-bd, rgba(103,232,249,.4))", backgroundColor: "var(--egse-role-lead-bg, rgba(103,232,249,.1))" },
                  designer: { color: "var(--egse-role-designer-fg, #c4b5fd)", borderColor: "var(--egse-role-designer-bd, rgba(196,181,253,.4))", backgroundColor: "var(--egse-role-designer-bg, rgba(196,181,253,.1))" },
                  tester: { color: "var(--egse-role-tester-fg, #cbd5e1)", borderColor: "var(--egse-role-tester-bd, rgba(203,213,225,.35))", backgroundColor: "var(--egse-role-tester-bg, rgba(203,213,225,.08))" },
                }[displayRole] || { color: "var(--egse-role-lead-fg, #67e8f9)", borderColor: "var(--egse-role-lead-bd, rgba(103,232,249,.4))", backgroundColor: "var(--egse-role-lead-bg, rgba(103,232,249,.1))" };

                return (
                  <tr key={id}>
                    <td className="ps-3 fw-semibold text-light">{t.name}</td>
                    <td className="egse-mono small" style={{ color: "var(--egse-text-secondary)" }}>
                      {t.email}
                    </td>
                    <td>
                      <span
                        className="badge text-capitalize border"
                        style={roleStyle}
                      >
                        {displayRole}
                      </span>
                    </td>
                    <td className="small" style={{ maxWidth: 260 }}>
                      {Array.isArray(t.permissions) && t.permissions.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {t.permissions.map((p, i) => (
                            <span
                              key={i}
                              className="badge bg-dark border text-muted"
                              style={{ fontSize: "0.68rem" }}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted fst-italic">—</span>
                      )}
                    </td>
                    <td>
                      <StatusChip
                        level={isActive ? "nominal" : "alarm"}
                        label={isActive ? "ACTIVE" : "SUSPENDED"}
                      />
                    </td>
                    <td className="pe-3 text-end">
                      {currentUserId && (String(id) === String(currentUserId) || t.email === user?.email) ? (
                        <div className="d-inline-flex flex-wrap justify-content-end align-items-center gap-1">
                          <span className="badge bg-secondary bg-opacity-25 text-muted border border-secondary" style={{ fontSize: "0.72rem" }}>
                            Current Session
                          </span>
                          {onEditUser && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
                              style={{ fontSize: "0.78rem" }}
                              onClick={() => onEditUser(t)}
                              title="Edit Profile & Permissions"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          )}
                        </div>
                      ) : !isDev ? (
                        <div className="d-inline-flex flex-wrap justify-content-end gap-1">
                          {onEditUser && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
                              style={{ fontSize: "0.78rem" }}
                              onClick={() => onEditUser(t)}
                              title={`Edit ${t.name}`}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          )}
                          <button
                            className={`btn btn-sm ${
                              isActive ? "btn-outline-danger" : "btn-outline-success"
                            } d-inline-flex align-items-center gap-1`}
                            style={{ fontSize: "0.78rem" }}
                            onClick={() => setStatusModalUser(t)}
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
                          {onDeleteUser && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                              style={{ fontSize: "0.78rem" }}
                              onClick={() => setDeleteModalUser(t)}
                              title={`Delete ${t.name}`}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-4 text-muted small">
                  No tester accounts found. Click "Add User" or import via Excel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {onPageChange && (
        <div
          className="p-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2"
          style={{ borderColor: "var(--egse-border-soft)", fontSize: "0.85rem" }}
        >
          <div style={{ color: "var(--egse-text-muted)" }}>
            Showing{" "}
            <strong className="text-light">
              {totalCount === 0 ? 0 : (currentPage - 1) * limit + 1}
            </strong>
            {" - "}
            <strong className="text-light">
              {Math.min(currentPage * limit, totalCount)}
            </strong>
            {" of "}
            <strong className="text-light">{totalCount}</strong> users
            {totalPages > 1 && (
              <span> (Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>)</span>
            )}
          </div>

          <div className="d-flex align-items-center gap-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))
              .map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`btn btn-sm ${
                    pageNum === currentPage ? "btn-info" : "btn-outline-secondary"
                  }`}
                  onClick={() => onPageChange(pageNum)}
                >
                  {pageNum}
                </button>
              ))}

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog before Suspend / Reactivate */}
      <ConfirmStatusModal
        open={Boolean(statusModalUser)}
        user={statusModalUser}
        onConfirm={(targetUser) => {
          onToggleStatus?.(targetUser);
        }}
        onClose={() => setStatusModalUser(null)}
      />
      <ConfirmDeleteUserModal
        user={deleteModalUser}
        onConfirm={onDeleteUser}
        onClose={() => setDeleteModalUser(null)}
      />
    </div>
  );
}