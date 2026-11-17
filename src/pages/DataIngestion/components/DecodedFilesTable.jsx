import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { selectSelectedProject } from "../../../redux/slices/projectsSlice";
import {
  fetchProcessedFiles,
  selectProcessedFiles,
  selectProcessedFilesPagination,
  selectProcessedFilesLoading,
  selectProcessedFilesError,
} from "../../../redux/slices/telemetrySlice";
import telemetryService from "../../../services/telemetryService";
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Database,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Cpu,
  Trash2,
} from "lucide-react";

const EMPTY_FILES = [];

// Why a row is still "Processing" (processingOwner from the server). A row is never released
// while its owner might still be writing, so the explanation is all the UI can safely offer.
const PROCESSING_OWNER_NOTES = {
  live: { label: "Processing" },
  unknown: {
    label: "Processing (owner unverified)",
    detail: "Another backend instance holds this file and this server cannot confirm it has stopped. It is left untouched to avoid corrupting data. It finishes or is recovered when that backend completes or restarts; if it stays here, an administrator should check or restart the other backend.",
  },
  dead: {
    label: "Interrupted",
    detail: "The upload that held this file stopped. Its partial records are cleaned up automatically on the next upload of this file or the next server start.",
  },
};

function getDeduplicatedSubsystems(subsystems) {
  if (!Array.isArray(subsystems) || subsystems.length === 0) return [];
  const map = new Map();
  for (const sub of subsystems) {
    if (!sub) continue;
    const key = String(sub.id || sub._id || sub.name || sub.code || "").trim().toLowerCase();
    if (key && !map.has(key)) {
      map.set(key, sub);
    }
  }
  return Array.from(map.values());
}

function FileDetails({ file, onClose }) {
  return (
    <div className="p-3" onClick={(event) => event.stopPropagation()} style={{ backgroundColor: "var(--egse-bg-raised)", borderTop: "1px solid var(--egse-border-soft)", color: "var(--egse-text-primary)" }}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center gap-2"><Database size={16} style={{ color: "var(--egse-accent-cyan)" }} /><span className="fw-bold small">File processing details: {file.fileName}</span></div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close details</button>
      </div>
      <div className="row g-3 small">
        <div className="col-12 col-md-3"><span className="d-block" style={{ color: "var(--egse-text-muted)" }}>Original Upload Name:</span><span className="font-monospace">{file.originalName || "N/A"}</span></div>
        <div className="col-12 col-md-3"><span className="d-block" style={{ color: "var(--egse-text-muted)" }}>Subsystems Contained:</span><span>{getDeduplicatedSubsystems(file.subsystems).map((s) => `${s.name || s.code}${s.code ? ` (${s.code})` : ""}`).join(", ") || "—"}</span></div>
        <div className="col-12 col-md-3"><span className="d-block" style={{ color: "var(--egse-text-muted)" }}>Stored DB Records:</span><span>{(file.stats?.storedRecords || 0).toLocaleString()} records saved{file.stats?.linkedRecords > 0 ? ` (${file.stats.linkedRecords.toLocaleString()} shared with other files)` : ""}</span></div>
        <div className="col-12 col-md-3"><span className="d-block" style={{ color: "var(--egse-text-muted)" }}>Raw Lines Processed:</span><span>{(file.stats?.totalLines || 0).toLocaleString()} lines</span></div>
      </div>
      {file.errorMessage && <div className="mt-2 p-2 rounded small" style={{ backgroundColor: "var(--egse-alarm-bg)", color: "var(--egse-alarm)" }}><strong>Error Log:</strong> {file.errorMessage}</div>}
    </div>
  );
}

