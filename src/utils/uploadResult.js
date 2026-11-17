/** Turns the server's upload statistics into what the results panel shows. */
export function buildUploadResult(stats, file) {
  const source = stats || {};
  const invalidFrames = source.invalidFrames || 0;
  const nonTelemetryLines = source.nonTelemetryLines || 0;
  const storedRecords = source.storedRecords || 0;
  // Every log line that is not a frame also counts as invalid on the server.
  const rejectedFrames = Math.max(0, invalidFrames - nonTelemetryLines);

  let outcome = "success";
  if (storedRecords === 0) outcome = "failed";
  else if (rejectedFrames > 0) outcome = "partial";

  return {
    fileName: file?.name || source.fileName || "",
    totalBytes: source.totalBytes || file?.size || 0,
    totalLines: source.totalLines || 0,
    totalFrames: source.totalFrames || 0,
    validFrames: source.validFrames || 0,
    invalidFrames,
    nonTelemetryLines,
    rejectedFrames,
    storedRecords,
    linkedRecords: source.linkedRecords || 0,
    crcFailedStored: source.crcFailedStored ?? 0,
    totalParameters: source.totalParameters || 0,
    subsystemSummary: source.subsystemSummary || {},
    frameSummary: source.frameSummary || {},
    statusSummary: source.statusSummary || { normal: 0, warning: 0, alarm: 0, invalid: 0 },
    decodedPreview: source.decodedPreview || [],
    latestParametersBySubsystem: source.latestParametersBySubsystem || {},
    failedFrames: source.failedFrames || [],
    // Set when a different file already had this name and the upload was stored under a new one.
    storedFileName: source.storedFileName || null,
    renamedFrom: source.renamedFrom || null,
    outcome,
  };
}

const OUTCOME_TITLES = {
  success: "Telemetry Decoding Succeeded",
  partial: "Completed with Rejected Frames",
  failed: "No Telemetry Stored",
};

export function uploadOutcomeTitle(outcome) {
  return OUTCOME_TITLES[outcome] || OUTCOME_TITLES.success;
}
