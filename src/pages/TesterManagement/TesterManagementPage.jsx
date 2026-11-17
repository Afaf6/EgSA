import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchUsers,
  fetchDevelopers,
  createTester,
  updateUser,
  updateDeveloperStatus,
  importTesters,
  deleteUser,
} from "../../redux/slices/usersSlice";
import { selectUser, fetchCurrentUser } from "../../redux/slices/authSlice";
import TesterTable from "./components/TesterTable";
import DeveloperTable from "./components/DeveloperTable";
import AddTesterModal from "./components/AddTesterModal";
import EditUserModal from "./components/EditUserModal";
import { Users, UserPlus, Upload, RefreshCw, AlertCircle, Check, ShieldCheck } from "lucide-react";
import { fetchProjects } from "../../redux/slices/projectsSlice";
import { summarizeImportReport } from "../../utils/importReport";

export default function TesterManagementPage() {
  const dispatch = useDispatch();
  const currentUser = useSelector(selectUser);
  const projects = useSelector((state) => state.projects?.projects) || [];
  const { users, developers, pagination, isLoading, error, importReport } = useSelector((state) => state.users);
  const [modalOpen, setModalOpen] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [activeTab, setActiveTab] = useState("testers");
  const [editingUser, setEditingUser] = useState(null);
  const fileInputRef = useRef(null);

  const isDeveloper = currentUser?.role === "admin" || currentUser?.role === "developer";
  const canManageUsers = isDeveloper || currentUser?.permissions?.includes("manage_users");

  useEffect(() => {
    dispatch(fetchUsers({ page: 1, limit: 50 }));
    if (isDeveloper) {
      dispatch(fetchDevelopers());
    }
  }, [dispatch, isDeveloper]);

  const handlePageChange = (newPage) => {
    dispatch(fetchUsers({ page: newPage, limit: 50 }));
  };

  const toggleStatus = async (user) => {
    const userId = user._id || user.id;
    const newStatus = !user.isActive;
    await dispatch(updateUser({ userId, data: { isActive: newStatus } }));
  };

  const toggleDeveloperStatus = async (dev) => {
    const devId = dev._id || dev.id;
    const newStatus = !dev.isActive;
    await dispatch(updateDeveloperStatus({ developerId: devId, isActive: newStatus }));
  };

  const handleAddTester = async (newTester) => {
    await dispatch(createTester(newTester)).unwrap();
  };

  const handleOpenEditUser = (userToEdit) => {
    dispatch(fetchProjects({ page: 1, limit: 100 }));
    setEditingUser(userToEdit);
  };

  const handleSaveEditedUser = async (updatedData) => {
    if (!editingUser) return;
    const userId = editingUser._id || editingUser.id;
    await dispatch(updateUser({ userId, data: updatedData })).unwrap();
    if (isDeveloper) {
      dispatch(fetchDevelopers());
    }
    const currentId = currentUser?._id || currentUser?.id;
    if (String(userId) === String(currentId)) {
      dispatch(fetchCurrentUser());
    }
  };
  const handleDeleteUser = async (user) => {
    await dispatch(deleteUser(user._id || user.id)).unwrap();
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportNotice({ tone: "info", text: "Uploading and parsing Excel file...", rows: [] });
    const result = await dispatch(importTesters(file));
    if (!result.error) {
      // What the server actually did with each row, not just that the request succeeded.
      setImportNotice(summarizeImportReport(result.payload));
    } else {
      setImportNotice({ tone: "danger", text: `Import failed: ${result.payload || result.error.message || "Server error"}. No users were imported.`, rows: [] });
    }
    e.target.value = "";
  };

  if (!canManageUsers) {
    return (
      <div className="container py-5 text-center">
        <div className="card egse-panel border-danger p-4 mx-auto" style={{ maxWidth: '520px' }}>
          <AlertCircle size={48} className="text-danger mx-auto mb-3" />
          <h2 className="h4 text-danger mb-2">403 Forbidden</h2>
          <p className="text-muted mb-0">
            Access Restricted: You need the manage users permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <Users size={22} className="text-info" />
            <h1 className="egse-heading h4 mb-0">Team & Tester Management</h1>
          </div>
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            Provision user accounts, assign telemetry permissions, and manage mission engineer access
          </p>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            hidden
            onChange={handleExcelImport}
          />
          <button
            className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} /> Batch Import (Excel)
          </button>
          <button
            className="btn btn-sm btn-egse-primary d-flex align-items-center gap-1"
            onClick={() => { dispatch(fetchProjects({ page: 1, limit: 100 })); setModalOpen(true); }}
          >
            <UserPlus size={14} /> Add User
          </button>
          <button
            className="btn btn-sm btn-egse-outline"
            onClick={() => dispatch(fetchUsers({ page: pagination?.page || 1, limit: 50 }))}
            title="Reload user list"
          >
            <RefreshCw size={14} className={isLoading ? "spinner-border spinner-border-sm" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-3">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {importNotice && (
        <div className={`alert alert-${importNotice.tone} py-2 small mb-3`} role="status" data-testid="import-result">
          <div className="d-flex align-items-center gap-2">
            {importNotice.tone === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{importNotice.text}</span>
            <button type="button" className="btn-close ms-auto" aria-label="Dismiss import result" onClick={() => setImportNotice("")} />
          </div>
          {importNotice.rows.length > 0 && (
            <ul className="mb-0 mt-2 ps-4" data-testid="import-row-issues">
              {importNotice.rows.map((r) => (
                <li key={`${r.kind}-${r.row}-${r.email}`}>
                  Row {r.row} ({r.email}): <strong>{r.kind}</strong> — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isDeveloper && (
        <div className="d-flex align-items-center gap-2 mb-3 border-bottom pb-2" style={{ borderColor: "var(--egse-border)" }}>
          <button
            className={`btn btn-sm ${
              activeTab === "testers" ? "btn-egse-primary" : "btn-egse-outline"
            } d-flex align-items-center gap-1`}
            onClick={() => setActiveTab("testers")}
          >
            <Users size={14} /> Mission Engineers & Testers ({pagination?.total ?? users.length})
          </button>
          <button
            className={`btn btn-sm ${
              activeTab === "developers" ? "btn-egse-primary" : "btn-egse-outline"
            } d-flex align-items-center gap-1`}
            onClick={() => setActiveTab("developers")}
          >
            <ShieldCheck size={14} /> System Administrators ({developers.length})
          </button>
        </div>
      )}

      {activeTab === "testers" ? (
        <TesterTable
          testers={users}
          pagination={pagination}
          onPageChange={handlePageChange}
          onToggleStatus={toggleStatus}
          onDeleteUser={handleDeleteUser}
          onEditUser={handleOpenEditUser}
        />
      ) : (
        <DeveloperTable developers={developers} onToggleStatus={toggleDeveloperStatus} onEditUser={handleOpenEditUser} />
      )}
      <AddTesterModal open={modalOpen} projects={projects} onClose={() => setModalOpen(false)} onAdd={handleAddTester} />
      <EditUserModal
        open={Boolean(editingUser)}
        user={editingUser}
        projects={projects}
        onClose={() => setEditingUser(null)}
        onSave={handleSaveEditedUser}
      />
    </div>
  );
}
