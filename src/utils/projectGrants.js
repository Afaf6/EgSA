// Client mirror of the server's grant rules (features/auth/users.service.js validateProjectAccess).
// It only decides what to show; the server enforces every rule.

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "lead", label: "Lead" },
  { value: "designer", label: "Designer" },
  { value: "tester", label: "Tester" },
  { value: "ops", label: "OPS" },
];

const isAdmin = (actor) => actor?.role === "admin" || actor?.role === "developer";

/** Roles the acting user may assign. Only an admin may assign Admin (F1/F13). */
export function assignableRoles(actor) {
  return ROLE_OPTIONS.filter((role) => role.value !== "admin" || isAdmin(actor));
}

/** Team roles for a new operator account; that account type is never an admin (F13). */
export function newAccountRoles() {
  return ROLE_OPTIONS.filter((role) => role.value !== "admin");
}

const idOf = (value) => String(value?._id || value?.id || value || "");

/**
 * A full-project grant can only be passed on by someone whose own access to that project is full:
 * an admin, or a user without a subsystem-limited grant for it (F6/F10).
 */
export function actorCanGrantFullProject(actor, projectId) {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  const grants = Array.isArray(actor.projectAccess) ? actor.projectAccess : [];
  const grant = grants.find((entry) => idOf(entry?.project) === String(projectId));
  return !grant || grant.fullProject === true;
}

/** Reads a stored projectAccess array into the modal state. */
export function grantsToState(projectAccess) {
  const subsystemsByProject = {};
  const fullProjects = {};
  for (const item of Array.isArray(projectAccess) ? projectAccess : []) {
    const projectId = idOf(item?.project);
    if (!projectId) continue;
    subsystemsByProject[projectId] = (Array.isArray(item.subsystems) ? item.subsystems : []).map(idOf).filter(Boolean);
    if (item.fullProject === true) fullProjects[projectId] = true;
  }
  return { subsystemsByProject, fullProjects };
}

/** Every selected project needs explicit full-project access or at least one subsystem. */
export function hasIncompleteGrant(subsystemsByProject, fullProjects) {
  return Object.entries(subsystemsByProject).some(([projectId, ids]) => !fullProjects[projectId] && ids.length === 0);
}

/** The API payload: full-project grants list no subsystems. */
export function buildProjectAccessPayload(subsystemsByProject, fullProjects) {
  return Object.entries(subsystemsByProject).map(([project, subsystems]) => (
    fullProjects[project] ? { project, fullProject: true, subsystems: [] } : { project, subsystems }
  ));
}
