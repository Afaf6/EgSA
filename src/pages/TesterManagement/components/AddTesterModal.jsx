import { useEffect, useState } from "react";
import { AVAILABLE_PERMISSIONS } from "../../../constants/telemetryConstants";
import { Eye, EyeOff, Shield, Key, ChevronDown, Search } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../../redux/slices/authSlice";
import { actorCanGrantFullProject, buildProjectAccessPayload, hasIncompleteGrant, newAccountRoles } from "../../../utils/projectGrants";

// form-select already draws its own arrow; hide it because we render a ChevronDown icon.
const NO_NATIVE_ARROW = { backgroundImage: "none" };
const PROJECT_PICKER_ID = "__project__";

export default function AddTesterModal({ open, projects = [], onClose, onAdd }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamRole, setTeamRole] = useState("tester");
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState(["view_telemetry"]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectAccess, setProjectAccess] = useState({});
  // Projects granted in full: every subsystem, including ones added later (F10)
  const [fullProjects, setFullProjects] = useState({});
  const actor = useSelector(selectUser);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [subsystemPickerProject, setSubsystemPickerProject] = useState(null);

  // Close any open dropdown when clicking/touching outside of it, or on Escape.
  // Each dropdown wrapper carries data-picker="<id>"; clicks inside a wrapper keep only that one open.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      const wrapper = event.target instanceof Element ? event.target.closest("[data-picker]") : null;
      const pickerId = wrapper ? wrapper.getAttribute("data-picker") : null;
      if (pickerId !== PROJECT_PICKER_ID) setProjectPickerOpen(false);
      setSubsystemPickerProject((current) => (current !== null && current === pickerId ? current : null));
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProjectPickerOpen(false);
        setSubsystemPickerProject(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

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
    const id = project._id || project.id;
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
  const toggleSubsystem = (projectId, subsystemId) => setProjectAccess((prev) => {
    const selected = new Set(prev[projectId] || []);
    selected.has(subsystemId) ? selected.delete(subsystemId) : selected.add(subsystemId);
    return { ...prev, [projectId]: [...selected] };
  });
  const toggleAllSubsystems = (projectId, subsystems) => {
    const subsystemIds = subsystems.map((sub) => sub._id || sub.id);
    const allSelected = subsystemIds.length > 0 && subsystemIds.every((id) => projectAccess[projectId]?.includes(id));
    setProjectAccess((prev) => ({ ...prev, [projectId]: allSelected ? [] : subsystemIds }));
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
    if (!password || password.length < 10) {
      setErrorMsg("Password must be at least 10 characters long.");
      return;
    }
    if (Object.keys(projectAccess).length === 0 || hasIncompleteGrant(projectAccess, fullProjects)) {
      setErrorMsg("Choose at least one project, and for each project either Full project or at least one subsystem.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        permissions,
        teamRole,
        projectAccess: buildProjectAccessPayload(projectAccess, fullProjects),
      });

      setName("");
      setEmail("");
      setPassword("");
      setTeamRole("tester");
      setProjectAccess({});
      setFullProjects({});
      setProjectPickerOpen(false);
      setSubsystemPickerProject(null);
      setProjectSearch("");
      setPermissions(["view_telemetry"]);
      setErrorMsg("");
      onClose();
    } catch (error) {
      setErrorMsg(typeof error === "string" ? error : error?.message || "Failed to create the user. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const dropdownSurface = {
    background: "var(--egse-bg-panel)",
    border: "1px solid var(--egse-border-strong)",
  };
  const wellSurface = {
    backgroundColor: "var(--egse-bg-raised)",
    border: "1px solid var(--egse-border-soft)",
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
          border: "1px solid var(--egse-border-strong)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            <Shield size={20} className="text-info" />
            <h3 className="egse-heading h6 mb-0">Create Mission Operator Account</h3>
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
              Team Role / Level *
            </label>
            <select
              className="form-select egse-field"
              value={teamRole}
              onChange={(event) => setTeamRole(event.target.value)}
            >
              {newAccountRoles().map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
            <div className="form-text small">
              Team classification only. System access is controlled by the permissions below. Admin accounts are created by an admin.
            </div>
          </div>

          <div>
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>Project &amp; Subsystem Access *</label>
            <div>
              <div className="position-relative" data-picker={PROJECT_PICKER_ID}>
                <button
                  type="button"
                  className="form-select egse-field text-start d-flex align-items-center justify-content-between"
                  style={NO_NATIVE_ARROW}
                  aria-haspopup="listbox"
                  aria-expanded={projectPickerOpen}
                  onClick={() => {
                    setSubsystemPickerProject(null);
                    setProjectPickerOpen((current) => !current);
                  }}
                  disabled={projects.length === 0}
                >
                  <span>{projects.length === 0 ? "No projects available" : `${Object.keys(projectAccess).length} project${Object.keys(projectAccess).length === 1 ? "" : "s"} selected`}</span>
                  <ChevronDown size={15} />
                </button>
                {projectPickerOpen && (
                  <div className="position-absolute start-0 end-0 mt-1 p-2 rounded shadow" style={{ zIndex: 5, ...dropdownSurface, maxHeight: "240px", overflowY: "auto" }}>
                    <div className="position-relative mb-2">
                      <Search size={14} className="position-absolute top-50 translate-middle-y ms-2 text-secondary" />
                      <input className="form-control egse-field ps-4" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search projects..." />
                    </div>
                    <div className="d-flex flex-column gap-1">
                      {projects.filter((project) => project.name?.toLowerCase().includes(projectSearch.trim().toLowerCase())).map((project) => {
                        const projectId = project._id || project.id;
                        const selected = Object.hasOwn(projectAccess, projectId);
                        return (
                          <label key={projectId} className="d-flex gap-2 align-items-center small py-1 px-1">
                            <input type="checkbox" checked={selected} onChange={(e) => toggleProject(project, e.target.checked)} />{project.name}
                          </label>
                        );
                      })}
                      {projects.length > 0 && !projects.some((project) => project.name?.toLowerCase().includes(projectSearch.trim().toLowerCase())) && <span className="small text-secondary p-1">No matching projects.</span>}
                    </div>
                  </div>
                )}
              </div>

              {Object.keys(projectAccess).length > 0 && (
                <div className="d-flex flex-column gap-2 mt-2 p-2 rounded" style={wellSurface}>
                  {projects.filter((project) => Object.hasOwn(projectAccess, project._id || project.id)).map((project) => {
                    const projectId = project._id || project.id;
                    const subs = project.subsystems || [];
                    const selectedCount = (projectAccess[projectId] || []).length;
                    const isFull = Boolean(fullProjects[projectId]);
                    const canGrantFull = actorCanGrantFullProject(actor, projectId);
                    return (
                      <div key={projectId} className="border-bottom border-secondary border-opacity-25 pb-2">
                        <div className="small fw-semibold mb-1">{project.name}</div>
                        <label className="d-flex gap-2 align-items-center small mb-1" title={canGrantFull ? "" : "Your own access to this project is limited to some subsystems"}>
                          <input type="checkbox" className="form-check-input mt-0" checked={isFull} disabled={!canGrantFull} onChange={(e) => toggleFullProject(projectId, e.target.checked)} />
                          <span>Full project (every subsystem, including ones added later)</span>
                        </label>
                        <div className="position-relative" data-picker={projectId}>
                          <button
                            type="button"
                            className="form-select egse-field text-start d-flex align-items-center justify-content-between"
                            style={NO_NATIVE_ARROW}
                            aria-haspopup="listbox"
                            aria-expanded={subsystemPickerProject === projectId}
                            disabled={isFull || subs.length === 0}
                            onClick={() => {
                              setProjectPickerOpen(false);
                              setSubsystemPickerProject((current) => (current === projectId ? null : projectId));
                            }}
                          >
                            <span>{isFull ? "All subsystems (full project)" : subs.length === 0 ? "No subsystems yet: use Full project" : `${selectedCount} subsystem${selectedCount === 1 ? "" : "s"} selected`}</span>
                            <ChevronDown size={15} />
                          </button>
                          {subsystemPickerProject === projectId && (
                            <div className="position-absolute start-0 end-0 mb-1 p-2 rounded shadow" style={{ bottom: "100%", zIndex: 6, ...dropdownSurface, maxHeight: "180px", overflowY: "auto" }}>
                              <div className="d-flex justify-content-between align-items-center mb-1 px-1">
                                <span className="small text-secondary">Choose subsystems</span>
                                <button type="button" className="btn btn-link btn-sm p-0 text-info text-decoration-none small" onClick={() => toggleAllSubsystems(projectId, subs)}>
                                  {subs.length > 0 && subs.every((sub) => (projectAccess[projectId] || []).includes(sub._id || sub.id)) ? "Deselect all" : "Select all"}
                                </button>
                              </div>
                              <div className="d-flex flex-column gap-1">
                                {subs.map((sub) => {
                                  const subId = sub._id || sub.id;
                                  return (
                                    <label key={subId} className="d-flex gap-2 align-items-center small py-1 px-1">
                                      <input type="checkbox" checked={(projectAccess[projectId] || []).includes(subId)} onChange={() => toggleSubsystem(projectId, subId)} />{sub.name || sub.subsystemCode}
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
                Initial Password * (min 10 characters)
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
                required
                minLength={10}
                className="form-control egse-field"
                placeholder="Minimum 10 characters"
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
                ...wellSurface,
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
            <button type="submit" className="btn btn-sm btn-egse-primary">
              {isSubmitting ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}