export default function DecodedFilesTable({ onSwitchToUpload, onInspectFile }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const selectedProject = useSelector(selectSelectedProject);
  const projectId = selectedProject?._id || selectedProject?.id;

  const rawFiles = useSelector(selectProcessedFiles);
  const files = Array.isArray(rawFiles) ? rawFiles : EMPTY_FILES;
  const pagination = useSelector(selectProcessedFilesPagination) || { page: 1, limit: 25, total: 0, pages: 1 };
  const isLoading = useSelector(selectProcessedFilesLoading);
  const error = useSelector(selectProcessedFilesError);

  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [expandedFileId, setExpandedFileId] = useState(null);
  const [frameSelectorModal, setFrameSelectorModal] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [subsystemFilter, setSubsystemFilter] = useState("all");
  const [showFailed, setShowFailed] = useState(false);

  const projectSubsystems = useMemo(() => {
    if (Array.isArray(selectedProject?.rawSubsystems) && selectedProject.rawSubsystems.length > 0) {
      return selectedProject.rawSubsystems;
    }
    if (Array.isArray(selectedProject?.subsystems)) {
      return selectedProject.subsystems.map((s) => {
        if (typeof s === "object" && s !== null) return s;
        return { _id: s, id: s, name: s, subsystemCode: s };
      });
    }
    return [];
  }, [selectedProject]);

  const loadFiles = useCallback(
    (page = 1, search = searchQuery, subFilter = subsystemFilter) => {
      if (!projectId) return;
      dispatch(
        fetchProcessedFiles({
          projectId,
          params: {
            page,
            limit: 20,
            search: search.trim() || undefined,
            subsystemId: subFilter !== "all" ? subFilter : undefined,
            includeFailed: showFailed,
          },
        })
      );
    },
    [dispatch, projectId, searchQuery, subsystemFilter, showFailed]
  );

  useEffect(() => {
    if (projectId) {
      loadFiles(1);
      setCurrentPage(1);
    }
  }, [projectId, loadFiles]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadFiles(1, searchQuery, subsystemFilter);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > (pagination.pages || 1)) return;
    setCurrentPage(newPage);
    loadFiles(newPage, searchQuery, subsystemFilter);
  };

  const handleDownloadExcel = async (file, specificFrameName = null) => {
    if (!file || downloadingFile) return;

    const stored = file.stats?.storedRecords || 0;
    const valid = file.stats?.validFrames || 0;
    if (stored === 0 && valid === 0) {
      alert(`File "${file.originalName || file.fileName}" has no decoded data available to export.`);
      return;
    }

    const frameEntries = Object.entries(file.stats?.frameSummary || {});
    // If file has multiple frames and none specified, show selector to prevent frame mixing
    if (!specificFrameName && frameEntries.length > 1) {
      setFrameSelectorModal({
        file,
        frames: frameEntries.map(([name, count]) => ({ name, count })),
      });
      return;
    }

    const frameToExport = specificFrameName || (frameEntries.length === 1 ? frameEntries[0][0] : null);

    try {
      setDownloadingFile(file.fileName);
      const params = {
        projectId,
        sourceFile: file.fileName,
      };
      if (frameToExport) {
        params.frameName = frameToExport;
      }
      const safeSuffix = frameToExport ? `_${frameToExport.replace(/\s+/g, '_')}` : '';
      const baseName = (file.originalName || file.fileName).replace(/\.[^/.]+$/, '');
      await telemetryService.downloadExcel(
        params,
        `${baseName}${safeSuffix}_decoded_tlm.xlsx`
      );
    } catch (err) {
      console.error("Failed to download Excel for file:", file.fileName, err);
      alert(`Failed to download Excel file: ${err.message || "An error occurred during export"}`);
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDownloadCsv = handleDownloadExcel;

  const handleDownloadAllFramesSeparately = async (file, frames) => {
    if (!file || !frames || frames.length === 0) return;
    setFrameSelectorModal(null);
    for (const f of frames) {
      await handleDownloadCsv(file, f.name);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const handleViewInHistory = (file) => {
    navigate(`/project/${projectId}/history?sourceFile=${encodeURIComponent(file.fileName)}`);
  };

  const toggleDetails = (fileId, element) => {
    const nextId = expandedFileId === fileId ? null : fileId;
    setExpandedFileId(nextId);
    if (nextId && element) requestAnimationFrame(() => element.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const handleDelete = async (file) => {
    const records = file.stats?.storedRecords || 0;
    if (!window.confirm(`Delete this file and its ${records} decoded records? Records shared with other files are kept for those files. This cannot be undone.`)) return;
    try {
      const deleted = await telemetryService.deleteProcessedFile(projectId, file._id || file.id);
      const result = deleted?.data || deleted;
      if (expandedFileId === (file._id || file.id || file.fileName)) setExpandedFileId(null);
      loadFiles(currentPage);
      if (result?.fileKept) window.alert(`${result.uncertainRecords} records could not be attributed to a single file, so the file was kept.`);
      else if (result?.keptForOtherFiles > 0) window.alert(`File deleted. ${result.keptForOtherFiles} shared records were kept for other files.`);
      else window.alert("File and decoded records deleted successfully.");
    } catch (err) {
      window.alert(`Failed to delete file: ${err.message || "An error occurred."}`);
    }
  };

  const handleCleanupEmpty = async () => {
    try {
      const result = await telemetryService.cleanupEmptyProcessedFiles(projectId, false);
      const count = result?.data?.count ?? result?.count ?? 0;
      if (!count) return window.alert("No empty files need cleanup.");
      if (!window.confirm(`Delete ${count} empty processed file records? This cannot be undone.`)) return;
      const deleted = await telemetryService.cleanupEmptyProcessedFiles(projectId, true);
      const deletedCount = deleted?.data?.deletedFiles ?? deleted?.deletedFiles ?? count;
      loadFiles(1);
      window.alert(`${deletedCount} empty file records deleted successfully.`);
    } catch (err) { window.alert(`Failed to clean up empty files: ${err.message || "An error occurred."}`); }
  };

  // Filtered files by status dropdown and subsystem on the frontend
  const filteredFiles = useMemo(() => {
    let list = files;
    list = showFailed ? list : list.filter((f) => f.status === "completed" && (f.stats?.storedRecords || 0) > 0);
    if (statusFilter !== "all") {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (subsystemFilter !== "all") {
      list = list.filter((f) => {
        if (Array.isArray(f.subsystems) && f.subsystems.length > 0) {
          return f.subsystems.some(
            (s) =>
              (s.id && String(s.id) === String(subsystemFilter)) ||
              (s._id && String(s._id) === String(subsystemFilter)) ||
              (s.code && String(s.code).toLowerCase() === String(subsystemFilter).toLowerCase()) ||
              (s.name && String(s.name).toLowerCase() === String(subsystemFilter).toLowerCase())
          );
        }
        return true;
      });
    }
    return list;
  }, [files, statusFilter, subsystemFilter, showFailed]);

  // Aggregate stats across current page
  const statsSummary = useMemo(() => {
    let totalFrames = 0;
    let validFrames = 0;
    let invalidFrames = 0;
    let totalParams = 0;

    files.forEach((f) => {
      if (f.stats) {
        totalFrames += f.stats.totalFrames || 0;
        validFrames += f.stats.validFrames || 0;
        invalidFrames += f.stats.invalidFrames || 0;
        totalParams += f.stats.totalParameters || 0;
      }
    });

    const successRate = totalFrames > 0 ? Math.round((validFrames / totalFrames) * 100) : 100;

    return { totalFrames, validFrames, invalidFrames, totalParams, successRate };
  }, [files]);

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const renderStatusBadge = (status, file = null) => {
    switch (status) {
      case "completed": {
        const stored = file?.stats?.storedRecords || 0;
        const valid = file?.stats?.validFrames || 0;
        const totalLines = file?.stats?.totalLines || 0;
        if (stored === 0 && valid === 0) {
          if (totalLines === 0 || file?.fileSize === 0) {
            return (
              <span
                className="badge d-inline-flex align-items-center gap-1"
                style={{
                  backgroundColor: "var(--egse-bg-raised)",
                  color: "var(--egse-text-secondary)",
                  border: "1px solid var(--egse-border-soft)",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                }}
                title="The file is empty and contains no telemetry lines"
              >
                <Clock size={12} />
                Empty File
              </span>
            );
          }
          return (
            <span
              className="badge d-inline-flex align-items-center gap-1"
              style={{
                backgroundColor: "var(--egse-warning-bg)",
                color: "var(--egse-warning)",
                border: "1px solid var(--egse-warning-border)",
                fontSize: "0.75rem",
                padding: "4px 8px",
              }}
              title="The file was processed, but no valid frames or decoded readings were found"
            >
              <AlertCircle size={12} />
              No Decoded Data
            </span>
          );
        }
        return (
          <span
            className="badge d-inline-flex align-items-center gap-1"
            style={{
              backgroundColor: "var(--egse-nominal-bg)",
              color: "var(--egse-nominal)",
              border: "1px solid var(--egse-nominal-border)",
              fontSize: "0.75rem",
              padding: "4px 8px",
            }}
          >
            <CheckCircle2 size={12} />
            Completed
          </span>
        );
      }
      case "processing": {
        const owner = PROCESSING_OWNER_NOTES[file?.processingOwner];
        return (
          <span className="d-inline-flex flex-column gap-1">
            <span
              className="badge d-inline-flex align-items-center gap-1"
              style={{
                backgroundColor: "var(--egse-raw-bg)",
                color: "var(--egse-raw)",
                border: "1px solid var(--egse-raw-border)",
                fontSize: "0.75rem",
                padding: "4px 8px",
              }}
              title={owner?.detail}
            >
              <RefreshCw size={12} className="spin-anim" />
              {owner ? owner.label : "Processing"}
            </span>
            {owner?.detail && (
              <span className="small" style={{ color: "var(--egse-text-muted)", maxWidth: 260, whiteSpace: "normal" }} data-testid="processing-owner-note">
                {owner.detail}
              </span>
            )}
          </span>
        );
      }
      case "failed":
      case "rejected":
        return (
          <span
            className="badge d-inline-flex align-items-center gap-1"
            style={{
              backgroundColor: "var(--egse-alarm-bg)",
              color: "var(--egse-alarm)",
              border: "1px solid var(--egse-alarm-border)",
              fontSize: "0.75rem",
              padding: "4px 8px",
            }}
          >
            <AlertCircle size={12} />
            Failed
          </span>
        );
      default:
        return (
          <span
            className="badge d-inline-flex align-items-center gap-1"
            style={{
              backgroundColor: "var(--egse-bg-raised)",
              color: "var(--egse-text-secondary)",
              border: "1px solid var(--egse-border-soft)",
              fontSize: "0.75rem",
              padding: "4px 8px",
            }}
          >
            <Clock size={12} />
            {status || "Unknown"}
          </span>
        );
    }
  };

  if (!projectId) {
    return (
      <div className="card egse-card p-4 text-center">
        <p className="text-muted mb-0">Select a project to view decoded telemetry files.</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. Metrics Header Summary */}
      <div className="row g-2">
        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="p-3 rounded d-flex align-items-center justify-content-between"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              border: "1px solid var(--egse-border-soft)",
            }}
          >
            <div>
              <div className="small text-uppercase tracking-wider" style={{ color: "var(--egse-text-muted)" }}>
                Decoded Files
              </div>
              <div className="h4 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                {pagination.total || files.length}
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: "var(--egse-raw-bg)", color: "var(--egse-raw)" }}
            >
              <FileCheck2 size={20} />
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="p-3 rounded d-flex align-items-center justify-content-between"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              border: "1px solid var(--egse-border-soft)",
            }}
          >
            <div>
              <div className="small text-uppercase tracking-wider" style={{ color: "var(--egse-text-muted)" }}>
                Total Frames
              </div>
              <div className="h4 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                {statsSummary.totalFrames.toLocaleString()}
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: "var(--egse-bg-raised)", color: "var(--egse-text-secondary)" }}
            >
              <Layers size={20} />
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="p-3 rounded d-flex align-items-center justify-content-between"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              border: "1px solid var(--egse-border-soft)",
            }}
          >
            <div>
              <div className="small text-uppercase tracking-wider" style={{ color: "var(--egse-text-muted)" }}>
                Valid Decode Rate
              </div>
              <div className="h4 mb-0 fw-bold" style={{ color: "var(--egse-nominal)" }}>
                {statsSummary.successRate}%
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: "var(--egse-nominal-bg)", color: "var(--egse-nominal)" }}
            >
              <ShieldCheck size={20} />
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div
            className="p-3 rounded d-flex align-items-center justify-content-between"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              border: "1px solid var(--egse-border-soft)",
            }}
          >
            <div>
              <div className="small text-uppercase tracking-wider" style={{ color: "var(--egse-text-muted)" }}>
                Parameters Extracted
              </div>
              <div className="h4 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                {statsSummary.totalParams.toLocaleString()}
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: "var(--egse-warning-bg)", color: "var(--egse-warning)" }}
            >
              <Database size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar (Search, Filter, Refresh) */}
      <div
        className="p-3 rounded d-flex flex-wrap align-items-center justify-content-between gap-3"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          border: "1px solid var(--egse-border-soft)",
        }}
      >
        <form onSubmit={handleSearchSubmit} className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: "420px" }}>
          <div className="input-group">
            <span
              className="input-group-text border-end-0"
              style={{
                backgroundColor: "var(--egse-bg-raised)",
                borderColor: "var(--egse-border-soft)",
                color: "var(--egse-text-muted)",
              }}
            >
              <Search size={16} />
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              placeholder="Search by file name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: "var(--egse-bg-raised)",
                borderColor: "var(--egse-border-soft)",
                color: "var(--egse-text-primary)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setSearchQuery("");
                  loadFiles(1, "");
                }}
              >
                Clear
              </button>
            )}
          </div>
          <button type="submit" className="btn btn-outline-info btn-sm px-3">
            Search
          </button>
        </form>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label className="form-check form-switch small mb-0 d-flex align-items-center gap-2" style={{ color: "var(--egse-text-secondary)" }}>
            <input className="form-check-input" type="checkbox" checked={showFailed} onChange={(e) => { setShowFailed(e.target.checked); setCurrentPage(1); }} />
            Show failed / empty files
          </label>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={handleCleanupEmpty}>Clean up empty files</button>
          {/* Subsystem filter */}
          <div className="d-flex align-items-center gap-1">
            <select
              className="form-select form-select-sm"
              value={subsystemFilter}
              onChange={(e) => {
                const val = e.target.value;
                setSubsystemFilter(val);
                setCurrentPage(1);
                loadFiles(1, searchQuery, val);
              }}
              style={{
                backgroundColor: "var(--egse-bg-raised)",
                borderColor: "var(--egse-border-soft)",
                color: "var(--egse-text-primary)",
                width: "auto",
                minWidth: "170px",
              }}
              title="Filter by Subsystem"
            >
              <option value="all">All Subsystems</option>
              {projectSubsystems.map((sub) => {
                const subId = sub._id || sub.id || sub.subsystemCode || sub.name;
                const subName = sub.name || sub.subsystemCode || "Subsystem";
                const subCode = sub.subsystemCode ? ` (${sub.subsystemCode})` : "";
                return (
                  <option key={subId} value={subId}>
                    {subName}{subCode}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Status filter */}
          <select
            className="form-select form-select-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              backgroundColor: "var(--egse-bg-raised)",
              borderColor: "var(--egse-border-soft)",
              color: "var(--egse-text-primary)",
              width: "auto",
            }}
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed Only</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Refresh button */}
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => loadFiles(currentPage)}
            disabled={isLoading}
            title="Refresh list"
          >
            <RefreshCw size={14} className={isLoading ? "spin-anim" : ""} />
            <span>Refresh</span>
          </button>

          {/* Quick Switch to Upload */}
          {onSwitchToUpload && (
            <button
              type="button"
              className="btn btn-info btn-sm d-flex align-items-center gap-1"
              onClick={onSwitchToUpload}
            >
              <span>Upload New File</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 3. Error Banner */}
      {error && (
        <div
          className="alert alert-danger d-flex align-items-center justify-content-between p-3"
          style={{ backgroundColor: "var(--egse-alarm-bg)", border: "1px solid var(--egse-alarm-border)" }}
        >
          <div className="d-flex align-items-center gap-2 text-danger">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => loadFiles(currentPage)}
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Table / Content Area */}
      <div
        className="rounded overflow-hidden"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          border: "1px solid var(--egse-border-soft)",
        }}
      >
        {isLoading && files.length === 0 ? (
          <div className="p-5 text-center">
            <RefreshCw size={28} className="spin-anim text-info mb-2" />
            <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
              Loading decoded telemetry files...
            </p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-5 text-center">
            <FileText size={40} className="text-muted mb-2 opacity-50" />
            <h6 className="fw-bold mb-1" style={{ color: "var(--egse-text-primary)" }}>
              No decoded files have been recorded yet
            </h6>
            <p className="small mb-3" style={{ color: "var(--egse-text-muted)" }}>
              {searchQuery
                ? `No files match "${searchQuery}"`
                : "Upload a telemetry file (.tlm, .hex, .raw, .log) to decode it and extract parameters."}
            </p>
            {onSwitchToUpload && (
              <button
                type="button"
                className="btn btn-info btn-sm px-4"
                onClick={onSwitchToUpload}
              >
                Go to Upload
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="d-none d-xxl-block">
              <table className="table table-hover align-middle mb-0" style={{ color: "var(--egse-text-primary)", width: "100%" }}>
                <thead
                  style={{
                    backgroundColor: "var(--egse-bg-raised)",
                    borderBottom: "1px solid var(--egse-border-soft)",
                    color: "var(--egse-text-secondary)",
                    fontSize: "0.78rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  <tr>
                    <th scope="col" style={{ width: "38px" }}></th>
                    <th scope="col">File Name</th>
                    <th scope="col">Subsystems</th>
                    <th scope="col">Status</th>
                    <th scope="col">Processed At</th>
                    <th scope="col">Frame Decoding</th>
                    <th scope="col">Extracted Parameters</th>
                    <th scope="col" className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => {
                    const fileId = file._id || file.id || file.fileName;
                    const isExpanded = expandedFileId === fileId;
                    const isDownloading = downloadingFile === file.fileName;
                    const totalFrames = file.stats?.totalFrames || 0;
                    const validFrames = file.stats?.validFrames || 0;
                    const invalidFrames = file.stats?.invalidFrames || 0;
                    const totalParams = file.stats?.totalParameters || 0;
                    const frameHealth = totalFrames > 0 ? Math.round((validFrames / totalFrames) * 100) : 100;

                    return (
                      <Fragment key={fileId}>
                        <tr
                          onClick={(event) => toggleDetails(fileId, event.currentTarget)}
                          onKeyDown={(event) => { if (event.key === "Enter") toggleDetails(fileId, event.currentTarget); }}
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          style={{
                            borderBottom: "1px solid var(--egse-border-soft)",
                            backgroundColor: isExpanded ? "var(--egse-raw-bg)" : "transparent",
                          }}
                        >
                          {/* Expand / Collapse toggle */}
                          <td>
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0 text-decoration-none"
                              style={{ color: "var(--egse-text-muted)" }}
                              onClick={(event) => { event.stopPropagation(); toggleDetails(fileId, event.currentTarget.closest("tr")); }}
                              title={isExpanded ? "Collapse details" : "View full details"}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>

                          {/* File Name & Size */}
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div
                                className="p-1 rounded d-flex align-items-center justify-content-center"
                                style={{
                                  backgroundColor: "var(--egse-raw-bg)",
                                  color: "var(--egse-raw)",
                                }}
                              >
                                <FileText size={16} />
                              </div>
                              <div>
                                <div className="fw-semibold text-truncate" style={{ maxWidth: "260px" }} title={file.fileName}>
                                  {file.originalName || file.fileName}
                                </div>
                                <div className="small font-monospace" style={{ color: "var(--egse-text-muted)", fontSize: "0.72rem" }}>
                                  {file.originalName && file.originalName !== file.fileName && (
                                    <span className="me-2">{file.fileName} ·</span>
                                  )}
                                  <span>{formatFileSize(file.fileSize)}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Subsystems */}
                          <td>
                            {(() => {
                              const deduped = getDeduplicatedSubsystems(file.subsystems);
                              if (deduped.length === 0) {
                                return (
                                  <span className="small text-muted" style={{ fontSize: "0.85rem" }}>
                                    —
                                  </span>
                                );
                              }
                              const visible = deduped.slice(0, 3);
                              const remaining = deduped.length - visible.length;
                              return (
                                <div className="d-flex flex-wrap gap-1 align-items-center" style={{ maxWidth: "220px" }}>
                                  {visible.map((sub, sIdx) => {
                                    const isMatch =
                                      subsystemFilter !== "all" &&
                                      (String(sub.id) === String(subsystemFilter) ||
                                        String(sub.code).toLowerCase() === String(subsystemFilter).toLowerCase() ||
                                        String(sub.name).toLowerCase() === String(subsystemFilter).toLowerCase());
                                    return (
                                      <span
                                        key={sIdx}
                                        className={`badge d-inline-flex align-items-center gap-1 ${isMatch
                                            ? "bg-info text-dark fw-bold shadow-sm"
                                            : "egse-subsystem-chip"
                                          }`}
                                        style={{ fontSize: "0.72rem", padding: "3px 6px" }}
                                        title={sub.code ? `Code: ${sub.code}` : undefined}
                                      >
                                        <Cpu size={10} />
                                        <span>{sub.name || sub.code}</span>
                                      </span>
                                    );
                                  })}
                                  {remaining > 0 && (
                                    <span
                                      className="badge"
                                      style={{ fontSize: "0.68rem" }}
                                      title={deduped.slice(3).map((s) => s.name || s.code).join(", ")}
                                    >
                                      +{remaining}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Status */}
                          <td>{renderStatusBadge(file.status, file)}</td>

                          {/* Processed At */}
                          <td>
                            <div className="small" style={{ color: "var(--egse-text-primary)" }}>
                              {formatDate(file.processedAt || file.createdAt)}
                            </div>
                          </td>

                          {/* Frame Stats with Progress Bar */}
                          <td>
                            <div style={{ width: "100%" }}>
                              <div className="d-flex flex-wrap justify-content-between gap-1 small mb-1">
                                <span style={{ color: "var(--egse-nominal)" }}>
                                  {validFrames.toLocaleString()} Valid
                                </span>
                                <span style={{ color: "var(--egse-text-muted)" }}>
                                  / {totalFrames.toLocaleString()} Total
                                </span>
                              </div>
                              <div
                                className="progress"
                                style={{
                                  height: "5px",
                                  backgroundColor: "var(--egse-bg-raised)",
                                }}
                              >
                                <div
                                  className="progress-bar"
                                  role="progressbar"
                                  style={{
                                    width: `${frameHealth}%`,
                                    backgroundColor: frameHealth === 100 ? "var(--egse-nominal)" : "var(--egse-warning)",
                                  }}
                                />
                              </div>
                              {invalidFrames > 0 && (
                                <div className="small text-danger mt-1" style={{ fontSize: "0.7rem" }}>
                                  {invalidFrames} invalid / corrupted frames
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Parameters count */}
                          <td>
                            <span
                              className="badge egse-parameter-chip"
                              style={{
                                backgroundColor: "var(--egse-warning-bg)",
                                color: "var(--egse-warning)",
                                border: "1px solid var(--egse-warning-border)",
                                fontSize: "0.75rem",
                              }}
                            >
                              {totalParams.toLocaleString()} parameters
                            </span>
                          </td>

                          {/* Action buttons */}
                          <td className="text-end" onClick={(event) => event.stopPropagation()}>
                            <div className="d-flex flex-wrap align-items-center justify-content-end gap-1">

                              {/* Export Excel (.xlsx) button */}
                              <button
                                type="button"
                                className="btn btn-outline-info btn-sm d-inline-flex align-items-center gap-1"
                                onClick={() => handleDownloadExcel(file)}
                                disabled={isDownloading}
                                title="Export this file readings to Excel (.xlsx)"
                                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                              >
                                {isDownloading ? (
                                  <RefreshCw size={12} className="spin-anim" />
                                ) : (
                                  <FileSpreadsheet size={12} />
                                )}
                                <span>Excel (.xlsx)</span>
                              </button>

                              {/* Interactive Decoded Telemetry View */}
                              <button
                                type="button"
                                className="btn btn-sm btn-info text-dark fw-bold d-inline-flex align-items-center gap-1"
                                onClick={() => onInspectFile?.(file, subsystemFilter !== "all" ? subsystemFilter : null)}
                                title="View this file decoded telemetry readings"
                                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                              >
                                <Layers size={13} />
                                <span>View</span>
                              </button>

                              {/* View in Historical Explorer */}
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                                onClick={() => handleViewInHistory(file)}
                                title="View readings in the historical explorer"
                                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                              >
                                <BarChart2 size={12} />
                                <span>History</span>
                              </button>

                            </div>
                          </td>
                        </tr>
                        {isExpanded && <tr><td colSpan={8} className="p-0"><FileDetails file={file} onClose={() => setExpandedFileId(null)} /></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="d-xxl-none p-2">
              {filteredFiles.map((file) => {
                const fileId = file._id || file.id || file.fileName;
                const isExpanded = expandedFileId === fileId;
                const totalFrames = file.stats?.totalFrames || 0;
                const validFrames = file.stats?.validFrames || 0;
                const invalidFrames = file.stats?.invalidFrames || 0;
                const totalParams = file.stats?.totalParameters || 0;
                return (
                  <article key={fileId} className="egse-panel p-3 mb-2" onClick={(event) => toggleDetails(fileId, event.currentTarget)}>
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="text-break fw-semibold" style={{ color: "var(--egse-text-primary)" }}>{file.originalName || file.fileName}</div>
                      {renderStatusBadge(file.status, file)}
                    </div>
                    <div className="small text-muted mt-1">{formatDate(file.processedAt || file.createdAt)}</div>
                    <div className="d-flex flex-wrap gap-2 small mt-2">
                      <span>{validFrames.toLocaleString()} valid / {totalFrames.toLocaleString()} frames</span>
                      {invalidFrames > 0 && <span className="text-danger">{invalidFrames.toLocaleString()} invalid</span>}
                      <span>{totalParams.toLocaleString()} parameters</span>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button type="button" className="btn btn-sm btn-info text-dark fw-bold d-inline-flex align-items-center gap-1" onClick={(event) => { event.stopPropagation(); onInspectFile?.(file, subsystemFilter !== "all" ? subsystemFilter : null); }}>
                        <Layers size={13} /> View
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1" onClick={(event) => { event.stopPropagation(); handleDownloadExcel(file); }} disabled={Boolean(downloadingFile)}>
                        <FileSpreadsheet size={13} /> Excel
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={(event) => { event.stopPropagation(); handleViewInHistory(file); }}>
                        <BarChart2 size={13} /> History
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={(event) => { event.stopPropagation(); toggleDetails(fileId, event.currentTarget.closest("article")); }}>
                        {isExpanded ? "Hide details" : "Details"}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={(event) => { event.stopPropagation(); handleDelete(file); }} title="Delete file" aria-label="Delete file"><Trash2 size={14} /></button>
                    </div>
                    {isExpanded && <FileDetails file={file} onClose={() => setExpandedFileId(null)} />}
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* 5. Pagination Controls */}
        {pagination.pages > 1 && (
          <div
            className="p-3 border-top d-flex align-items-center justify-content-between gap-2"
            style={{ borderColor: "var(--egse-border-soft)", fontSize: "0.85rem" }}
          >
            <div style={{ color: "var(--egse-text-muted)" }}>
              Page <strong>{pagination.page}</strong> of <strong>{pagination.pages}</strong> ({" "}Total
              {pagination.total} files)
            </div>
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                const pageNum = i + 1;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`btn btn-sm ${isActive ? "btn-info" : "btn-outline-secondary"}`}
                    onClick={() => handlePageChange(pageNum)}
                    disabled={isLoading}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= pagination.pages || isLoading}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Frame Selection Modal for Multi-Frame Files */}
      {frameSelectorModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "color-mix(in srgb, var(--egse-bg-deep) 78%, transparent)", zIndex: 1060 }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div
              className="modal-content shadow-lg"
              style={{ backgroundColor: "var(--egse-bg-panel)", borderColor: "var(--egse-border-soft)", color: "var(--egse-text-primary)" }}
            >
              <div className="modal-header border-secondary">
                <h5 className="modal-title h6 mb-0 d-flex align-items-center gap-2">
                  <Download size={18} className="text-info" />
                  <span>Export Telemetry Frames Separately</span>
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setFrameSelectorModal(null)}
                />
              </div>
              <div className="modal-body">
                <p className="small text-muted mb-2">
                  File <strong>{frameSelectorModal.file.originalName || frameSelectorModal.file.fileName}</strong> contains multiple decoded frames.
                  Each frame has its own columns and parameters. Select a frame to download its readings separately:
                </p>
                <div className="d-flex flex-column gap-2 my-3">
                  {frameSelectorModal.frames.map((frm) => (
                    <button
                      key={frm.name}
                      type="button"
                      className="btn btn-outline-info text-start d-flex justify-content-between align-items-center py-2 px-3"
                      onClick={() => {
                        const targetFile = frameSelectorModal.file;
                        setFrameSelectorModal(null);
                        handleDownloadCsv(targetFile, frm.name);
                      }}
                    >
                      <span className="fw-semibold">📄 {frm.name}</span>
                      <span className="badge bg-secondary">{frm.count} readings</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer border-secondary d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning"
                  onClick={() =>
                    handleDownloadAllFramesSeparately(
                      frameSelectorModal.file,
                      frameSelectorModal.frames
                    )
                  }
                >
                  📥 Download All Frames (Separate Files)
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setFrameSelectorModal(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
