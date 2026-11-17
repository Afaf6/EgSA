import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectSelectedProject } from "../../../redux/slices/projectsSlice";
import {
  uploadMultipleTelemetryFiles,
  clearBatchUpload,
} from "../../../redux/slices/telemetrySlice";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Ban,
  MinusCircle,
  AlertCircle,
  X,
  RefreshCw,
  RotateCcw,
  FileText,
  Clock,
} from "lucide-react";
import {
  validateTimeoutInput,
  formatTimeoutDuration,
} from "../../../utils/timeoutHelper";

const MAX_BATCH_FILES = 20;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/** One-line frame counts for a finished file. */
function FileFrameCounts({ stats }) {
  if (!stats) return null;
  const rejected = Math.max(0, (stats.invalidFrames || 0) - (stats.nonTelemetryLines || 0));
  return (
    <span className="small text-muted ms-2">
      {stats.totalFrames || 0} found · {stats.validFrames || 0} valid · {rejected} rejected
      {stats.crcFailedStored > 0 ? ` · ${stats.crcFailedStored} CRC failed` : ""}
    </span>
  );
}

export default function BatchTelemetryUploader({
  onUploadComplete,
  timeoutSeconds = 90,
  timeoutError = "",
}) {
  const dispatch = useDispatch();
  const selectedProject = useSelector(selectSelectedProject);
  const [filesList, setFilesList] = useState([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [forceReupload, setForceReupload] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const filesListRef = useRef([]);
  const batchRunningRef = useRef(false);
  const cancelRemainingRef = useRef(false);
  const activeControllerRef = useRef(null);
  const controllersByFileRef = useRef(new Map());

  const updateFilesList = (updater) => {
    const nextFiles = typeof updater === "function" ? updater(filesListRef.current) : updater;
    filesListRef.current = nextFiles;
    setFilesList(nextFiles);
  };

  useEffect(() => () => {
    controllersByFileRef.current.forEach((controller) => controller.abort());
    controllersByFileRef.current.clear();
  }, []);

  const validateAndAddFiles = (incomingFiles) => {
    setValidationError("");
    if (!incomingFiles || incomingFiles.length === 0) return;

    const filesArray = Array.from(incomingFiles);
    const existing = filesListRef.current;
    const existingBytes = existing.reduce((sum, item) => sum + (item.file?.size || 0), 0);
    const knownFiles = new Set(existing.map((item) => `${item.name}\u0000${item.size}`));
    const newItems = [];
    let totalBytes = existingBytes;
    let skippedDuplicates = 0;
    let tooLarge = 0;
    let overCount = 0;
    let overTotal = 0;

    filesArray.forEach((file, index) => {
      const identity = `${file.name}\u0000${file.size}`;
      if (knownFiles.has(identity)) { skippedDuplicates += 1; return; }
      if (file.size > MAX_FILE_SIZE_BYTES) { tooLarge += 1; return; }
      if (existing.length + newItems.length >= MAX_BATCH_FILES) { overCount += 1; return; }
      if (totalBytes + file.size > MAX_TOTAL_SIZE_BYTES) { overTotal += 1; return; }
      knownFiles.add(identity);
      totalBytes += file.size;
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}-${file.name}`,
        file,
        name: file.name,
        size: file.size,
        status: "queued",
        error: null,
        storedRecords: 0,
        progress: 0,
      });
    });

    if (newItems.length) updateFilesList((prev) => [...prev, ...newItems]);
    const notices = [];
    if (skippedDuplicates) notices.push(`${skippedDuplicates} duplicate file(s) skipped (same name and size).`);
    if (tooLarge) notices.push(`${tooLarge} file(s) exceed the 50 MB per-file limit.`);
    if (overCount) notices.push(`Only ${MAX_BATCH_FILES} files can be listed; ${overCount} file(s) were not added.`);
    if (overTotal) notices.push(`${overTotal} file(s) were not added because the 200 MB total limit would be exceeded.`);
    setValidationError(notices.join(" "));
  };

  const handleRemoveFile = (id) => {
    const item = filesListRef.current.find((file) => file.id === id);
    const controller = controllersByFileRef.current.get(id);
    if (controller && ["uploading", "processing"].includes(item?.status)) {
      controller.abort();
      updateFilesList((prev) => prev.map((file) => file.id === id
        ? { ...file, status: "cancelled", error: "Upload cancelled." }
        : file));
      return;
    }
    controllersByFileRef.current.delete(id);
    updateFilesList((prev) => prev.filter((file) => file.id !== id));
    setValidationError("");
  };

  const handleClearAll = () => {
    if (isRunning && !window.confirm("Cancel the running upload and clear the entire file list?")) return;
    if (isRunning) handleCancelBatch();
    updateFilesList([]);
    setValidationError("");
    dispatch(clearBatchUpload());
  };

  const handleCancelBatch = () => {
    cancelRemainingRef.current = true;
    updateFilesList((prev) => prev.map((item) =>
      ["queued", "uploading", "processing"].includes(item.status)
        ? { ...item, status: "cancelled", error: "Batch cancelled." }
        : item
    ));
    activeControllerRef.current?.abort();
  };

  const uploadItems = async (items, { force = forceReupload } = {}) => {
    if (batchRunningRef.current) return;
    if (items.length === 0) {
      setValidationError("Please select at least one file to upload.");
      return;
    }

    const projectId = selectedProject?._id || selectedProject?.id;
    if (!projectId) {
      setValidationError("Please select an active mission project first.");
      return;
    }

    if (timeoutError) {
      setValidationError(`Cannot start batch upload: ${timeoutError}`);
      return;
    }

    const timeoutValidation = validateTimeoutInput(timeoutSeconds);
    if (!timeoutValidation.valid) {
      setValidationError(`Cannot start batch upload: ${timeoutValidation.error}`);
      return;
    }

    setValidationError("");
    batchRunningRef.current = true;
    setIsBatchRunning(true);
    cancelRemainingRef.current = false;
    const requestedIds = new Set(items.map((item) => item.id));
    let currentItem = null;
    try {
      if (force) updateFilesList((prev) => prev.map((item) => requestedIds.has(item.id)
        ? { ...item, status: "queued", error: null, progress: 0 }
        : item));
      while (!cancelRemainingRef.current) {
        const item = filesListRef.current.find((candidate) => candidate.status === "queued"
          && (!force || requestedIds.has(candidate.id)));
        if (!item) break;
        currentItem = item;
        const controller = new AbortController();
        activeControllerRef.current = controller;
        controllersByFileRef.current.set(item.id, controller);
        updateFilesList((prev) => prev.map((file) => file.id === item.id && file.status === "queued"
          ? { ...file, status: "uploading", progress: 0, error: null }
          : file));

        try {
          const actionResult = await dispatch(uploadMultipleTelemetryFiles({
            files: [item.file],
            projectId,
            force,
            timeout: timeoutValidation.value,
            signal: controller.signal,
            onProgress: (percent) => updateFilesList((prev) => prev.map((file) =>
              file.id === item.id && file.status !== "cancelled"
                ? { ...file, progress: percent, status: percent >= 100 ? "processing" : "uploading" }
                : file
            )),
          }));

          if (controller.signal.aborted) continue;
          if (uploadMultipleTelemetryFiles.fulfilled.match(actionResult)) {
            const payload = actionResult.payload?.data || actionResult.payload;
            const result = payload?.results?.[0];
            if (!result) throw new Error(`The server returned no result for ${item.name}.`);
            updateFilesList((prev) => prev.map((file) => file.id !== item.id || file.status === "cancelled"
              ? file
              : { ...file, status: result.status, error: result.error || null, timedOut: Boolean(result.timedOut),
                storedRecords: result.stats?.storedRecords || 0, stats: result.stats || null, progress: 100 }));
          } else {
            const message = actionResult.payload?.message || actionResult.payload || "Batch upload failed.";
            const errorMessage = typeof message === "string" ? message : "Batch upload failed.";
            updateFilesList((prev) => prev.map((file) => file.id === item.id && file.status !== "cancelled"
              ? { ...file, status: "failed", error: errorMessage }
              : file));
            setValidationError(errorMessage);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(`Batch telemetry upload failed for ${item.name}:`, error);
            updateFilesList((prev) => prev.map((file) => file.id === item.id && file.status !== "cancelled"
              ? { ...file, status: "failed", error: error?.message || "Upload failed to start." }
              : file));
            setValidationError(error?.message || `Failed to upload ${item.name}.`);
          }
        } finally {
          controllersByFileRef.current.delete(item.id);
          if (activeControllerRef.current === controller) activeControllerRef.current = null;
          currentItem = null;
        }
      }
    } catch (error) {
      console.error("Batch telemetry upload failed to start:", error);
      if (currentItem) updateFilesList((prev) => prev.map((item) => item.id === currentItem.id && item.status !== "cancelled"
        ? { ...item, status: "failed", error: error?.message || "Upload failed to start." }
        : item));
      setValidationError(error?.message || "Batch upload failed to start. Please try again.");
    } finally {
      activeControllerRef.current = null;
      controllersByFileRef.current.clear();
      cancelRemainingRef.current = false;
      batchRunningRef.current = false;
      setIsBatchRunning(false);
    }
    onUploadComplete?.();
  };

  const handleUploadBatch = () => uploadItems(filesListRef.current.filter((item) => item.status === "queued" || item.status === "waiting"));

  const handleRetryFailed = () => {
    const failedItems = filesListRef.current
      .filter((item) => ["rejected", "failed", "cancelled", "skipped"].includes(item.status))
      .map((item) => ({
        ...item,
        status: "queued",
        error: null,
        storedRecords: 0,
        progress: 0,
      }));

    updateFilesList((prev) => prev.map((item) => failedItems.find((retry) => retry.id === item.id) || item));
    setValidationError("");
    dispatch(clearBatchUpload());
    uploadItems(failedItems);
  };

  const handleForceReprocessDuplicates = async () => {
    setForceReupload(true);
    const projectId = selectedProject?._id || selectedProject?.id;
    if (!projectId) {
      setValidationError("Please select an active mission project first.");
      return;
    }

    const dupesToUpload = filesListRef.current.filter((item) => item.status === "duplicate");
    if (dupesToUpload.length === 0) return;

    setValidationError("");
    await uploadItems(dupesToUpload, { force: true });
  };

  const handleForceSingleReprocess = async (item) => {
    const projectId = selectedProject?._id || selectedProject?.id;
    if (!projectId) {
      setValidationError("Please select an active mission project first.");
      return;
    }
    await uploadItems([item], { force: true });
  };

  // Compute summary stats
  const hasFinished = filesList.length > 0 && filesList.every((item) =>
    !["waiting", "queued", "uploading", "processing"].includes(item.status)
  );

  const countProcessed = filesList.filter((f) => ["processed", "reprocessed"].includes(f.status)).length;
  const countDuplicates = filesList.filter((f) => f.status === "duplicate").length;
  const countRejected = filesList.filter((f) => f.status === "rejected").length;
  const countFailed = filesList.filter((f) => f.status === "failed").length;
  const countSkipped = filesList.filter((f) => f.status === "skipped").length;
  const countCancelled = filesList.filter((f) => f.status === "cancelled").length;
  const isRunning = isBatchRunning || filesList.some((item) => ["uploading", "processing"].includes(item.status));
  const hasRetryableFiles = countRejected > 0 || countFailed > 0 || countCancelled > 0 || countSkipped > 0;
  const totalProgress = filesList.length
    ? Math.round(filesList.reduce((sum, item) => sum + (["processed", "reprocessed", "duplicate", "rejected", "failed", "skipped"].includes(item.status) ? 100 : item.progress || 0), 0) / filesList.length)
    : 0;
  const progressTone = isRunning ? "bg-info" : countFailed > 0 ? "bg-danger" : hasRetryableFiles ? "bg-warning" : "bg-success";

  const summaryParts = [];
  if (countProcessed > 0) summaryParts.push(`${countProcessed} decoded`);
  if (countDuplicates > 0) summaryParts.push(`${countDuplicates} already processed`);
  if (countRejected > 0) summaryParts.push(`${countRejected} rejected`);
  if (countFailed > 0) summaryParts.push(`${countFailed} failed`);
  if (countSkipped > 0) summaryParts.push(`${countSkipped} skipped`);
  if (countCancelled > 0) summaryParts.push(`${countCancelled} cancelled`);

  const summaryLine =
    summaryParts.length > 0
      ? `${filesList.length} files: ${summaryParts.join(", ")}`
      : "";
  return (
    <div className="d-flex flex-column gap-3">
      {/* Action Header / Top Controls */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-3 rounded bg-dark bg-opacity-25 border border-secondary border-opacity-25">
        <div className="d-flex align-items-center gap-3">
          <UploadCloud size={20} className="text-info" />
          <div>
            <h6 className="mb-0 text-light">Batch Telemetry File Ingestion</h6>
            <div className="small text-muted" style={{ fontSize: "0.78rem" }}>
              Upload up to 20 raw telemetry files simultaneously for sequential decoding
            </div>
          </div>
          <div className="badge bg-info bg-opacity-15 text-info border border-info border-opacity-30 px-3 py-1-5 d-flex align-items-center gap-2">
            <span>Target Mission:</span>
            <strong>{selectedProject?.name || "No Project Selected"}</strong>
            <span className="font-monospace text-muted" style={{ fontSize: "0.72rem" }}>
              [{selectedProject?._id || selectedProject?.id || "None"}]
            </span>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <label
            className="form-check form-check-inline mb-0 small text-muted user-select-none"
            style={{ cursor: "pointer" }}
          >
            <input
              type="checkbox"
              className="form-check-input"
              checked={forceReupload}
              onChange={(e) => setForceReupload(e.target.checked)}
              disabled={isRunning}
            />
            <span className="ms-1">Force re-process if already uploaded</span>
          </label>

          <label
            className="btn btn-sm btn-outline-info mb-0 d-flex align-items-center gap-1"
            style={{ cursor: "pointer" }}
          >
            <UploadCloud size={15} />
            <span>Select Multiple Files</span>
            <input
              ref={fileInputRef}
              data-testid="batch-file-input"
              type="file"
              accept=".txt,.log,text/plain"
              multiple
              hidden
              onChange={(e) => {
                validateAndAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {filesList.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={handleClearAll}
            >
              Clear List
            </button>
          )}
        </div>
      </div>

      {/* Validation Error Alert */}
      {validationError && (
        <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-0">
          <AlertCircle size={16} />
          <span>{validationError}</span>
        </div>
      )}

      {/* Drag & Drop Zone */}
      {filesList.length === 0 && (
        <div
          className={`rounded-3 p-5 text-center transition-all ${
            isDragging
              ? "border border-info bg-info bg-opacity-10"
              : "border border-secondary border-opacity-25 bg-dark bg-opacity-25"
          }`}
          style={{ borderStyle: "dashed", cursor: "pointer" }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              validateAndAddFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={36} className={`mb-2 ${isDragging ? "text-info" : "text-muted"}`} />
          <h6 className="mb-1 text-light">Drag & Drop Multiple Telemetry Files (.txt / .log)</h6>
          <p className="small text-muted mb-3" style={{ fontSize: "0.82rem" }}>
            Select up to 20 files (max 50 MB each, total request up to 200 MB)
          </p>
          <button type="button" className="btn btn-sm btn-egse-primary">
            Choose Files
          </button>
        </div>
      )}

      {/* Progress Bar while Uploading */}
      {filesList.length > 0 && (
        <div className="p-3 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-25">
          <div className="d-flex justify-content-between align-items-center small text-light mb-2">
            <span className="d-flex align-items-center gap-2">
              {isRunning ? <RefreshCw size={14} className="spinner-border spinner-border-sm text-info" /> : countCancelled > 0 ? <Ban size={15} className="text-warning" /> : hasRetryableFiles ? <AlertTriangle size={15} className="text-warning" /> : <CheckCircle2 size={15} className="text-success" />}
              <span>{filesList.filter((item) => !["waiting", "queued", "uploading", "processing"].includes(item.status)).length} / {filesList.length} files / {countProcessed} done / {countRejected} rejected / {countFailed} failed / {countCancelled} cancelled</span>
            </span>
            <strong className={isRunning ? "text-info" : hasRetryableFiles ? "text-warning" : "text-success"}>{totalProgress}%</strong>
          </div>
          <div className="progress" style={{ height: "8px", backgroundColor: "var(--egse-bg-raised)" }}>
            <div
              className={`progress-bar ${isRunning ? "progress-bar-striped progress-bar-animated" : ""} ${progressTone}`}
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          {isRunning && <div className="d-flex gap-2 mt-2"><button type="button" className="btn btn-sm btn-outline-warning" onClick={handleCancelBatch}>Cancel Batch</button></div>}
        </div>
      )}

      {/* Selected Files List & Status Table */}
      {filesList.length > 0 && (
        <div className="rounded border border-secondary border-opacity-25 overflow-hidden">
          <div className="table-responsive mb-0">
            <table className="table table-dark table-hover align-middle mb-0" style={{ fontSize: "0.85rem" }}>
              <thead style={{ backgroundColor: "var(--egse-bg-raised)" }}>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>File Name</th>
                  <th style={{ width: "120px" }}>Size</th>
                  <th style={{ minWidth: "220px" }}>Status</th>
                  <th style={{ width: "60px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filesList.map((item, index) => (
                  <tr key={item.id}>
                    <td className="text-muted">{index + 1}</td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <FileText size={15} className="text-info flex-shrink-0" />
                        <span className="font-monospace text-light">{item.name}</span>
                      </div>
                    </td>
                    <td className="text-muted">{formatFileSize(item.size)}</td>
                    <td>
                      {/* Waiting */}
                      {["waiting", "queued"].includes(item.status) && (
                        <span className="badge bg-secondary text-light">Queued</span>
                      )}

                      {item.status === "uploading" && <div><span className="badge bg-info text-dark">Uploading {item.progress || 0}%</span><div className="progress mt-1" style={{ height: 5, backgroundColor: "var(--egsa-bg-raised, var(--egse-bg-raised))" }}><div className="progress-bar bg-info" style={{ width: `${item.progress || 0}%` }} /></div></div>}

                      {/* Processing */}
                      {item.status === "processing" && (
                        <span className="badge bg-info text-dark d-inline-flex align-items-center gap-1">
                          <RefreshCw size={11} className="spinner-border spinner-border-sm" />
                          Decoding...
                        </span>
                      )}

                      {/* Reprocessed */}
                      {(item.status === "reprocessed" || item.reprocessed) && (
                        <span className="text-info d-inline-flex align-items-center gap-1">
                          <RotateCcw size={15} />
                          <strong>Reprocessed</strong>
                          <span className="small text-muted ms-1">
                            ({item.storedRecords} frames updated)
                          </span>
                          <FileFrameCounts stats={item.stats} />
                        </span>
                      )}

                      {/* Done (Processed) */}
                      {item.status === "processed" && !item.reprocessed && (
                        <span className="text-success d-inline-flex align-items-center gap-1">
                          <CheckCircle2 size={15} />
                          <strong>Done</strong>
                          <span className="small text-muted ms-1">
                            ({item.storedRecords} frames stored{item.stats?.linkedRecords > 0 ? `, ${item.stats.linkedRecords} linked` : ""}{item.stats?.storedFileName ? `, saved as "${item.stats.storedFileName}"` : ""})
                          </span>
                          <FileFrameCounts stats={item.stats} />
                        </span>
                      )}

                      {/* Already Processed (Duplicate) */}
                      {item.status === "duplicate" && !item.reprocessed && (
                        <div className="d-flex align-items-center gap-2">
                          <span className="text-warning text-opacity-75 d-inline-flex align-items-center gap-1">
                            <MinusCircle size={15} />
                            <span>Already processed (Skipped)</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-warning py-0 px-2"
                            style={{ fontSize: "0.72rem" }}
                            onClick={() => handleForceSingleReprocess(item)}
                            title="Force re-processing of this specific file with current configuration"
                          >
                            Re-process
                          </button>
                        </div>
                      )}

                      {/* Rejected */}
                      {item.status === "rejected" && (
                        <span className="text-danger d-inline-flex align-items-center gap-1">
                          <AlertCircle size={15} />
                          <strong>Rejected:</strong>
                          <span className="small">{item.error || "File not accepted"}</span>
                        </span>
                      )}

                      {/* Failed */}
                      {item.status === "failed" && (
                        <span className="text-danger d-inline-flex align-items-center gap-1">
                          <AlertCircle size={15} />
                          <strong>Failed:</strong>
                          <span className="small">{item.timedOut && <strong>Timed out: </strong>}{item.error || "Decoding failed"}</span>
                        </span>
                      )}
                      {/* Skipped */}
                      {item.status === "skipped" && (
                        <span className="text-secondary d-inline-flex align-items-center gap-1">
                          <MinusCircle size={15} />
                          <strong>Skipped:</strong>
                          <span className="small">{item.error || "Batch timeout reached before file could start"}</span>
                        </span>
                      )}

                      {/* Cancelled */}
                      {item.status === "cancelled" && (
                        <span className="text-warning d-inline-flex align-items-center gap-1">
                          <Ban size={15} />
                          <strong>Cancelled:</strong>
                          <span className="small">{item.error || "Upload cancelled"}</span>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0"
                        title={["uploading", "processing"].includes(item.status) ? "Cancel file upload" : "Remove file"}
                        aria-label={["uploading", "processing"].includes(item.status) ? "Cancel file upload" : "Remove file"}
                        onClick={() => handleRemoveFile(item.id)}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Action Footer */}
          <div className="p-3 bg-dark bg-opacity-50 border-top border-secondary border-opacity-25 d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              {hasFinished && summaryLine && (
                <div className="fw-semibold text-light small d-flex align-items-center gap-2">
                  <CheckCircle2 size={16} className="text-info" />
                  <span>{summaryLine}</span>
                </div>
              )}
            </div>

            <div className="d-flex align-items-center gap-2">
              {hasFinished && countDuplicates > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
                  disabled={isRunning}
                  onClick={handleForceReprocessDuplicates}
                  title="Force re-upload and decode files that were skipped as duplicates"
                >
                  <RotateCcw size={14} />
                  <span>Force Re-process & Decode ({countDuplicates})</span>
                </button>
              )}

              {hasFinished && hasRetryableFiles && (
                <button
                  type="button"
                  className="btn btn-sm btn-warning d-inline-flex align-items-center gap-1"
                  onClick={handleRetryFailed}
                >
                  <RotateCcw size={14} />
                  <span>Try failed again</span>
                </button>
              )}

              {isRunning && (
                <button
                  type="button"
                  className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2"
                  disabled
                >
                  <UploadCloud size={16} />
                  <span>Uploading batch...</span>
                </button>
              )}
              {!isRunning && filesList.some((item) => item.status === "queued" || item.status === "waiting") && (
                <button
                  type="button"
                  className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2"
                  disabled={Boolean(timeoutError)}
                  onClick={handleUploadBatch}
                >
                  <UploadCloud size={16} />
                  <span>Upload & decode {filesList.filter((item) => item.status === "queued" || item.status === "waiting").length} files</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
