// Confirmation prompts for deleting configuration. Used by every subsystem/frame delete
// entry point, so they all say the same thing. Uses the browser confirm, like the other
// destructive actions in the app (parameter, file and version deletes).

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const paramCount = (frame) => (Array.isArray(frame?.parameters) ? frame.parameters.length : 0);

const KEPT = "Decoded telemetry that is already stored is kept. To undo, restore an earlier configuration version from Version History.";

export function frameDeleteMessage(frame) {
  const where = frame?.subsystem ? ` from subsystem "${frame.subsystem}"` : "";
  return `Delete frame "${frame?.name || "this frame"}"${where}?\n\n`
    + `Its ${count(paramCount(frame), "parameter definition", "parameter definitions")} will be deleted too. ${KEPT}`;
}

export function subsystemDeleteMessage(subsystemName, frames = []) {
  const params = frames.reduce((sum, frame) => sum + paramCount(frame), 0);
  const impact = frames.length === 0
    ? "It has no frames."
    : `This also deletes its ${count(frames.length, "frame", "frames")} (${frames.map((f) => `"${f.name}"`).join(", ")}) `
      + `and their ${count(params, "parameter definition", "parameter definitions")}.`;
  return `Delete subsystem "${subsystemName}"?\n\n${impact} ${KEPT}`;
}

export const confirmFrameDelete = (frame) => window.confirm(frameDeleteMessage(frame));
export const confirmSubsystemDelete = (name, frames) => window.confirm(subsystemDeleteMessage(name, frames));
