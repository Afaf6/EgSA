import React, { useState, useEffect } from "react";
import configService from "../../../services/configService";
import { parseConfigText } from "../../../utils/configTextFormat";

export default function UploadConfigWizardModal({
  isOpen,
  onClose,
  projectId,
  project,
  onSuccess,
}) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [scopeSubsystem, setScopeSubsystem] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Legacy single-frame format (.txt, .csv, .tsv) state
  const [isLegacyFormat, setIsLegacyFormat] = useState(false);
  const [parsedLegacyData, setParsedLegacyData] = useState(null);
  const [legacyTargetSubsystem, setLegacyTargetSubsystem] = useState("");
  const [legacyTargetFrame, setLegacyTargetFrame] = useState("");
  const [preparedLegacyPayload, setPreparedLegacyPayload] = useState(null);

  // JSON auto-heal state
  const [preparedJsonPayload, setPreparedJsonPayload] = useState(null);
  const [jsonAutoHealNotice, setJsonAutoHealNotice] = useState(null);

  // Step 2 state
  const [previewData, setPreviewData] = useState(null);
  const [updateKeys, setUpdateKeys] = useState([]);
  const [replaceNameKeys, setReplaceNameKeys] = useState([]);
  const [skipConflicts, setSkipConflicts] = useState(false);

  // Step 3 state
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFile(null);
      setScopeSubsystem("");
      setLoading(false);
      setError(null);
      setIsLegacyFormat(false);
      setParsedLegacyData(null);
      setLegacyTargetSubsystem("");
      setLegacyTargetFrame("");
      setPreparedLegacyPayload(null);
      setPreparedJsonPayload(null);
      setJsonAutoHealNotice(null);
      setPreviewData(null);
      setUpdateKeys([]);
      setReplaceNameKeys([]);
      setSkipConflicts(false);
      setApplyResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
      const ext = selected.name.split(".").pop()?.toLowerCase();
      if (["txt", "csv", "tsv"].includes(ext)) {
        try {
          const text = await selected.text();
          const parsed = parseConfigText(text);
          if (parsed.errors && parsed.errors.length > 0) {
            setError(`Legacy file parsing issues: ${parsed.errors.slice(0, 2).join("; ")}`);
          }
          setIsLegacyFormat(true);
          setParsedLegacyData(parsed);
          const detectedSub = parsed.meta?.subsystemCode || project?.rawSubsystems?.[0]?.subsystemCode || "0010";
          setLegacyTargetSubsystem(detectedSub);
          const detectedFrame = parsed.meta?.frameName || selected.name.replace(/\.[^/.]+$/, "");
          setLegacyTargetFrame(detectedFrame);
          setPreparedJsonPayload(null);
          setJsonAutoHealNotice(null);
        } catch (err) {
          setError(`Failed to read text file: ${err.message}`);
        }
      } else if (ext === "json") {
        setIsLegacyFormat(false);
        setParsedLegacyData(null);
        setPreparedLegacyPayload(null);
        try {
          const text = await selected.text();
          const parsed = JSON.parse(text);
          let autoHealed = false;
          const healedInfo = [];

          const inspectAndHeal = (cfg) => {
            const frm = cfg?.frame;
            const params = cfg?.parameters || [];
            if (frm) {
              const hasLen = (frm.totalFrameLength !== undefined && frm.totalFrameLength !== null && !isNaN(Number(frm.totalFrameLength)) && Number(frm.totalFrameLength) > 0) ||
                             (frm.frameLength !== undefined && frm.frameLength !== null && !isNaN(Number(frm.frameLength)) && Number(frm.frameLength) > 0);
              if (!hasLen) {
                let maxNeeded;
                const isBit = String(frm.dataRepresentation || "").toUpperCase() === "BIT";
                if (isBit) {
                  const maxBitNeeded = Math.max(
                    0,
                    ...params.map((p) => (Number(p.bitOffset) || 0) + (Number(p.bitLength) || (Number(p.length) ? Number(p.length) * 8 : 8)))
                  );
                  const trailerBytes = Number(frm.trailerLength) || 0;
                  const payloadBytes = Math.ceil(maxBitNeeded / 8);
                  maxNeeded = (Number(frm.payloadBaseOffset) || 0) + payloadBytes + trailerBytes;
                } else {
                  maxNeeded = Math.max(
                    0,
                    ...params.map((p) => (Number(p.byteOffset) || 0) + (Number(p.length) || 1))
                  ) + (Number(frm.payloadBaseOffset) || 0);
                }
                const computedLen = maxNeeded > 0 ? maxNeeded : 64;
                frm.totalFrameLength = computedLen;
                frm.frameLength = computedLen;
                autoHealed = true;
                healedInfo.push(`"${frm.frameName || frm.name || 'Frame'}" (${computedLen} Bytes)`);
              }
            }
          };

          if (parsed.configurations && Array.isArray(parsed.configurations)) {
            parsed.configurations.forEach(inspectAndHeal);
          } else if (parsed.frame) {
            inspectAndHeal(parsed);
          }

          setPreparedJsonPayload(parsed);
          if (autoHealed) {
            setJsonAutoHealNotice(`Auto-detected totalFrameLength from parameters for: ${healedInfo.join(', ')}.`);
          } else {
            setJsonAutoHealNotice(null);
          }
        } catch (err) {
          // If JSON parse fails or is empty, allow backend upload to handle error
          setPreparedJsonPayload(null);
          setJsonAutoHealNotice(null);
        }
      } else {
        setIsLegacyFormat(false);
        setParsedLegacyData(null);
        setPreparedLegacyPayload(null);
        setPreparedJsonPayload(null);
        setJsonAutoHealNotice(null);
      }
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setError("Please select a valid configuration file (.json, .xlsx, .txt, .csv, .tsv).");
      return;
    }
    try {
      setLoading(true);
      setError(null);

      let res;
      if (isLegacyFormat && parsedLegacyData) {
        const subCode = legacyTargetSubsystem || "0010";
        const subObj = project?.rawSubsystems?.find((s) => s.subsystemCode === subCode);
        const frameName = legacyTargetFrame || parsedLegacyData.meta?.frameName || "Frame_1";

        const configObj = {
          subsystem: {
            codeHex: subCode,
            name: subObj?.name || `Subsystem ${subCode}`,
          },
          frame: {
            frameName,
            frameLength: parsedLegacyData.meta?.frameLength || 32,
            headerLength: parsedLegacyData.meta?.headerLength || 4,
            searchHeader: parsedLegacyData.meta?.headerPattern || "",
            payloadBaseOffset: parsedLegacyData.meta?.headerLength || 0,
          },
          parameters: (parsedLegacyData.parameters || []).map((p, idx) => ({
            name: p.name,
            byteOffset: p.byteOffset,
            bitOffset: p.bitOffset,
            length: p.length,
            dataType: p.dataType,
            signed: p.signed === "signed",
            endianness: p.endianness || "LE",
            scale: p.scale ?? 1,
            offset: p.offset ?? 0,
            unit: p.unit || "",
            limits: {
              warnLow: p.warnLow !== "" ? p.warnLow : null,
              alarmLow: p.alarmLow !== "" ? p.alarmLow : null,
              warnHigh: p.warnHigh !== "" ? p.warnHigh : null,
              alarmHigh: p.alarmHigh !== "" ? p.alarmHigh : null,
            },
            displayOrder: idx,
          })),
        };
        const scopeObj = {
          subsystemCode: subCode,
          frameName,
        };
        setPreparedLegacyPayload({ config: configObj, scope: scopeObj });
        res = await configService.previewConfiguration(projectId, { config: configObj, scope: scopeObj }, false);
      } else if (preparedJsonPayload) {
        const payload = {
          config: preparedJsonPayload,
          scope: scopeSubsystem ? { subsystemCode: scopeSubsystem } : undefined,
        };
        res = await configService.previewConfiguration(projectId, payload, false);
      } else {
        const formData = new FormData();
        formData.append("file", file);
        if (scopeSubsystem) {
          formData.append("scope", JSON.stringify({ subsystemCode: scopeSubsystem }));
        }
        res = await configService.previewConfiguration(projectId, formData, true);
      }

      const preview = res.data ?? res;
      setPreviewData(preview);

      // Extract all changed parameter keys from tree for easy toggling
      const changedKeys = [];
      (preview.tree || []).forEach((sub) => {
        (sub.frames || []).forEach((frm) => {
          (frm.parameters || []).forEach((p) => {
            if (p.status === "CHANGED") {
              changedKeys.push(`${sub.codeHex}::${frm.name}::${p.name}`);
            }
          });
        });
      });

      // Default: leave updateKeys and replaceNameKeys empty
      setUpdateKeys([]);
      setReplaceNameKeys([]);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUpdateKey = (key) => {
    setUpdateKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllChanged = () => {
    const allChanged = [];
    (previewData?.tree || []).forEach((sub) => {
      (sub.frames || []).forEach((frm) => {
        (frm.parameters || []).forEach((p) => {
          if (p.status === "CHANGED") {
            allChanged.push(`${sub.codeHex}::${frm.name}::${p.name}`);
          }
        });
      });
    });
    setUpdateKeys(allChanged);
  };

  const handleDeselectAllChanged = () => {
    setUpdateKeys([]);
  };

  const handleApply = async () => {
    try {
      setLoading(true);
      setError(null);

      let res;
      if (isLegacyFormat && preparedLegacyPayload) {
        const payload = {
          config: preparedLegacyPayload.config,
          scope: preparedLegacyPayload.scope,
          expectedVersion: previewData?.currentVersion ?? project?.version ?? 0,
          skipConflicts: skipConflicts ? true : false,
          updateKeys: updateKeys.length > 0 ? updateKeys : undefined,
          replaceNameKeys: replaceNameKeys.length > 0 ? replaceNameKeys : undefined,
        };
        res = await configService.applyConfiguration(projectId, payload, false);
      } else if (preparedJsonPayload) {
        const payload = {
          config: preparedJsonPayload,
          expectedVersion: previewData?.currentVersion ?? project?.version ?? 0,
          skipConflicts: skipConflicts ? true : false,
          updateKeys: updateKeys.length > 0 ? updateKeys : undefined,
          replaceNameKeys: replaceNameKeys.length > 0 ? replaceNameKeys : undefined,
          scope: scopeSubsystem ? { subsystemCode: scopeSubsystem } : undefined,
        };
        res = await configService.applyConfiguration(projectId, payload, false);
      } else {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("expectedVersion", previewData?.currentVersion ?? project?.version ?? 0);
        formData.append("skipConflicts", skipConflicts ? "true" : "false");
        if (updateKeys.length > 0) {
          formData.append("updateKeys", JSON.stringify(updateKeys));
        }
        if (replaceNameKeys.length > 0) {
          formData.append("replaceNameKeys", JSON.stringify(replaceNameKeys));
        }
        if (scopeSubsystem) {
          formData.append("scope", JSON.stringify({ subsystemCode: scopeSubsystem }));
        }
        res = await configService.applyConfiguration(projectId, formData, true);
      }

      const result = res?.data ?? res;
      setApplyResult(result);
      setStep(3);
      if (onSuccess) onSuccess(result);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to apply configuration update");
    } finally {
      setLoading(false);
    }
  };

  // Collect flat list of changed items and conflicts from previewData tree
  const changedItems = [];
  const conflictItems = [];
  if (previewData) {
    (previewData.tree || []).forEach((sub) => {
      (sub.frames || []).forEach((frm) => {
        if (frm.status === "CONFLICT" || (frm.conflicts && frm.conflicts.length > 0)) {
          (frm.conflicts || []).forEach((cf) => {
            conflictItems.push({
              key: `${sub.codeHex}::${frm.name}::FRAME`,
              subName: sub.name,
              frameName: frm.name,
              name: "Frame Layout",
              conflictReason: cf,
            });
          });
        }
        (frm.parameters || []).forEach((p) => {
          const key = `${sub.codeHex}::${frm.name}::${p.name}`;
          if (p.status === "CHANGED") {
            changedItems.push({ ...p, key, subName: sub.name, frameName: frm.name });
          } else if (p.status === "CONFLICT") {
            const reason =
              p.conflictReason ||
              (Array.isArray(p.conflicts) && p.conflicts.length > 0
                ? p.conflicts.join("; ")
                : "Parameter conflicts with existing configuration");
            conflictItems.push({
              ...p,
              key,
              subName: sub.name,
              frameName: frm.name,
              conflictReason: reason,
              conflictType: p.conflictType,
              existingOverlapName: p.existingOverlapName,
            });
          }
        });
      });
    });
  }

  const hasFrameLayoutConflict = conflictItems.some(
    (c) => c.name === "Frame Layout" || /missing required layout field/i.test(c.conflictReason)
  );

  const hasUnresolvedConflicts = conflictItems.some(
    (c) => !(c.conflictType === "NAME_OVERLAP" && replaceNameKeys.includes(c.key))
  );

  const canApply =
    previewData &&
    (previewData.counts.new > 0 || updateKeys.length > 0 || replaceNameKeys.length > 0) &&
    (!hasUnresolvedConflicts || skipConflicts);

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", zIndex: 1050 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div
          className="modal-content text-light border border-secondary"
          style={{ backgroundColor: "var(--egse-surface-card, #1a1e24)" }}
        >
          {/* Header */}
          <div className="modal-header border-secondary d-flex justify-content-between align-items-center">
            <div>
              <h5 className="modal-title mb-0">
                🚀 Upload Configuration Wizard
              </h5>
              <div className="small text-muted">
                Step {step} of 3: {step === 1 ? "Choose File" : step === 2 ? "Review Changes & Conflicts" : "Applied"}
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={loading}
              aria-label="Close"
            />
          </div>

          {/* Body */}
          <div className="modal-body">
            {error && (
              <div className="alert alert-danger py-2 small mb-3" role="alert">
                ❌ {error}
              </div>
            )}

            {/* STEP 1: CHOOSE FILE */}
            {step === 1 && (
              <div>
                <p className="small text-muted mb-3">
                  Upload a configuration file (.json, .xlsx, .txt, .csv, .tsv). Changes will be diffed against project{" "}
                  <strong>{project?.name || "current database"}</strong> (v{project?.version ?? 0}) without modifying anything until you confirm.
                </p>

                <div className="mb-3">
                  <label htmlFor="configFileInput" className="form-label small fw-bold">Select File (.json, .xlsx, .txt, .csv, .tsv)</label>
                  <input
                    id="configFileInput"
                    type="file"
                    className="form-control form-control-sm bg-dark text-light border-secondary"
                    accept=".json,.xlsx,.xls,.txt,.csv,.tsv"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                  {file && (
                    <div className="small text-info mt-1">
                      Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                {jsonAutoHealNotice && (
                  <div className="alert alert-info py-2 small mb-3 border-secondary">
                    💡 <strong>Smart Optimization:</strong> {jsonAutoHealNotice}
                  </div>
                )}

                {/* Legacy Single-Frame File Settings */}
                {isLegacyFormat && (
                  <div className="alert alert-info py-2 small mb-3 border-secondary">
                    <div className="fw-bold mb-2">📄 Single-Frame File Detected ({parsedLegacyData?.parameters?.length || 0} parameters)</div>
                    <div className="row g-2">
                      <div className="col-md-6">
                        <label className="form-label small fw-bold">Target Subsystem</label>
                        {project?.rawSubsystems && project.rawSubsystems.length > 0 ? (
                          <select
                            className="form-select form-select-sm bg-dark text-light border-secondary"
                            value={legacyTargetSubsystem}
                            onChange={(e) => setLegacyTargetSubsystem(e.target.value)}
                            disabled={loading}
                          >
                            {project.rawSubsystems.map((s) => (
                              <option key={s._id || s.id} value={s.subsystemCode}>
                                {s.name} ({s.subsystemCode})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="form-control form-control-sm bg-dark text-light border-secondary"
                            value={legacyTargetSubsystem}
                            onChange={(e) => setLegacyTargetSubsystem(e.target.value)}
                            placeholder="Subsystem Hex Code (e.g. 0010)"
                            disabled={loading}
                          />
                        )}
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small fw-bold">Target Frame Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm bg-dark text-light border-secondary"
                          value={legacyTargetFrame}
                          onChange={(e) => setLegacyTargetFrame(e.target.value)}
                          placeholder="Frame Name"
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!isLegacyFormat && project?.rawSubsystems && project.rawSubsystems.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Import Scope (Optional)</label>
                    <select
                      className="form-select form-select-sm bg-dark text-light border-secondary"
                      value={scopeSubsystem}
                      onChange={(e) => setScopeSubsystem(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Whole Project (All Subsystems)</option>
                      {project.rawSubsystems.map((s) => (
                        <option key={s._id || s.id} value={s.subsystemCode}>
                          Only Subsystem: {s.name} ({s.subsystemCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: REVIEW DIFF & CONFLICTS */}
            {step === 2 && previewData && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <span className="badge bg-secondary me-2">Current: v{previewData.currentVersion}</span>
                    <span className="badge bg-primary">Prospective: v{previewData.nextVersion}</span>
                  </div>
                  <div className="small text-muted">
                    {previewData.hasChanges ? "Changes detected" : "No changes detected"}
                  </div>
                </div>

                {/* 4 Cards Summary */}
                <div className="row g-2 mb-3">
                  <div className="col-3">
                    <div className="p-2 border rounded text-center bg-dark" style={{ borderColor: "#28a745" }}>
                      <div className="small text-muted">🟢 New</div>
                      <div className="h5 mb-0 text-success">{previewData.counts.new}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="p-2 border rounded text-center bg-dark" style={{ borderColor: "#6c757d" }}>
                      <div className="small text-muted">⚪ Exists</div>
                      <div className="h5 mb-0 text-secondary">{previewData.counts.unchanged}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="p-2 border rounded text-center bg-dark" style={{ borderColor: "#fd7e14" }}>
                      <div className="small text-muted">🟠 Changed</div>
                      <div className="h5 mb-0 text-warning">{previewData.counts.changed}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="p-2 border rounded text-center bg-dark" style={{ borderColor: "#dc3545" }}>
                      <div className="small text-muted">🔴 Conflicts</div>
                      <div className="h5 mb-0 text-danger">{previewData.counts.conflicts}</div>
                    </div>
                  </div>
                </div>

                {/* Conflicts Section */}
                {conflictItems.length > 0 && (
                  <div className="alert alert-danger py-2 mb-3">
                    <div className="fw-bold small mb-1">⚠️ Unresolved Conflicts Detected ({conflictItems.length}):</div>
                    <ul className="small mb-2 ps-3 list-unstyled">
                      {conflictItems.map((c, idx) => (
                        <li key={idx} className="mb-2 p-2 rounded bg-black bg-opacity-25 border border-danger border-opacity-50">
                          <div>
                            <strong>{c.frameName} &gt; {c.name}:</strong> {c.conflictReason}
                          </div>
                          {c.conflictType === "NAME_OVERLAP" && (
                            <div className="form-check mt-2 pt-1 border-top border-secondary">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`replaceName_${idx}`}
                                checked={replaceNameKeys.includes(c.key)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setReplaceNameKeys((prev) => [...prev, c.key]);
                                  } else {
                                    setReplaceNameKeys((prev) => prev.filter((k) => k !== c.key));
                                  }
                                }}
                              />
                              <label className="form-check-label text-warning fw-bold" htmlFor={`replaceName_${idx}`}>
                                🔄 Replace parameter name: replace current parameter "{c.existingOverlapName}" with the new name "{c.name}"
                              </label>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    {hasFrameLayoutConflict && (
                      <div className="alert alert-warning py-2 px-3 small mb-2 text-dark border-0">
                        ⚠️ <strong>Important Note:</strong> One or more conflicts affect the entire <strong>Frame Layout</strong>. Skipping conflicting items will cause the entire frame and all of its parameters to be skipped!
                      </div>
                    )}

                    <div className="form-check small">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="skipConflictsCheckbox"
                        checked={skipConflicts}
                        onChange={(e) => setSkipConflicts(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="skipConflictsCheckbox">
                        Skip conflicting items and apply only valid new / approved changes
                      </label>
                    </div>
                  </div>
                )}

                {/* Changed Parameters Table */}
                {changedItems.length > 0 && (
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <div className="small fw-bold">
                        Select Changed Parameters to Overwrite ({updateKeys.length}/{changedItems.length} selected):
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-warning btn-sm py-0 px-2 fw-bold"
                          id="btnSelectAllChanged"
                          onClick={handleSelectAllChanged}
                        >
                          ✓ Select All Changed
                        </button>
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-decoration-none py-0 px-1 text-muted small"
                          onClick={handleDeselectAllChanged}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="border border-secondary rounded overflow-auto" style={{ maxHeight: "200px" }}>
                      <table className="table table-dark table-sm table-hover mb-0 small">
                        <thead>
                          <tr>
                            <th style={{ width: "36px" }}>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                id="masterSelectAllChangedCheckbox"
                                title="Select All Changed"
                                checked={changedItems.length > 0 && updateKeys.length === changedItems.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    handleSelectAllChanged();
                                  } else {
                                    handleDeselectAllChanged();
                                  }
                                }}
                              />
                            </th>
                            <th>Parameter</th>
                            <th>Location</th>
                            <th>Field Changes (Old ➔ New)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changedItems.map((item) => {
                            const isChecked = updateKeys.includes(item.key);
                            return (
                              <tr key={item.key}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleUpdateKey(item.key)}
                                    className="form-check-input"
                                  />
                                </td>
                                <td><strong>{item.name}</strong></td>
                                <td className="text-muted">{item.subName} / {item.frameName}</td>
                                <td>
                                  {Object.entries(item.diff || {}).map(([f, vals]) => (
                                    <span key={f} className="badge bg-secondary me-1">
                                      {f}: <span className="text-danger">{String(vals.old)}</span> ➔ <span className="text-success">{String(vals.new)}</span>
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="small text-muted mt-1 fst-italic">
                      * Unchecked parameters will retain their existing database values.
                    </div>
                  </div>
                )}

                {previewData.counts.new === 0 && previewData.counts.changed === 0 && (
                  <div className="alert alert-info py-2 small mb-0">
                    All items in this file already exist in the database with identical values. Applying will make no modifications.
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: SUCCESS RESULT */}
            {step === 3 && applyResult && (
              <div className="text-center py-4">
                {(applyResult.applied?.new || 0) === 0 && (applyResult.applied?.updated || 0) === 0 ? (
                  <>
                    <div style={{ fontSize: "3rem" }}>⚠️</div>
                    <h5 className="mt-2 text-warning">No Changes Were Applied</h5>
                    <p className="small text-muted mb-3">
                      All items were skipped because they either had conflicts (and skip conflicts was selected) or already exist identically in the database.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "3rem" }}>🎉</div>
                    <h5 className="mt-2 text-success">Configuration Applied Successfully!</h5>
                    <p className="small text-muted mb-3">
                      Project is now at <strong>v{applyResult.version}</strong>.
                    </p>
                  </>
                )}
                <div className="row g-2 justify-content-center">
                  <div className="col-auto">
                    <span className="badge bg-success p-2">+{applyResult.applied?.new || 0} New</span>
                  </div>
                  <div className="col-auto">
                    <span className="badge bg-warning p-2">~{applyResult.applied?.updated || 0} Updated</span>
                  </div>
                  <div className="col-auto">
                    <span className="badge bg-secondary p-2">={applyResult.applied?.unchanged || 0} Unchanged</span>
                  </div>
                  {applyResult.applied?.skipped > 0 && (
                    <div className="col-auto">
                      <span className="badge bg-danger p-2">⊘ {applyResult.applied?.skipped} Skipped</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer border-secondary d-flex justify-content-between">
            {step === 1 && (
              <>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handlePreview}
                  disabled={!file || loading}
                >
                  {loading ? "Analyzing..." : "Next: Preview Changes ➔"}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={handleApply}
                  disabled={!canApply || loading}
                >
                  {loading ? "Applying..." : `Apply as v${previewData?.nextVersion || ""}`}
                </button>
              </>
            )}

            {step === 3 && (
              <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
