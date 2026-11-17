import { useEffect, useRef, useState } from "react";
import { AVAILABLE_PERMISSIONS } from "../../../constants/telemetryConstants";
import { Eye, EyeOff, Shield, Key, ChevronDown, Search } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../../redux/slices/authSlice";
import { actorCanGrantFullProject, assignableRoles, buildProjectAccessPayload, grantsToState, hasIncompleteGrant } from "../../../utils/projectGrants";

export default function EditUserModal({ open, user, projects = [], onClose, onSave }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("tester");
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectAccess, setProjectAccess] = useState({});
  const [fullProjects, setFullProjects] = useState({});
  const actor = useSelector(selectUser);
  // F1/F13: Admin is offered only to an admin (the server refuses it from anyone else)
  const roleOptions = assignableRoles(actor);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [subsystemPickerProject, setSubsystemPickerProject] = useState(null);
  const accessPickerRef = useRef(null);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setPassword("");
    setRole(user.teamRole || user.role || "tester");
    setPermissions(Array.isArray(user.permissions) ? [...user.permissions] : []);
    setErrorMsg("");

    // { [projectId]: [subsystemIds] } plus the projects granted in full (F10)
    const { subsystemsByProject, fullProjects: storedFull } = grantsToState(user.projectAccess);
    setProjectAccess(subsystemsByProject);
    setFullProjects(storedFull);
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (event) => {
      if (!accessPickerRef.current?.contains(event.target)) {
        setProjectPickerOpen(false);
        setSubsystemPickerProject(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  if (!open || !user) return null;

  const togglePermission = (key) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const selectAllPermissions = () => {
    setPermissions(AVAILABLE_PERMISSIONS.map((p) => p.key));
  };

  const deselectAllPermissions = () => {
    setPermissions([]);
  };

  const toggleProject = (project, checked) => {
    const id = (project._id || project.id).toString();
    if (checked) {
      setProjectPickerOpen(false);
      setSubsystemPickerProject(id);
    } else if (subsystemPickerProject === id) {
      setSubsystemPickerProject(null);
    }
    setProjectAccess((prev) => {
      const next = { ...prev };
      if (!checked) delete next[id];
      else next[id] = [];
      return next;
    });
    if (!checked) setFullProjects((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const toggleFullProject = (projectId, checked) => {
    setFullProjects((prev) => {
      const next = { ...prev };
      if (checked) next[projectId] = true;
      else delete next[projectId];
      return next;
    });
    if (checked) {
      setSubsystemPickerProject(null);
      setProjectAccess((prev) => ({ ...prev, [projectId]: [] }));
    }
  };

  const toggleSubsystem = (projectId, subsystemId) => {
    const sId = (subsystemId?._id || subsystemId?.id || subsystemId).toString();
    setProjectAccess((prev) => {
      const selected = new Set(prev[projectId] || []);
      selected.has(sId) ? selected.delete(sId) : selected.add(sId);
      return { ...prev, [projectId]: [...selected] };
    });
  };

  const toggleAllSubsystems = (projectId, subsystems) => {
    const subsystemIds = subsystems.map((sub) => (sub._id || sub.id).toString());
    const allSelected =
      subsystemIds.length > 0 &&
      subsystemIds.every((id) => (projectAccess[projectId] || []).includes(id));
    setProjectAccess((prev) => ({
      ...prev,
      [projectId]: allSelected ? [] : subsystemIds,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Email address is required.");
      return;
    }
    if (password && password.length < 10) {
      setErrorMsg("If updating password, it must be at least 10 characters long.");
      return;
    }
    if (hasIncompleteGrant(projectAccess, fullProjects)) {
      setErrorMsg("For each selected project, choose Full project or at least one subsystem.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        teamRole: role,
        permissions,
        projectAccess: buildProjectAccessPayload(projectAccess, fullProjects),
      };

      if (password && password.trim()) {
        payload.password = password.trim();
      }

      await onSave(payload);
      onClose();
    } catch (error) {
      setErrorMsg(
        typeof error === "string"
          ? error
          : error?.response?.data?.message || error?.message || "Failed to update user."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, backdropFilter: "blur(4px)" }}
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="egse-panel p-4"
        style={{
          width: "min(620px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid var(--egse-border)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            <Shield size={20} className="text-info" />
            <h3 className="egse-heading h6 mb-0">Edit User: {user.name}</h3>
          </div>
          <button
            type="button"
            className="btn-close btn-close-white"
            onClick={() => !isSubmitting && onClose()}
            aria-label="Close"
          ></button>
        </div>

        {errorMsg && (
          <div className="alert alert-danger py-2 small mb-3">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Full Name *
            </label>
            <input
              type="text"
              required
              className="form-control egse-field"
              placeholder="e.g. Sarah Connor"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Email Address *
            </label>
            <input
              type="email"
              required
              className="form-control egse-field"
              placeholder="operator@egse.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Role *
            </label>
            <select
              className="form-select egse-field"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="form-text small">
              Team classification only; it grants nothing by itself. Only an admin can assign Admin.
            </div>
          </div>

          <div>
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Project &amp; Subsystem Access
            </label>
            <div ref={accessPickerRef}>
              <div className="position-relative">
                <button
                  type="button"
                  className="form-select egse-field text-start d-flex align-items-center justify-content-between"
                  onClick={() => setProjectPickerOpen((open) => !open)}
                  disabled={projects.length === 0}
                >
                  <span>
                    {projects.length === 0
                      ? "No projects available"
                      : `${Object.keys(projectAccess).length} project${Object.keys(projectAccess).length === 1 ? "" : "s"} selected`}
                  </span>
                  <ChevronDown size={15} />
                </button>
                {projectPickerOpen && (
                  <div
                    className="position-absolute start-0 end-0 mt-1 p-2 rounded shadow"
                    style={{
                      zIndex: 5,
                      background: "var(--egse-bg, #101722)",
                      border: "1px solid var(--egse-border)",
                      maxHeight: "240px",
                      overflowY: "auto",
                    }}
                  >
                    <div className="position-relative mb-2">
                      <Search size={14} className="position-absolute top-50 translate-middle-y ms-2 text-secondary" />
                      <input
                        className="form-control egse-field ps-4"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                      />
                    </div>
                    <div className="d-flex flex-column gap-1">
                      {projects
                        .filter((project) => project.name?.toLowerCase().includes(projectSearch.trim().toLowerCase()))
                        .map((project) => {
                          const projectId = (project._id || project.id).toString();
                          const selected = Object.hasOwn(projectAccess, projectId);
                          return (
                            <label key={projectId} className="d-flex gap-2 align-items-center small py-1 px-1">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => toggleProject(project, e.target.checked)}
                              />
                              {project.name}
                            </label>
                          );
                        })}
                      {projects.length > 0 &&
                        !projects.some((project) => project.name?.toLowerCase().includes(projectSearch.trim().toLowerCase())) && (
                          <span className="small text-secondary p-1">No matching projects.</span>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {Object.keys(projectAccess).length > 0 && (
                <div
                  className="d-flex flex-column gap-2 mt-2 p-2 rounded"
                  style={{ backgroundColor: "var(--egse-well, rgba(0,0,0,0.2))", border: "1px solid var(--egse-border)" }}
                >
                  {projects
                    .filter((project) => Object.hasOwn(projectAccess, (project._id || project.id).toString()))
                    .map((project) => {
                      const projectId = (project._id || project.id).toString();
                      const subs = project.subsystems || [];
                      const isFull = Boolean(fullProjects[projectId]);
                      const canGrantFull = actorCanGrantFullProject(actor, projectId);
                      return (
                        <div key={projectId} className="border-bottom border-secondary border-opacity-25 pb-2">
                          <div className="small fw-semibold mb-1">{project.name}</div>
                          <label className="d-flex gap-2 align-items-center small mb-1" title={canGrantFull ? "" : "Your own access to this project is limited to some subsystems"}>
                            <input type="checkbox" className="form-check-input mt-0" checked={isFull} disabled={!canGrantFull && !isFull} onChange={(e) => toggleFullProject(projectId, e.target.checked)} />
                            <span>Full project (every subsystem, including ones added later)</span>
                          </label>
                          <div className="position-relative">
                            <button
                              type="button"
                              className="form-select egse-field text-start d-flex align-items-center justify-content-between"
                              disabled={isFull || subs.length === 0}
                              onClick={() =>
                                setSubsystemPickerProject((current) => (current === projectId ? null : projectId))
                              }
                            >
                              <span>
                                {isFull
                                  ? "All subsystems (full project)"
                                  : subs.length === 0
                                  ? "No subsystems yet: use Full project"
                                  : `${(projectAccess[projectId] || []).length} subsystem${(projectAccess[projectId] || []).length === 1 ? "" : "s"} selected`}
                              </span>
                              <ChevronDown size={15} />
                            </button>
                            {subsystemPickerProject === projectId && (
                              <div
                                className="position-absolute start-0 end-0 mb-1 p-2 rounded shadow"
                                style={{
                                  bottom: "100%",
                                  zIndex: 6,
                                  background: "var(--egse-bg, #101722)",
                                  border: "1px solid var(--egse-border)",
                                  maxHeight: "180px",
                                  overflowY: "auto",
                                }}
                              >
                                <div className="d-flex justify-content-between align-items-center mb-1 px-1">
                                  <span className="small text-secondary">Choose subsystems</span>
                                  <button
                                    type="button"
                                    className="btn btn-link btn-sm p-0 text-info text-decoration-none small"
                                    onClick={() => toggleAllSubsystems(projectId, subs)}
                                  >
                                    {subs.length > 0 &&
                                    subs.every((sub) => (projectAccess[projectId] || []).includes((sub._id || sub.id).toString()))
                                      ? "Deselect all"
                                      : "Select all"}
                                  </button>
                                </div>
                                <div className="d-flex flex-column gap-1">
                                  {subs.map((sub) => {
                                    const subId = (sub._id || sub.id).toString();
                                    return (
                                      <label key={subId} className="d-flex gap-2 align-items-center small py-1 px-1">
                                        <input
                                          type="checkbox"
                                          checked={(projectAccess[projectId] || []).includes(subId)}
                                          onChange={() => toggleSubsystem(projectId, subId)}
                                        />
                                        {sub.name || sub.subsystemCode}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="d-flex justify-content-between align-items-center">
              <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
                New Password (leave empty to keep current password)
              </label>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none small text-info"
                onClick={() => {
                  const gen = "Egse@" + Math.random().toString(36).slice(-6) + "!2026";
                  setPassword(gen);
                }}
              >
                <Key size={12} className="me-1" /> Generate Strong
              </button>
            </div>
            <div className="input-group">
              <input
                type={showPassword ? "text" : "password"}
                minLength={10}
                className="form-control egse-field"
                placeholder="Leave blank to keep existing password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-egse-outline"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
                Assigned Granular Authorities
              </label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none small text-info"
                  onClick={selectAllPermissions}
                >
                  All
                </button>
                <span className="text-secondary small">|</span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none small text-secondary"
                  onClick={deselectAllPermissions}
                >
                  None
                </button>
              </div>
            </div>

            <div
              className="d-flex flex-column gap-1 p-2 rounded"
              style={{
                backgroundColor: "var(--egse-well, rgba(0,0,0,0.2))",
                border: "1px solid var(--egse-border)",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            >
              {AVAILABLE_PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  className="d-flex align-items-center gap-2 small py-1 px-1 rounded hover-highlight"
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={permissions.includes(p.key)}
                    onChange={() => togglePermission(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="d-flex gap-2 justify-content-end pt-2 border-top border-secondary border-opacity-25">
            <button type="button" className="btn btn-sm btn-egse-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-egse-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}