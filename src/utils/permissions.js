// Client mirror of the server's upload rule (middleware/auth.middleware.js requirePreUploadAccess /
// requireProjectAccess): admin roles always may; everyone else needs the explicit grant.
// This only decides what to show; the server still enforces it.

const ADMIN_ROLES = new Set(["admin", "developer"]);

export function canUploadTelemetry(user) {
  if (!user) return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes("upload_telemetry");
}
