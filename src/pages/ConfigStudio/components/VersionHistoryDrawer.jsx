import React, { useState, useEffect } from "react";
import configService from "../../../services/configService";

export default function VersionHistoryDrawer({
  isOpen,
  onClose,
  projectId,
  currentVersion,
  onRestoreSuccess,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [restoreWarnings, setRestoreWarnings] = useState([]);
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [selectedPreviewVersion, setSelectedPreviewVersion] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [versionDetails, setVersionDetails] = useState({});
  const [restoringVersion, setRestoringVersion] = useState(null);

  useEffect(() => {
    if (isOpen && projectId) {
      loadVersions();
    }
  }, [isOpen, projectId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await configService.listVersions(projectId);
      const versionList = Array.isArray(res) ? res : (res?.data || []);
      setVersions(versionList);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load version history");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = async (vNum) => {
    if (expandedVersion === vNum) {
      setExpandedVersion(null);
      return;
    }
    setExpandedVersion(vNum);
    await ensureVersionDetailLoaded(vNum);
  };

  const ensureVersionDetailLoaded = async (vNum) => {
    if (!versionDetails[vNum]) {
      try {
        setPreviewLoading(true);
        const res = await configService.getVersionDetail(projectId, vNum);
        const detail = (res && typeof res === "object" && (res.snapshot || res.configurations)) ? res : (res?.data || res);
        setVersionDetails((prev) => ({ ...prev, [vNum]: detail }));
      } catch (err) {
        console.error("Failed to load version detail", err);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleSelectPreview = async (vNum) => {
    if (selectedPreviewVersion === vNum) {
      setSelectedPreviewVersion(null);
      return;
    }
    setSelectedPreviewVersion(vNum);
    await ensureVersionDetailLoaded(vNum);
  };

  const handleRestoreVersion = async (vNum) => {
    const isCurrent = vNum === currentVersion;
    const confirmPrompt = isCurrent
      ? `Version v${vNum} is already the current version. Restore it as a new version anyway?`
      : `Are you sure you want to restore Version v${vNum}? This will create a new live version containing this snapshot.`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    try {
      setRestoringVersion(vNum);
      setError(null);
      setSuccessMessage(null);
      setRestoreWarnings([]);
      const res = await configService.restoreVersion(projectId, vNum);
      setSuccessMessage(`Successfully restored version v${vNum} as a new live version.`);
      setRestoreWarnings((res?.data ?? res)?.warnings || []);
      await loadVersions();
      if (onRestoreSuccess) {
        onRestoreSuccess(vNum);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to restore version");
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleDownloadVersion = async (vNum) => {
    try {
      const res = await configService.exportConfiguration(projectId, {
        version: vNum,
        download: true,
      });
      const blob = res instanceof Blob ? res : new Blob([typeof res === "string" ? res : JSON.stringify(res.data || res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `config_v${vNum}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export version: " + (err.message || "Error"));
    }
  };

  if (!isOpen) return null;

  const previewDoc = selectedPreviewVersion ? versionDetails[selectedPreviewVersion] : null;
  const previewSnapshot = previewDoc?.snapshot || previewDoc?.data;
  const previewConfigs = previewSnapshot?.configurations || (Array.isArray(previewSnapshot) ? previewSnapshot : []);

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1050 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: "780px" }}>
        <div
          className="modal-content text-light border border-secondary"
          style={{ backgroundColor: "var(--egse-surface-card, #1a1e24)" }}
        >
          <div className="modal-header border-secondary d-flex justify-content-between align-items-center">
            <div>
              <h5 className="modal-title mb-0">📜 Version History</h5>
              <div className="small text-muted">
                Audit trail, configuration snapshots, and version restore
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          <div className="modal-body p-3">
            {loading && <div className="text-center py-3 text-muted">Loading version history...</div>}
            {error && <div className="alert alert-danger py-2 small mb-3">❌ {error}</div>}
            {successMessage && <div className="alert alert-success py-2 small mb-3">✅ {successMessage}</div>}
            {restoreWarnings.length > 0 && (
              <div className="alert alert-warning py-2 small mb-3" role="alert">
                <div className="fw-semibold mb-1">Check these restore notes:</div>
                <ul className="mb-0 ps-3">
                  {restoreWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}

            {!loading && versions.length === 0 && !error && (
              <div className="text-center py-4 text-muted small">
                No version history recorded yet for this project.
              </div>
            )}

            {/* Preview Section if a version is clicked for preview */}
            {selectedPreviewVersion && (
              <div className="p-3 mb-3 rounded border border-info" style={{ backgroundColor: "rgba(6, 182, 212, 0.08)" }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-info text-dark fw-bold">Previewing v{selectedPreviewVersion}</span>
                    {previewDoc?.restoredFrom && (
                      <span className="badge bg-warning text-dark">
                        Restored from v{previewDoc.restoredFrom}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-muted p-0 text-decoration-none"
                    onClick={() => setSelectedPreviewVersion(null)}
                  >
                    ✕ Close Preview
                  </button>
                </div>

                {previewLoading && !previewDoc ? (
                  <div className="text-muted small py-2">Loading preview data...</div>
                ) : (
                  <div>
                    <div className="small text-muted mb-2">
                      Project Snapshot: <strong>{previewSnapshot?.projectName || "Configuration"}</strong> • Subsystems: {previewConfigs.length}
                    </div>

                    {previewConfigs.length > 0 && (
                      <div className="table-responsive mb-2" style={{ maxHeight: "150px", overflowY: "auto" }}>
                        <table className="table table-sm table-dark table-bordered mb-0 small">
                          <thead>
                            <tr>
                              <th>Subsystem</th>
                              <th>Frame</th>
                              <th>Parameters</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewConfigs.map((c, i) => (
                              <tr key={i}>
                                <td>{c.subsystem?.name || c.subsystem?.codeHex || "Default"}</td>
                                <td>{c.frame?.name || c.frame?.frameName || "Frame"}</td>
                                <td>{c.parameters?.length || 0} params</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="d-flex justify-content-end gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        disabled={restoringVersion === selectedPreviewVersion}
                        onClick={() => handleRestoreVersion(selectedPreviewVersion)}
                      >
                        {restoringVersion === selectedPreviewVersion ? "Restoring..." : `↺ Restore this version (v${selectedPreviewVersion})`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="d-flex flex-column gap-3">
              {versions.map((v) => {
                const vNum = v.versionNumber || v.version;
                const isCurrent = vNum === currentVersion;
                const isExpanded = expandedVersion === vNum;
                const isPreviewing = selectedPreviewVersion === vNum;
                const details = versionDetails[vNum];

                return (
                  <div
                    key={vNum}
                    className={`p-3 rounded border ${isCurrent ? "border-primary" : "border-secondary"}`}
                    style={{ backgroundColor: isCurrent ? "rgba(13, 110, 253, 0.08)" : "rgba(255,255,255,0.02)" }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className={`badge ${isCurrent ? "bg-primary" : "bg-secondary"}`}>
                          {`v${vNum}${isCurrent ? " • Current" : ""}`}
                        </span>
                        <span className="badge bg-dark border border-secondary text-muted">
                          {v.source?.type || "manual"}
                        </span>
                        {v.restoredFrom && (
                          <span className="badge bg-warning text-dark">
                            Restored from v{v.restoredFrom}
                          </span>
                        )}
                      </div>
                      <div className="small text-muted">
                        {v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}
                      </div>
                    </div>

                    {v.createdBy && (
                      <div className="small text-muted mb-2">
                        Author: {v.createdBy.name || v.createdBy.email || "System"}
                      </div>
                    )}

                    <div className="d-flex gap-2 mb-2 flex-wrap">
                      <span className="badge bg-success small">
                        +{v.summary?.added?.subsystems || 0} subs, +{v.summary?.added?.frames || 0} frames, +{v.summary?.added?.parameters || 0} params
                      </span>
                      {(v.summary?.updated?.frames > 0 || v.summary?.updated?.parameters > 0) && (
                        <span className="badge bg-warning small text-dark">
                          ~{v.summary?.updated?.frames || 0} frames, ~{v.summary?.updated?.parameters || 0} params
                        </span>
                      )}
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-secondary flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-3">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-decoration-none text-info small"
                          onClick={() => handleToggleExpand(vNum)}
                        >
                          {isExpanded ? "▲ Hide Changes" : "▼ View Changes"}
                        </button>

                        <button
                          type="button"
                          className={`btn btn-sm ${isPreviewing ? "btn-info text-dark" : "btn-outline-info"} py-0 px-2 small`}
                          onClick={() => handleSelectPreview(vNum)}
                          title={`Preview version v${vNum} configuration`}
                        >
                          👁️ {isPreviewing ? "Close Preview" : "Preview Version"}
                        </button>
                      </div>

                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success py-0 px-2 small"
                          disabled={restoringVersion === vNum}
                          onClick={() => handleRestoreVersion(vNum)}
                          title={`Restore configuration to v${vNum}`}
                        >
                          {restoringVersion === vNum ? "Restoring..." : "↺ Restore this version"}
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-light py-0 px-2 small"
                          onClick={() => handleDownloadVersion(vNum)}
                          title={`Download v${vNum} snapshot`}
                        >
                          {`⬇️ Download v${vNum}`}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 p-2 bg-dark rounded small border border-secondary">
                        <div className="fw-bold mb-1 text-muted">Detailed Changes:</div>
                        {details?.changes && details.changes.length > 0 ? (
                          <ul className="mb-0 ps-3">
                            {details.changes.map((c, i) => (
                              <li key={i}>
                                <span className={c.op === "added" ? "text-success" : "text-warning"}>
                                  [{c.op}]
                                </span>{" "}
                                {c.level}: <code>{c.path}</code>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-muted fst-italic">No individual change records.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-footer border-secondary">
            <button type="button" className="btn btn-sm btn-secondary ms-auto" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
