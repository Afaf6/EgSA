import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useSelector } from "react-redux";
import { selectSelectedProject } from "../../../redux/slices/projectsSlice";
import telemetryService from "../../../services/telemetryService";
import { selectProcessedFiles } from "../../../redux/slices/telemetrySlice";
import {
  Cpu,
  Layers,
  Search,
  Download,
  AlertTriangle,
  Clock,
  RefreshCw,
  Table as TableIcon,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sliders,
  X,
  Info,
  FileText,
  ArrowRightLeft,
  RotateCcw,
  Zap,
} from "lucide-react";
import { convertValue, getCompatibleUnits } from "../../../utils/unitConversion";
import { formatTelemetryValue } from "../../../utils/formatters";
import DecodedUnitConverterModal from "./DecodedUnitConverterModal";
import RecomputeModal from "./RecomputeModal";
import {
  matchStatusRepresentation,
  getStatusRepresentationMatch,
  getStatusBadgeClass,
  evaluateParameterStatus,
} from "../../../utils/statusRepresentationHelper";

/**
 * Zero-dependency native table row virtualizer.
 * Calculates visible window indices and sub-pixel spacer heights.
 */
export function useRowVirtualizer({
  containerRef,
  totalRows = 0,
  estimateRowHeight = 43.765625,
  overscan = 5,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [measuredRowHeight, setMeasuredRowHeight] = useState(estimateRowHeight);
  const firstRowRef = useRef(null);
  // Latest effective row height, readable from the scroll handler without re-subscribing
  const rowHeightRef = useRef(measuredRowHeight || estimateRowHeight || 43.765625);

  // Measure initial container height and observe container resize
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const initialHeight = container.clientHeight || (typeof container.getBoundingClientRect === "function" ? container.getBoundingClientRect().height : 0);
    if (initialHeight > 0) {
      setContainerHeight(initialHeight);
    }

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = entry.contentRect?.height || entry.target?.clientHeight;
          if (h && h > 0) {
            setContainerHeight(h);
          }
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
  }, [containerRef]);

  // Cleaned up scroll listener with rAF throttle
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || typeof container.addEventListener !== "function") return;

    let rafId = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (container) {
          // PERF: the visible window only depends on floor(scrollTop / rowHeight), so skip the
          // re-render while the user scrolls within the same row (React bails out when the
          // updater returns the previous state). Output indices are identical.
          const next = container.scrollTop;
          const rh = rowHeightRef.current;
          setScrollTop((prev) => (rh > 0 && Math.floor(prev / rh) === Math.floor(next / rh) ? prev : next));
        }
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef]);

  // Measure actual first rendered row height for sub-pixel accuracy
  useEffect(() => {
    if (firstRowRef.current && typeof firstRowRef.current.getBoundingClientRect === "function") {
      const h = firstRowRef.current.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - measuredRowHeight) > 0.05) {
        setMeasuredRowHeight(h);
      }
    }
  });

  const rowHeight = measuredRowHeight || estimateRowHeight || 43.765625;
  rowHeightRef.current = rowHeight;

  // If the row height changes, re-sync from the real scroll position (a skipped update above
  // may have kept a value from the same bucket under the old row height).
  useEffect(() => {
    const container = containerRef?.current;
    if (container && typeof container.scrollTop === "number") {
      setScrollTop(container.scrollTop);
    }
  }, [rowHeight, containerRef]);

  return useMemo(() => {
    if (!totalRows || totalRows <= 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        rowHeight,
        firstRowRef,
        setScrollTop,
        setContainerHeight,
      };
    }

    // Fallback window when container is not yet measured (e.g. initial mount or JSDOM)
    const effectiveHeight = containerHeight > 0 ? containerHeight : 560;
    const visibleCount = Math.max(1, Math.ceil(effectiveHeight / rowHeight));

    const rawStart = Math.floor(scrollTop / rowHeight);
    const startIndex = Math.max(0, Math.min(rawStart - overscan, Math.max(0, totalRows - 1)));
    const endIndex = Math.min(totalRows, Math.max(startIndex + 1, rawStart + visibleCount + overscan));

    const topSpacerHeight = startIndex * rowHeight;
    const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * rowHeight);

    return {
      startIndex,
      endIndex,
      topSpacerHeight,
      bottomSpacerHeight,
      rowHeight,
      firstRowRef,
      setScrollTop,
      setContainerHeight,
    };
  }, [totalRows, containerHeight, scrollTop, rowHeight, overscan]);
}

// ─── PERF: grid rendering split into memoized pieces ──────────────────────────
// Previously every scroll tick of the virtualized grid called setState on the whole
// DecodedTelemetryView (2,000+ lines of JSX: header, filters, all column headers with
// unit <select>s, every visible cell, details panel). Scrolling now only re-renders
// VirtualizedGridBody, and rows that were already visible are skipped via React.memo.
// The rendered DOM is unchanged.

function formatEngValue(val, paramOrPrecision = null) {
  const param = (typeof paramOrPrecision === "object" && paramOrPrecision !== null)
    ? paramOrPrecision
    : null;
  const dataType = param?.dataType || (typeof paramOrPrecision === "string" ? paramOrPrecision : null);
  const precision = param?.precision;
  return formatTelemetryValue(val, dataType, { precision });
}

function formatTimeUtc(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toISOString().replace("T", " ").replace("Z", "") + " UTC";
}

function renderStatusDotElement(status) {
  const s = String(status || "unknown").toLowerCase();
  let color = "#cbd5e1";
  let label = status ? String(status).toUpperCase() : "UNMONITORED";
  if (s === "nominal" || s === "normal" || s === "ok") {
    color = "#22c55e";
  } else if (s.includes("warn")) {
    color = "#f59e0b";
  } else if (s.includes("invalid")) {
    color = "#c084fc";
  } else if (s.includes("crit") || s.includes("alarm")) {
    color = "#ef4444";
  } else if (s === "unmonitored" || s === "unknown" || s === "unconfigured") {
    color = "#cbd5e1";
    label = "UNMONITORED";
  }
  return (
    <span
      className="d-inline-block rounded-circle"
      role="img"
      aria-label={label}
      title={label}
      style={{ width: 9, height: 9, backgroundColor: color, boxShadow: `0 0 6px ${color}80`, verticalAlign: "middle" }}
    >
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

const DecodedGridRow = memo(function DecodedGridRow({
  rec,
  recId,
  isSelected,
  rowNumber,
  rowRef,
  displayedParameters,
  getReadingForParam,
  getConvertedEngVal,
  resolveReadingStatus,
  onToggleRow,
}) {
  return (
      <tr
        ref={rowRef}
        onClick={() => {
          if (!recId) return;
          onToggleRow(recId);
        }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "rgba(6, 182, 212, 0.12)" : undefined,
          borderLeft: isSelected ? "3px solid var(--egse-raw)" : "3px solid transparent",
        }}
        title="Click to inspect details for this specific frame"
      >
      {/* Sticky Row # */}
      <td
        className="text-center text-muted small"
        style={{
          position: "sticky",
          left: 0,
          backgroundColor: isSelected ? "#1a2736" : "#0d1117",
          zIndex: 1,
        }}
      >
        {rowNumber}
      </td>

      {/* Sticky Frame Timestamp */}
      <td
        style={{
          position: "sticky",
          left: "60px",
          backgroundColor: isSelected ? "#1a2736" : "#0d1117",
          zIndex: 1,
          fontSize: "0.82rem",
        }}
        className="text-nowrap text-info fw-bold"
      >
        {formatTimeUtc(rec.frameTimestamp)}
      </td>

      {/* Parameter Reading Cells */}
      {displayedParameters.map((p) => {
        const reading = getReadingForParam(rec, p);
        const rawEngVal =
          reading?.engineeringValue !== undefined
            ? reading.engineeringValue
            : reading?.value !== undefined
            ? reading.value
            : null;
        const engVal = getConvertedEngVal(p, rawEngVal);
        const isConverted = rawEngVal !== null && engVal !== rawEngVal;
        const rawStatus = reading ? resolveReadingStatus(reading, p) : "";
        const status = String(rawStatus).toLowerCase();
        const isWarning = status.includes("warn");
        const isInvalid = status.includes("invalid");
        const isCritical = status.includes("crit");
        const isAlarm = status.includes("alarm") || isCritical;
        const isUnknown = !status || status.includes("unknown") || status.includes("unmonitored") || status.includes("unconfigured");
        const fullValueTooltip = isConverted
          ? `Full displayed value: ${String(engVal)}; original value: ${String(rawEngVal)} ${p.unit || ""}`
          : `Full value: ${String(engVal)}`;
        const match = getStatusRepresentationMatch(engVal, p?.statusRepresentation);
        const statusLabel = match?.status || reading?.statusLabel || null;
        const badgeClass = statusLabel ? getStatusBadgeClass(statusLabel) : "";

        return (
          <td
            key={p._id || p.id || p.name}
            className={`text-nowrap ${
              isInvalid
                ? "fw-bold"
                : isAlarm
                ? "text-danger fw-bold bg-danger bg-opacity-10"
                : isWarning
                ? "text-warning fw-bold bg-warning bg-opacity-10"
                : isUnknown
                ? "fw-semibold"
                : "text-light"
            }`}
            style={{
              fontSize: "0.85rem",
              ...(isInvalid
                ? { color: "#c084fc", backgroundColor: "rgba(168, 85, 247, 0.12)" }
                : isUnknown
                ? { color: "#cbd5e1", backgroundColor: "rgba(203, 213, 225, 0.10)" }
                : {}),
            }}
            title={
              isInvalid
                ? `INVALID: outside the valid range [${p.minValue ?? "-∞"} – ${p.maxValue ?? "+∞"}] ${p.unit || ""} – check the sensor or the configuration`
                : isUnknown
                ? `UNKNOWN: unmonitored parameter (no limits configured)`
                : isConverted
                ? `Converted from original: ${formatEngValue(rawEngVal, p)} ${p.unit}`
                : undefined
            }
          >
            <div className="d-flex align-items-center justify-content-between gap-1">
              {(() => {
                if (statusLabel) {
                  return (
                    <div className="d-inline-flex align-items-center gap-1 flex-wrap">
                      <span
                        className={`${badgeClass} fw-semibold`}
                        style={{ fontSize: "0.75rem", padding: "1px 5px" }}
                        title={`Status: ${statusLabel}${match?.description ? ` (${match.description})` : ""} | Eng: ${fullValueTooltip}`}
                      >
                        {statusLabel}
                      </span>
                      <span className={isConverted ? "text-info fw-semibold" : ""} title={fullValueTooltip}>
                        {formatEngValue(engVal, p)}
                      </span>
                    </div>
                  );
                }
                return (
                  <span className={isConverted ? "text-info fw-semibold" : ""} title={fullValueTooltip}>
                    {formatEngValue(engVal, p)}
                  </span>
                );
              })()}
              {rawStatus && renderStatusDotElement(rawStatus)}
            </div>
          </td>
        );
      })}
    </tr>
  );
});

function VirtualizedGridBody({
  containerRef,
  displayedRecords,
  displayedParameters,
  currentPage,
  pageSize,
  selectedRowId,
  getReadingForParam,
  getConvertedEngVal,
  resolveReadingStatus,
  onToggleRow,
}) {
  const virtualizer = useRowVirtualizer({
    containerRef,
    totalRows: displayedRecords.length,
    estimateRowHeight: 43.765625,
    overscan: 5,
  });

  return (
    <>
      {virtualizer.topSpacerHeight > 0 && (
        <tr
          key="__top_spacer__"
          aria-hidden="true"
          style={{
            height: `${virtualizer.topSpacerHeight}px`,
            border: "none",
            padding: 0,
            margin: 0,
          }}
        >
          <td
            colSpan={displayedParameters.length + 2}
            style={{
              padding: 0,
              margin: 0,
              border: "none",
              height: `${virtualizer.topSpacerHeight}px`,
            }}
          />
        </tr>
      )}


      {displayedRecords
        .slice(virtualizer.startIndex, virtualizer.endIndex)
        .map((rec, sliceIdx) => {
          const rIdx = virtualizer.startIndex + sliceIdx;
          const recId = rec?._id || rec?.id;
          return (
            <DecodedGridRow
              key={recId || rIdx}
              rec={rec}
              recId={recId}
              isSelected={Boolean(recId && selectedRowId === recId)}
              rowNumber={(currentPage - 1) * pageSize + rIdx + 1}
              rowRef={sliceIdx === 0 ? virtualizer.firstRowRef : undefined}
              displayedParameters={displayedParameters}
              getReadingForParam={getReadingForParam}
              getConvertedEngVal={getConvertedEngVal}
              resolveReadingStatus={resolveReadingStatus}
              onToggleRow={onToggleRow}
            />
          );
        })}


      {virtualizer.bottomSpacerHeight > 0 && (
        <tr
          key="__bottom_spacer__"
          aria-hidden="true"
          style={{
            height: `${virtualizer.bottomSpacerHeight}px`,
            border: "none",
            padding: 0,
            margin: 0,
          }}
        >
          <td
            colSpan={displayedParameters.length + 2}
            style={{
              padding: 0,
              margin: 0,
              border: "none",
              height: `${virtualizer.bottomSpacerHeight}px`,
            }}
          />
        </tr>
      )}
    </>
  );
}

export default function DecodedTelemetryView({ initialFile = null, onClose = null, initialSubsystemId = null, initialMode = null }) {
  const selectedProject = useSelector(selectSelectedProject);
  const projectId = selectedProject?.id || selectedProject?._id;
  const processedFiles = useSelector(selectProcessedFiles);

  // Subsystems & Frames derived from project definition
  const subsystems = useMemo(() => {
    return Array.isArray(selectedProject?.rawSubsystems) ? selectedProject.rawSubsystems : [];
  }, [selectedProject]);

  const [selectedSubsystemId, setSelectedSubsystemId] = useState(initialSubsystemId || "");
  const [selectedFrameId, setSelectedFrameId] = useState("");
  const [selectedSourceFile, setSelectedSourceFile] = useState(initialFile?.fileName || "");

  // Update when initialFile changes
  useEffect(() => {
    if (initialFile?.fileName) {
      setSelectedSourceFile(initialFile.fileName);
      setCurrentPage(1);
      setSelectedRowId(null);
    }
  }, [initialFile]);

  useEffect(() => {
    if (initialSubsystemId) {
      setSelectedSubsystemId(initialSubsystemId);
      setCurrentPage(1);
      setSelectedRowId(null);
    }
  }, [initialSubsystemId]);

  // Filter subsystems to only those present in the selected file
  const availableSubsystems = useMemo(() => {
    if (!selectedSourceFile) return subsystems;
    const currentFileObj = processedFiles?.find((f) => f.fileName === selectedSourceFile) || initialFile;
    if (!currentFileObj) return subsystems;

    // Check stats.subsystemSummary
    const subSummary = currentFileObj.stats?.subsystemSummary;
    if (subSummary && typeof subSummary === "object" && Object.keys(subSummary).length > 0) {
      const summaryNames = Object.keys(subSummary).map((k) => k.trim().toLowerCase());
      const filtered = subsystems.filter(
        (s) =>
          summaryNames.includes((s.name || "").trim().toLowerCase()) ||
          summaryNames.includes((s.subsystemCode || "").trim().toLowerCase())
      );
      if (filtered.length > 0) return filtered;
    }

    if (Array.isArray(currentFileObj.subsystems) && currentFileObj.subsystems.length > 0) {
      const filtered = subsystems.filter((s) =>
        currentFileObj.subsystems.some(
          (fs) =>
            (fs.id && String(fs.id) === String(s._id || s.id)) ||
            (fs._id && String(fs._id) === String(s._id || s.id)) ||
            (fs.code && String(fs.code).toLowerCase() === String(s.subsystemCode || "").toLowerCase()) ||
            (fs.name && String(fs.name).toLowerCase() === String(s.name || "").toLowerCase())
        )
      );
      if (filtered.length > 0) return filtered;
    }

    return subsystems;
  }, [subsystems, selectedSourceFile, processedFiles, initialFile]);

  // View Mode: 'grid' (Excel Spreadsheet Matrix) | 'specs' (Parameter Specs Table)
  const [viewMode, setViewMode] = useState(initialMode === "specs" ? "specs" : "grid");

  // Tabular Paging State (Default 25 records per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [records, setRecords] = useState([]);
  const [paginationMeta, setPaginationMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Selected row for detail inspection (null until a row is clicked)
  const [selectedRowId, setSelectedRowId] = useState(null);

  // Search, Date Range & Status Filters for Grid View
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'nominal' | 'warning' | 'alarm' | 'invalid' | 'unknown'
  const [gridFromDate, setGridFromDate] = useState("");
  const [gridToDate, setGridToDate] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset all local project-scoped filters, pagination, and selections when switching projects
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId;

      // Reset Grid/Spreadsheet view filter and selections
      setSelectedSubsystemId(initialSubsystemId || "");
      setSelectedFrameId("");
      setSelectedSourceFile(initialFile?.fileName || "");
      setCurrentPage(1);
      setSelectedRowId(null);
      setSearchTerm("");
      setStatusFilter("all");
      setRecords([]);
      setFetchError("");
    }
  }, [projectId, initialSubsystemId, initialFile?.fileName]);

  // Refs for tracking selection and active in-flight request cancellation
  const selectedRowIdRef = useRef(selectedRowId);
  useEffect(() => {
    selectedRowIdRef.current = selectedRowId;
  }, [selectedRowId]);

  const recordsAbortControllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recordsAbortControllerRef.current) recordsAbortControllerRef.current.abort();
    };
  }, []);

  // Initialize selected subsystem.
  // FIX: the automatic choice (subsystem found in the selected file, or the subsystem we were
  // opened with) used to be re-applied on EVERY selection change, so clicking another
  // subsystem tab immediately snapped back. It is now applied only when that context changes
  // (file, initial subsystem, or the list of subsystems); afterwards the user's click wins.
  // An invalid/missing selection is still corrected to the first subsystem as before.
  const subsystemAutoSelectKeyRef = useRef(null);
  useEffect(() => {
    const currentFileObj = processedFiles?.find((f) => f.fileName === selectedSourceFile) || initialFile;
    const subSummary = currentFileObj?.stats?.subsystemSummary;
    const hasSummary = Boolean(subSummary && typeof subSummary === "object" && Object.keys(subSummary).length > 0);

    const autoKey = [
      selectedSourceFile,
      initialSubsystemId || "",
      hasSummary ? Object.keys(subSummary).join(",") : "",
      availableSubsystems.map((s) => s._id || s.id).join(","),
    ].join("|");
    const autoState = subsystemAutoSelectKeyRef.current;
    const contextChanged = !autoState || autoState.key !== autoKey;
    if (!contextChanged && autoState.pendingFrom !== undefined) {
      // An automatic selection was just requested in this context; wait for it to land
      // (React StrictMode re-runs effects before the state update is visible).
      if (selectedSubsystemId === autoState.pendingFrom) return;
      autoState.pendingFrom = undefined;
    }
    subsystemAutoSelectKeyRef.current = { key: autoKey, pendingFrom: undefined };

    if (contextChanged) {
      if (hasSummary) {
        const summaryNames = Object.keys(subSummary).map((k) => k.trim().toLowerCase());
        const matchingSub = availableSubsystems.find(
          (s) =>
            summaryNames.includes((s.name || "").trim().toLowerCase()) ||
            summaryNames.includes((s.subsystemCode || "").trim().toLowerCase())
        );
        if (matchingSub && (matchingSub._id || matchingSub.id) !== selectedSubsystemId) {
          subsystemAutoSelectKeyRef.current.pendingFrom = selectedSubsystemId;
          setSelectedSubsystemId(matchingSub._id || matchingSub.id);
          return;
        }
      }

      if (initialSubsystemId && availableSubsystems.some((s) => (s._id || s.id) === initialSubsystemId)) {
        if (initialSubsystemId !== selectedSubsystemId) {
          subsystemAutoSelectKeyRef.current.pendingFrom = selectedSubsystemId;
          setSelectedSubsystemId(initialSubsystemId);
        }
        return;
      }
    }

    if (availableSubsystems.length > 0 && !availableSubsystems.some((s) => (s._id || s.id) === selectedSubsystemId)) {
      const firstSubId = availableSubsystems[0]._id || availableSubsystems[0].id;
      setSelectedSubsystemId(firstSubId);
    }
  }, [availableSubsystems, selectedSubsystemId, initialSubsystemId, selectedSourceFile, processedFiles, initialFile]);

  // Current active subsystem
  const currentSubsystem = useMemo(() => {
    return availableSubsystems.find((s) => (s._id || s.id) === selectedSubsystemId) || availableSubsystems[0] || null;
  }, [availableSubsystems, selectedSubsystemId]);

  // Frames under current subsystem
  const availableFrames = useMemo(() => {
    return Array.isArray(currentSubsystem?.frames) ? currentSubsystem.frames : [];
  }, [currentSubsystem]);

  // All Files only: frames with stored records whose configuration no longer exists.
  const [telemetryFrames, setTelemetryFrames] = useState([]);
  const [selectedDeletedFrameId, setSelectedDeletedFrameId] = useState("");

  useEffect(() => {
    if (!projectId || selectedSourceFile) {
      setTelemetryFrames([]);
      return undefined;
    }
    let cancelled = false;
    Promise.resolve()
      .then(() => telemetryService.getTelemetryFrames(projectId))
      .then((rows) => {
        if (!cancelled) setTelemetryFrames(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setTelemetryFrames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedSourceFile, subsystems]);

  const deletedFrames = useMemo(
    () => (selectedSourceFile ? [] : telemetryFrames.filter((f) => !f.configured)),
    [telemetryFrames, selectedSourceFile]
  );
  const activeDeletedFrame = deletedFrames.find((f) => f.frameId === selectedDeletedFrameId) || null;
  const activeDeletedFrameId = activeDeletedFrame?.frameId || "";
  // Records here have no frame configuration, so columns and statuses come from what was stored.
  const isNoFrameView = !selectedSourceFile && availableFrames.length === 0 && !activeDeletedFrame;
  const isHistoricalView = Boolean(activeDeletedFrame) || isNoFrameView;

  // Initialize selected frame when subsystem changes.
  // FIX: like the subsystem selector, the file's frameSummary match is applied only when the
  // context (subsystem's frame list / file) changes, so clicking another frame no longer snaps back.
  const frameAutoSelectKeyRef = useRef(null);
  useEffect(() => {
    if (availableFrames.length > 0) {
      const currentFileObj = processedFiles?.find((f) => f.fileName === selectedSourceFile) || initialFile;
      const frameSummary = currentFileObj?.stats?.frameSummary;
      const hasFrameSummary = Boolean(frameSummary && typeof frameSummary === "object" && Object.keys(frameSummary).length > 0);
      const autoKey = [
        selectedSourceFile,
        hasFrameSummary ? Object.keys(frameSummary).join(",") : "",
        availableFrames.map((f) => f._id || f.id).join(","),
      ].join("|");
      const autoState = frameAutoSelectKeyRef.current;
      const contextChanged = !autoState || autoState.key !== autoKey;
      if (!contextChanged && autoState.pendingFrom !== undefined) {
        if (selectedFrameId === autoState.pendingFrom) return; // auto selection not visible yet
        autoState.pendingFrom = undefined;
      }
      frameAutoSelectKeyRef.current = { key: autoKey, pendingFrom: undefined };
      if (contextChanged && hasFrameSummary) {
        const frameNames = Object.keys(frameSummary).map((k) => k.trim().toLowerCase());
        const matchingFrame = availableFrames.find(
          (f) =>
            frameNames.includes((f.name || f.frameName || "").trim().toLowerCase())
        );
        if (matchingFrame && (matchingFrame._id || matchingFrame.id) !== selectedFrameId) {
          frameAutoSelectKeyRef.current.pendingFrom = selectedFrameId;
          setSelectedFrameId(matchingFrame._id || matchingFrame.id);
          setCurrentPage(1);
          setSelectedRowId(null);
          return;
        }
      }

      const currentExists = availableFrames.some((f) => (f._id || f.id) === selectedFrameId);
      if (!currentExists) {
        setSelectedFrameId(availableFrames[0]._id || availableFrames[0].id);
        setCurrentPage(1);
        setSelectedRowId(null);
      }
    } else {
      setSelectedFrameId("");
    }
  }, [availableFrames, selectedFrameId, selectedSourceFile, processedFiles, initialFile]);

  // Current active frame
  const currentFrame = useMemo(() => {
    if (isHistoricalView) return null;
    return availableFrames.find((f) => (f._id || f.id) === selectedFrameId) || availableFrames[0] || null;
  }, [availableFrames, selectedFrameId, isHistoricalView]);

  // All configured parameters sorted strictly by displayOrder
  const configuredParameters = useMemo(() => {
    if (currentFrame && Array.isArray(currentFrame.parameters) && currentFrame.parameters.length > 0) {
      return [...currentFrame.parameters].sort((a, b) => {
        const orderA = a.displayOrder !== undefined && a.displayOrder !== null ? Number(a.displayOrder) : 99999;
        const orderB = b.displayOrder !== undefined && b.displayOrder !== null ? Number(b.displayOrder) : 99999;
        return orderA - orderB;
      });
    }
    if (Array.isArray(records) && records.length > 0) {
      const seen = new Set();
      const extracted = [];
      for (const rec of records) {
        for (const r of rec.readings || []) {
          const pName = r.parameterName || r.name;
          if (pName && !seen.has(pName)) {
            seen.add(pName);
            extracted.push({
              _id: r.parameterId || pName,
              id: r.parameterId || pName,
              name: pName,
              unit: r.unit || "",
              description: "",
            });
          }
        }
      }
      return extracted;
    }
    return [];
  }, [currentFrame, records]);

  // Unit overrides map: { [paramKey]: targetUnit }
  const [unitOverrides, setUnitOverrides] = useState({});
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [unitModalTargetParamKey, setUnitModalTargetParamKey] = useState(null);
  const [isRecomputeModalOpen, setIsRecomputeModalOpen] = useState(false);

  // Reset unit overrides when frame changes
  useEffect(() => {
    setUnitOverrides({});
  }, [selectedFrameId]);

  const setUnitOverride = useCallback((paramKey, newUnit) => {
    setUnitOverrides((prev) => {
      const updated = { ...prev };
      if (!newUnit) {
        delete updated[paramKey];
      } else {
        updated[paramKey] = newUnit;
      }
      return updated;
    });
  }, []);

  const resetAllOverrides = useCallback(() => {
    setUnitOverrides({});
  }, []);

  const getDisplayUnit = useCallback((param) => {
    if (!param) return "";
    const pKey = param._id || param.id || param.name;
    return unitOverrides[pKey] || unitOverrides[param.name] || param.unit || "";
  }, [unitOverrides]);

  const getConvertedEngVal = useCallback((param, val) => {
    if (val === null || val === undefined || isNaN(Number(val)) || !param) return val;
    const pKey = param._id || param.id || param.name;
    const targetUnit = unitOverrides[pKey] || unitOverrides[param.name];
    if (targetUnit && param.unit && targetUnit !== param.unit) {
      const converted = convertValue(val, param.unit, targetUnit);
      return converted !== null ? converted : val;
    }
    return val;
  }, [unitOverrides]);

  const activeOverridesCount = useMemo(() => {
    return Object.keys(unitOverrides).filter((k) => {
      const p = configuredParameters.find((cp) => (cp._id || cp.id || cp.name) === k || cp.name === k);
      return p && unitOverrides[k] && unitOverrides[k] !== p.unit;
    }).length;
  }, [unitOverrides, configuredParameters]);

  // Fetch telemetry records with tabular pagination
  const fetchRecords = useCallback(
    async (pageToLoad = currentPage, limitToLoad = pageSize) => {
      if (!projectId) return;
      if (!selectedFrameId && !selectedSourceFile && !isHistoricalView) return;

      if (recordsAbortControllerRef.current) {
        recordsAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      recordsAbortControllerRef.current = controller;

      setIsLoading(true);
      setFetchError("");
      try {
        const params = {
          projectId,
          page: pageToLoad,
          limit: limitToLoad,
          sortBy: "frameTimestamp",
          sortOrder: "asc",
        };

        if (activeDeletedFrameId) {
          params.frameId = activeDeletedFrameId;
          params.exactFrame = "true";
        } else {
          if (selectedSubsystemId) {
            params.subsystemId = selectedSubsystemId;
          }

          if (selectedFrameId) {
            params.frameId = selectedFrameId;
            if (!selectedSourceFile) params.exactFrame = "true";
          }
        }

        if (selectedSourceFile) {
          params.sourceFile = selectedSourceFile;
        }

        if (statusFilter && statusFilter !== "all") {
          params.status = statusFilter;
        }

        if (gridFromDate) {
          params.from = gridFromDate;
        }

        if (gridToDate) {
          params.to = gridToDate;
        }

        if (controller.signal) {
          params.signal = controller.signal;
        }

        const res = await telemetryService.queryTelemetry(params);
        const data = res?.data || [];
        const meta = res?.meta || {
          page: pageToLoad,
          limit: limitToLoad,
          total: data.length,
          totalPages: Math.max(1, Math.ceil(data.length / limitToLoad)),
        };

        setRecords(data);
        recordsParamFingerprintRef.current = getParamsFingerprint(configuredParameters);
        setPaginationMeta(meta);

        // Keep selected row if still in dataset, otherwise reset using ref to avoid re-fetch cycle
        if (selectedRowIdRef.current && !data.some((r) => (r._id || r.id) === selectedRowIdRef.current)) {
          setSelectedRowId(null);
        }
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.name === "AbortError" ||
          err?.code === "ERR_CANCELED" ||
          err?.message === "canceled" ||
          err?.isCancel ||
          err?.raw?.name === "CanceledError" ||
          err?.raw?.code === "ERR_CANCELED"
        ) {
          return;
        }
        console.error("Failed to load decoded telemetry records:", err);
        setFetchError(err.message || "Failed to load decoded telemetry records for this frame");
        setRecords([]);
        setSelectedRowId(null);
      } finally {
        if (recordsAbortControllerRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [projectId, selectedSubsystemId, selectedFrameId, selectedSourceFile, statusFilter, gridFromDate, gridToDate, pageSize, activeDeletedFrameId, isHistoricalView]
  );

  // FIX: when the frame changes (e.g. after switching subsystem), clear the previous frame's rows
  // right away instead of briefly rendering them under the new frame's parameter columns.
  const lastFetchedFrameIdRef = useRef(selectedFrameId);
  const shownFrameKey = activeDeletedFrameId || selectedFrameId;
  useEffect(() => {
    if (lastFetchedFrameIdRef.current !== shownFrameKey) {
      lastFetchedFrameIdRef.current = shownFrameKey;
      setRecords([]);
    }
  }, [shownFrameKey]);

  useEffect(() => {
    if (selectedFrameId || selectedSourceFile || isHistoricalView) {
      fetchRecords(currentPage, pageSize);
    }
  }, [selectedFrameId, currentPage, pageSize, selectedSourceFile, statusFilter, gridFromDate, gridToDate, fetchRecords, isHistoricalView]);

  // Filtered parameters for columns based on search
  const displayedParameters = useMemo(() => {
    if (!searchTerm) return configuredParameters;
    const term = searchTerm.toLowerCase();
    return configuredParameters.filter((p) => {
      const matchesName = (p.name || "").toLowerCase().includes(term);
      const matchesId = (p.parameterId || "").toLowerCase().includes(term);
      const matchesDesc = (p.description || "").toLowerCase().includes(term);
      return matchesName || matchesId || matchesDesc;
    });
  }, [configuredParameters, searchTerm]);

  // Records filtered on server with accurate count and server pagination
  const displayedRecords = useMemo(() => {
    return records;
  }, [records]);

  // Row virtualization hook for native table
  const tableContainerRef = useRef(null);

  // Stable row-click handler so memoized grid rows are not re-rendered on every parent render
  const toggleSelectedRow = useCallback((recId) => {
    setSelectedRowId((prev) => (prev === recId ? null : recId));
  }, []);

  // Reset scroll on dataset identity changes
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, selectedFrameId, selectedSourceFile, statusFilter, gridFromDate, gridToDate]);

  // Fingerprint helper to detect if local Parameter definitions diverged from fetched dataset
  const getParamsFingerprint = useCallback((params) => {
    if (!Array.isArray(params)) return "";
    return params
      .map(
        (p) =>
          `${p._id || p.id || p.name}:${JSON.stringify(p.limits || p.statusRanges || {})}:${p.minValue}:${p.maxValue}`
      )
      .join("|");
  }, []);

  const recordsParamFingerprintRef = useRef(null);

  const currentParamsFingerprint = useMemo(() => {
    return getParamsFingerprint(configuredParameters);
  }, [configuredParameters, getParamsFingerprint]);

  const hasLocalConfigChanges = Boolean(
    recordsParamFingerprintRef.current &&
    recordsParamFingerprintRef.current !== currentParamsFingerprint
  );

  /**
   * Resolves the display limit status for a parameter reading.
   * Primary source: The backend API's dynamically calculated status when present and authoritative.
   * Fallback: evaluateParameterStatus(reading, param) for data sources that do not provide
   * the current dynamic status, or when local parameter configurations change in Redux.
   */
  const resolveReadingStatus = useCallback(
    (reading, param) => {
      if (!reading) return "UNKNOWN";

      // No limits exist for these records, so the stored status is shown and never re-evaluated.
      if (isHistoricalView) {
        const stored = String(reading.limitStatus || reading.status || "").trim().toUpperCase();
        return stored || "UNKNOWN";
      }

      const isDynamicFromApi = Boolean(reading.isDynamicStatus || reading.decodeTimeStatus !== undefined);
      const hasValidApiStatus = Boolean(
        reading.status &&
        typeof reading.status === "string" &&
        !["unknown", "unmonitored", "unconfigured", ""].includes(reading.status.toLowerCase().trim())
      );

      // When the API response provides a valid dynamically calculated status and
      // local parameter configuration has not diverged, consume the API status as primary source
      if (!hasLocalConfigChanges && isDynamicFromApi && hasValidApiStatus) {
        return reading.status.toUpperCase();
      }

      // Fallback: evaluate dynamically against current parameter configuration
      return evaluateParameterStatus(reading, param);
    },
    [hasLocalConfigChanges, isHistoricalView]
  );

  // Status classification helper for calculating per-parameter status
  const classifyParameterStatus = useCallback(
    (reading, param) => {
      return resolveReadingStatus(reading, param);
    },
    [resolveReadingStatus]
  );

  // Calculate per-parameter status counts directly from displayed records
  const parameterStatusCounts = useMemo(() => {
    const statsMap = {};

    for (const p of configuredParameters) {
      const pKey = p._id || p.id || p.name;
      statsMap[pKey] = {
        NORMAL: 0,
        WARNING: 0,
        CRITICAL: 0,
        UNKNOWN: 0,
        INVALID: 0,
      };
    }

    if (!displayedRecords || displayedRecords.length === 0) {
      return statsMap;
    }

    const indexedRecords = displayedRecords.map((rec) => {
      const m = new Map();
      if (Array.isArray(rec.readings)) {
        for (const r of rec.readings) {
          if (r.parameterId) {
            m.set(String(r.parameterId), r);
          }
          if (r.parameterName) {
            m.set(r.parameterName, r);
          }
        }
      }
      return m;
    });

    for (const p of configuredParameters) {
      const pKey = p._id || p.id || p.name;
      const pId = p._id || p.id ? String(p._id || p.id) : null;
      const pName = p.name;
      const counts = statsMap[pKey];

      for (const readingMap of indexedRecords) {
        const reading = (pId && readingMap.get(pId)) || (pName && readingMap.get(pName)) || null;
        const status = classifyParameterStatus(reading, p);

        if (counts[status] !== undefined) {
          counts[status]++;
        } else {
          counts[status] = (counts[status] || 0) + 1;
        }
      }
    }

    return statsMap;
  }, [displayedRecords, configuredParameters, classifyParameterStatus]);

  // Currently selected record for detail inspection
  const selectedRecord = useMemo(() => {
    if (!selectedRowId) return null;
    return records.find((r) => (r._id || r.id) === selectedRowId) || null;
  }, [records, selectedRowId]);

  // Indexed reading lookup cache per record: WeakMap<record, { firstById, firstByName, resolvedParams }>
  const recordsReadingIndexMap = useMemo(() => {
    const indexMap = new WeakMap();
    if (!Array.isArray(records) || records.length === 0) return indexMap;

    for (const rec of records) {
      if (!rec || !Array.isArray(rec.readings)) continue;
      const firstById = new Map();
      const firstByName = new Map();

      for (let i = 0; i < rec.readings.length; i++) {
        const r = rec.readings[i];
        if (!r) continue;
        if (r.parameterId) {
          const sId = String(r.parameterId);
          if (!firstById.has(sId)) {
            firstById.set(sId, { reading: r, index: i });
          }
        }
        if (r.parameterName) {
          const sName = r.parameterName;
          if (!firstByName.has(sName)) {
            firstByName.set(sName, { reading: r, index: i });
          }
        }
      }

      indexMap.set(rec, { firstById, firstByName, resolvedParams: new Map() });
    }

    return indexMap;
  }, [records]);

  // Helper to get reading from record for a given parameter (O(1) indexed lookup preserving exact Array.find order)
  const getReadingForParam = useCallback(
    (record, param) => {
      if (!record || !Array.isArray(record.readings) || !param) return null;

      const recordIndex = recordsReadingIndexMap.get(record);
      const pId = param._id || param.id;
      const pName = param.name;

      if (recordIndex) {
        const pKey = `${pId ? String(pId) : ''}::${pName || ''}`;
        if (recordIndex.resolvedParams.has(pKey)) {
          return recordIndex.resolvedParams.get(pKey);
        }

        const matchById = pId ? recordIndex.firstById.get(String(pId)) : null;
        const matchByName = pName ? recordIndex.firstByName.get(pName) : null;

        let resolved = null;
        if (matchById && matchByName) {
          resolved = matchById.index <= matchByName.index ? matchById.reading : matchByName.reading;
        } else if (matchById) {
          resolved = matchById.reading;
        } else if (matchByName) {
          resolved = matchByName.reading;
        }

        recordIndex.resolvedParams.set(pKey, resolved);
        return resolved;
      }

      // Fallback for unindexed ad-hoc records (preserves 100% exact original predicate)
      return (
        record.readings.find(
          (r) =>
            (r.parameterId && (r.parameterId === pId || String(r.parameterId) === String(pId))) ||
            (r.parameterName && r.parameterName === pName)
        ) || null
      );
    },
    [recordsReadingIndexMap]
  );

  // Per-parameter stale detection: compare parameter equationHash with readings equationHash
  const staleParametersMap = useMemo(() => {
    const map = {};
    if (!Array.isArray(records) || records.length === 0) return map;

    for (const p of configuredParameters) {
      const pKey = p._id || p.id || p.name;
      // Metadata taken from telemetry records has no hash to compare against
      if (p.equationHash === undefined) {
        map[pKey] = false;
        continue;
      }
      const pHash = p.equationHash || null;
      let isStale = false;
      for (const rec of records) {
        const reading = getReadingForParam(rec, p);
        // Readings without a raw value cannot be recalculated, so they never count as stale
        if (reading && reading.rawValue !== null && reading.rawValue !== undefined) {
          const readingHash = reading.equationHash || null;
          if (pHash !== readingHash) {
            isStale = true;
            break;
          }
        }
      }
      map[pKey] = isStale;
    }
    return map;
  }, [records, configuredParameters, getReadingForParam]);

  const hasAnyStaleParameter = useMemo(() => {
    return Object.values(staleParametersMap).some(Boolean);
  }, [staleParametersMap]);

  // Format helpers
  const formatRaw = (val) => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "number") {
      if (Number.isSafeInteger(val)) {
        if (val >= 0) {
          return `0x${val.toString(16).toUpperCase()} (${val})`;
        }
        return `0x${(val >>> 0).toString(16).toUpperCase()} (${val})`;
      }
      return `0x${(val >>> 0).toString(16).toUpperCase()} (${val})`;
    }
    if (typeof val === "bigint") {
      return `0x${val.toString(16).toUpperCase()} (${val.toString()})`;
    }
    if (typeof val === "string" && /^\d+$/.test(val)) {
      try {
        const bi = BigInt(val);
        return `0x${bi.toString(16).toUpperCase()} (${val})`;
      } catch {
        return val;
      }
    }
    return String(val);
  };

  const formatEng = formatEngValue;
  const formatTime = formatTimeUtc;

  const renderStatusDot = renderStatusDotElement;

  // Streamed Download for current Frame (.xlsx with CSV fallback)
  const handleDownloadTelemetry = async (respectActiveFilters = true) => {
    if (!projectId || (!selectedFrameId && !isHistoricalView)) return;
    setIsDownloading(true);
    try {
      const shownFrameName = activeDeletedFrame?.frameName || currentFrame?.name;
      const frameNameSafe = shownFrameName ? shownFrameName.replace(/\s+/g, "_") : "telemetry";
      const shownSubsystemName = activeDeletedFrame ? activeDeletedFrame.subsystemName : currentSubsystem?.name;
      const subNameSafe = shownSubsystemName ? shownSubsystemName.replace(/\s+/g, "_") : "";
      const baseFilename = `${subNameSafe ? `${subNameSafe}_` : ""}${frameNameSafe}_decoded`;

      const params = { projectId };
      if (activeDeletedFrameId) {
        params.frameId = activeDeletedFrameId;
        params.exactFrame = "true";
      } else {
        if (selectedFrameId) params.frameId = selectedFrameId;
        if (selectedSubsystemId) params.subsystemId = selectedSubsystemId;
        if (selectedFrameId && !selectedSourceFile) params.exactFrame = "true";
      }

      if (respectActiveFilters) {
        if (selectedSourceFile) params.sourceFile = selectedSourceFile;
        if (statusFilter && statusFilter !== "all") params.status = statusFilter;
        if (gridFromDate) params.from = gridFromDate;
        if (gridToDate) params.to = gridToDate;
      }

      await telemetryService.streamDownloadDecoded(
        params,
        `${baseFilename}.xlsx`
      );
    } catch (err) {
      console.error("Failed to stream download telemetry:", err);
      alert("Failed to download telemetry: " + (err.message || "Unknown error"));
    } finally {
      setIsDownloading(false);
    }
  };

  // PERF: the column header (one <th> per parameter, each with a unit <select>, status
  // counters and badges) only depends on these values, so it is not rebuilt when the
  // user selects a row or other unrelated state changes.
  const gridHeader = useMemo(() => (
    <thead
      className="sticky-top bg-dark"
      style={{
        zIndex: 2,
        boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
      }}
    >
      <tr>
        {/* Sticky Row # */}
        <th
          style={{
            width: "60px",
            minWidth: "60px",
            position: "sticky",
            left: 0,
            zIndex: 3,
            backgroundColor: "#161b22",
          }}
          className="text-center"
        >
          #
        </th>

        {/* Sticky Frame Timestamp */}
        <th
          style={{
            minWidth: "210px",
            position: "sticky",
            left: "60px",
            zIndex: 3,
            backgroundColor: "#161b22",
          }}
        >
          <div className="d-flex align-items-center gap-1 text-info">
            <Clock size={13} />
            <span>Frame Time (UTC)</span>
          </div>
        </th>

        {/* Parameter Columns in displayOrder */}
        {displayedParameters.map((p) => {
          const pKey = p._id || p.id || p.name;
          const currentDisplayUnit = getDisplayUnit(p);
          const isOverridden = unitOverrides[pKey] || (unitOverrides[p.name] && unitOverrides[p.name] !== p.unit);
          const compatibleUnits = p.unit ? getCompatibleUnits(p.unit) : [];
          const paramStats = parameterStatusCounts[pKey] || {
            NORMAL: 0,
            WARNING: 0,
            CRITICAL: 0,
            UNKNOWN: 0,
            INVALID: 0,
          };

          return (
            <th
              key={pKey}
              style={{ minWidth: "165px" }}
              className="text-nowrap"
              data-testid={`column-header-${p.name}`}
            >
              <div className="d-flex align-items-center justify-content-between gap-2">
                <span className="text-light fw-bold text-truncate" title={p.name}>{p.name}</span>
                <div className="d-flex align-items-center gap-1">
                  {p.equation && (
                    <span
                      className="badge bg-info bg-opacity-15 text-info border border-info border-opacity-30"
                      style={{ fontSize: "0.62rem", padding: "1px 4px" }}
                      title={`Equation: ${p.equation} (^ means power)`}
                    >
                      f(x)
                    </span>
                  )}
                  {staleParametersMap[pKey] && (
                    <button
                      type="button"
                      className="badge bg-warning bg-opacity-25 text-warning border border-warning p-0 px-1 border-0"
                      style={{ fontSize: "0.62rem", cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRecomputeModalOpen(true);
                      }}
                      title="Equation, scale or offset changed: Telemetry values are stale. Click to Recompute."
                    >
                      ⚡ Stale
                    </button>
                  )}
                  {p.displayOrder !== undefined && (
                    <span
                      className="badge text-muted border border-secondary"
                      style={{ fontSize: "0.65rem", padding: "1px 4px" }}
                    >
                      #{p.displayOrder}
                    </span>
                  )}
                </div>
              </div>
              <div className="d-flex align-items-center justify-content-between gap-1 text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                <div className="d-flex align-items-center gap-1">
                  {p.unit ? (
                    compatibleUnits.length > 1 ? (
                      <select
                        className={`form-select form-select-sm py-0 px-1 font-monospace ${
                          isOverridden ? "border-info text-info bg-dark fw-bold" : "border-secondary text-muted bg-dark"
                        }`}
                        style={{ fontSize: "0.68rem", width: "auto", minWidth: "55px", height: "20px" }}
                        value={currentDisplayUnit}
                        onChange={(e) => setUnitOverride(pKey, e.target.value === p.unit ? null : e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        title={`Change display unit for ${p.name}`}
                      >
                        {compatibleUnits.map((u) => {
                          const uId = typeof u === "string" ? u : (u.id || u.symbol || String(u));
                          return (
                            <option key={uId} value={uId}>
                              [{uId}]{uId === p.unit ? " (orig)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <span className="text-info font-monospace">[{currentDisplayUnit}]</span>
                    )
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  <span className="text-secondary">{p.dataType || ""}</span>
                </div>
                {p.unit && (
                  <button
                    type="button"
                    className="btn btn-link p-0 text-muted hover-info"
                    style={{ fontSize: "0.7rem", lineHeight: 1 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnitModalTargetParamKey(pKey);
                      setIsUnitModalOpen(true);
                    }}
                    title={`Unit Converter for ${p.name}`}
                  >
                    <ArrowRightLeft size={11} className={isOverridden ? "text-info" : "text-muted"} />
                  </button>
                )}
              </div>

              {/* Per-Parameter Status Counts inside Column Header */}
              <div
                className="status-stats-block mt-1 pt-1 border-top border-secondary border-opacity-25 font-monospace text-start"
                style={{ fontSize: "0.68rem", lineHeight: 1.35 }}
                data-testid={`status-stats-${p.name}`}
              >
                {/* Accessible & test-backward-compatible hidden elements */}
                <div className="visually-hidden">
                  <span data-status="NORMAL">NORMAL: {paramStats.NORMAL ?? 0}</span>
                  <span data-status="WARNING">WARNING: {paramStats.WARNING ?? 0}</span>
                  <span data-status="CRITICAL">CRITICAL: {paramStats.CRITICAL ?? 0}</span>
                  <span data-status="UNKNOWN">UNKNOWN: {paramStats.UNKNOWN ?? 0}</span>
                  <span data-status="INVALID">INVALID: {paramStats.INVALID ?? 0}</span>
                  {Object.entries(paramStats)
                    .filter(([key]) => !["NORMAL", "WARNING", "CRITICAL", "UNKNOWN", "INVALID"].includes(key))
                    .map(([customKey, customCount]) => (
                      <span key={customKey} data-status={customKey}>
                        {customKey}: {customCount}
                      </span>
                    ))}
                </div>

                {/* Visible Numbers Only Badges: shown only when count > 0 */}
                <div className="d-flex align-items-center flex-wrap gap-1" data-testid="status-numbers-row">
                  {(paramStats.CRITICAL ?? 0) > 0 && (
                    <span
                      className="badge px-1 py-0 fw-bold"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.2)",
                        color: "var(--egse-alarm, #ef4444)",
                        border: "1px solid rgba(239, 68, 68, 0.45)",
                        fontSize: "0.68rem",
                      }}
                      title={`${paramStats.CRITICAL} critical reading${paramStats.CRITICAL === 1 ? "" : "s"}`}
                      aria-label={`${paramStats.CRITICAL} critical reading${paramStats.CRITICAL === 1 ? "" : "s"}`}
                    >
                      {paramStats.CRITICAL}
                    </span>
                  )}
                  {(paramStats.WARNING ?? 0) > 0 && (
                    <span
                      className="badge px-1 py-0 fw-bold"
                      style={{
                        backgroundColor: "rgba(245, 158, 11, 0.2)",
                        color: "var(--egse-warning, #f59e0b)",
                        border: "1px solid rgba(245, 158, 11, 0.45)",
                        fontSize: "0.68rem",
                      }}
                      title={`${paramStats.WARNING} warning reading${paramStats.WARNING === 1 ? "" : "s"}`}
                      aria-label={`${paramStats.WARNING} warning reading${paramStats.WARNING === 1 ? "" : "s"}`}
                    >
                      {paramStats.WARNING}
                    </span>
                  )}
                  {(paramStats.NORMAL ?? 0) > 0 && (
                    <span
                      className="badge px-1 py-0 fw-bold"
                      style={{
                        backgroundColor: "rgba(16, 185, 129, 0.2)",
                        color: "var(--egse-nominal, #10b981)",
                        border: "1px solid rgba(16, 185, 129, 0.45)",
                        fontSize: "0.68rem",
                      }}
                      title={`${paramStats.NORMAL} normal reading${paramStats.NORMAL === 1 ? "" : "s"}`}
                      aria-label={`${paramStats.NORMAL} normal reading${paramStats.NORMAL === 1 ? "" : "s"}`}
                    >
                      {paramStats.NORMAL}
                    </span>
                  )}
                  {(paramStats.INVALID ?? 0) > 0 && (
                    <span
                      className="badge px-1 py-0 fw-bold"
                      style={{
                        backgroundColor: "rgba(192, 132, 252, 0.2)",
                        color: "#c084fc",
                        border: "1px solid rgba(192, 132, 252, 0.45)",
                        fontSize: "0.68rem",
                      }}
                      title={`${paramStats.INVALID} invalid reading${paramStats.INVALID === 1 ? "" : "s"}`}
                      aria-label={`${paramStats.INVALID} invalid reading${paramStats.INVALID === 1 ? "" : "s"}`}
                    >
                      {paramStats.INVALID}
                    </span>
                  )}
                  {(paramStats.UNKNOWN ?? 0) > 0 && (
                    <span
                      className="badge px-1 py-0 text-muted"
                      style={{
                        backgroundColor: "rgba(148, 163, 184, 0.15)",
                        border: "1px solid rgba(148, 163, 184, 0.3)",
                        fontSize: "0.68rem",
                      }}
                      title={`${paramStats.UNKNOWN} unknown reading${paramStats.UNKNOWN === 1 ? "" : "s"}`}
                      aria-label={`${paramStats.UNKNOWN} unknown reading${paramStats.UNKNOWN === 1 ? "" : "s"}`}
                    >
                      {paramStats.UNKNOWN}
                    </span>
                  )}
                  {Object.entries(paramStats)
                    .filter(([key, count]) => !["NORMAL", "WARNING", "CRITICAL", "UNKNOWN", "INVALID"].includes(key) && (count ?? 0) > 0)
                    .map(([customKey, customCount]) => (
                      <span
                        key={customKey}
                        className="badge px-1 py-0 text-info"
                        style={{
                          backgroundColor: "rgba(6, 182, 212, 0.15)",
                          border: "1px solid rgba(6, 182, 212, 0.35)",
                          fontSize: "0.68rem",
                        }}
                        title={`${customCount} ${customKey} reading${customCount === 1 ? "" : "s"}`}
                        aria-label={`${customCount} ${customKey} reading${customCount === 1 ? "" : "s"}`}
                      >
                        {customCount}
                      </span>
                    ))}
                </div>
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  ), [displayedParameters, getDisplayUnit, unitOverrides, parameterStatusCounts, staleParametersMap, setUnitOverride]);

  const totalRecords = paginationMeta.total || 0;
  const totalPages = Math.max(1, paginationMeta.totalPages || 1);

  return (
    <div className="d-flex flex-column gap-3 animate-fade-in">
      {/* ─── Top Control Header ────────────────────────────────────────── */}
      <div
        className="p-3 rounded border d-flex flex-wrap align-items-center justify-content-between gap-3 shadow-sm"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          borderColor: "var(--egse-border-soft)",
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="p-2 rounded d-flex align-items-center justify-content-center"
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.15)",
              color: "var(--egse-raw)",
              width: "44px",
              height: "44px",
            }}
          >
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <h2 className="egse-heading h5 mb-0 text-white">
                Decoded Telemetry View
              </h2>
              {selectedSourceFile && (
                <span className="badge bg-info bg-opacity-15 text-info border border-info border-opacity-30 small">
                  File: {selectedSourceFile}
                </span>
              )}
              <span className="badge bg-dark text-muted border border-secondary small">
                {totalRecords.toLocaleString()} decoded frames
              </span>
            </div>
            <p className="small mb-0 text-muted">
              Spreadsheet grid view of decoded frame readings and parameters over time with sorting and filtering
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                viewMode === "grid" ? "btn-info text-dark fw-bold" : "btn-egse-outline"
              }`}
              onClick={() => setViewMode("grid")}
              title="Spreadsheet View"
            >
              <TableIcon size={14} />
              <span>Excel Grid</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                viewMode === "specs" ? "btn-info text-dark fw-bold" : "btn-egse-outline"
              }`}
              onClick={() => setViewMode("specs")}
              title="Parameter Specs View"
            >
              <Sliders size={14} />
              <span>Specs</span>
            </button>
          </div>

          {selectedSourceFile && (
            <button
              type="button"
              className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
              onClick={() => setSelectedSourceFile("")}
              title="Clear file filter to show all project frames"
            >
              <X size={14} /> Clear file filter
            </button>
          )}

          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-sm btn-success d-inline-flex align-items-center gap-1 shadow-sm fw-semibold"
              onClick={() => handleDownloadTelemetry(true)}
              disabled={(!currentFrame && !isHistoricalView) || totalRecords === 0 || isDownloading}
              title="Download decoded telemetry for this frame respecting active filters (.xlsx with streaming CSV fallback)"
            >
              {isDownloading ? <RefreshCw size={14} className="spin-anim" /> : <Download size={14} />}
              <span>Download Telemetry</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
              onClick={() => handleDownloadTelemetry(false)}
              disabled={(!currentFrame && !isHistoricalView) || totalRecords === 0 || isDownloading}
              title="Download ALL frame telemetry across entire mission ignoring active filters"
            >
              <span>Full Frame</span>
            </button>
          </div>

          <button
            type="button"
            className={`btn btn-sm d-flex align-items-center gap-1 ${
              activeOverridesCount > 0 ? "btn-info text-dark fw-bold" : "btn-egse-outline"
            }`}
            onClick={() => {
              setUnitModalTargetParamKey(null);
              setIsUnitModalOpen(true);
            }}
            title="Convert engineering display units"
          >
            <ArrowRightLeft size={14} />
            <span>Unit Conversion</span>
            {activeOverridesCount > 0 && (
              <span className="badge bg-dark text-info rounded-pill ms-1" style={{ fontSize: "0.68rem" }}>
                {activeOverridesCount}
              </span>
            )}
          </button>

          {activeOverridesCount > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
              onClick={resetAllOverrides}
              title="Reset all display units to defaults"
            >
              <RotateCcw size={12} />
              <span>Reset Units</span>
            </button>
          )}

          <button
            type="button"
            className={`btn btn-sm d-inline-flex align-items-center gap-1 shadow-sm ${
              hasAnyStaleParameter ? "btn-warning text-dark fw-bold" : "btn-egse-outline"
            }`}
            onClick={() => setIsRecomputeModalOpen(true)}
            disabled={isHistoricalView}
            title={isHistoricalView
              ? "Recompute needs a frame configuration, which is not available for these records"
              : "Recompute telemetry engineering values with the latest equation, scale and offset"}
          >
            <Zap size={14} className={hasAnyStaleParameter ? "text-dark" : "text-warning"} />
            <span>Recompute</span>
            {hasAnyStaleParameter && (
              <span className="badge bg-danger text-white rounded-pill ms-1" style={{ fontSize: "0.65rem" }}>
                Stale
              </span>
            )}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
            onClick={() => {
              fetchRecords(currentPage, pageSize);
            }}
            disabled={isLoading}
            title="Refresh data"
          >
            <RefreshCw size={14} className={isLoading ? "spin-anim" : ""} />
            <span>Refresh</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              title="Close window"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── SINGLE-FILE / FRAME CONTROLS ─── */}
      <div className="d-flex flex-column gap-3">
          {/* ─── LEVEL 0: File Selector ────────────────────────────────────── */}
          <div className="d-flex flex-column gap-1">
            <label className="small text-uppercase tracking-wider fw-bold text-muted d-flex align-items-center gap-1">
              <FileText size={14} className="text-info" />
              <span>1. Source File:</span>
        </label>
        <div className="d-flex flex-wrap gap-2">
            <select
              className="form-select form-select-sm egse-field font-monospace"
              style={{ maxWidth: "400px" }}
              value={selectedSourceFile}
              onChange={(e) => {
                setSelectedSourceFile(e.target.value);
                setSelectedDeletedFrameId("");
                setCurrentPage(1);
                setSelectedRowId(null);
              }}
            >
              <option value="">All Files (Mission-wide)</option>
              {processedFiles && processedFiles.map(f => (
                <option key={f._id || f.id || f.fileName} value={f.fileName}>
                  {f.fileName}
                </option>
              ))}
            </select>
        </div>
      </div>

      {/* ─── LEVEL 1: Subsystem Selector ───────────────────────────────── */}
      <div className="d-flex flex-column gap-1">
        <label className="small text-uppercase tracking-wider fw-bold text-muted d-flex align-items-center gap-1">
          <Cpu size={14} className="text-info" />
          <span>2. Subsystem:</span>
        </label>
        <div className="d-flex flex-wrap gap-2">
          {availableSubsystems.map((sub) => {
            const subId = sub._id || sub.id;
            const isSelected = subId === selectedSubsystemId;
            const frameCount = Array.isArray(sub.frames) ? sub.frames.length : 0;
            return (
              <button
                key={subId}
                type="button"
                className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
                  isSelected ? "btn-info shadow-sm" : "btn-egse-outline"
                }`}
                style={{
                  color: isSelected ? "#000" : "var(--egse-text-primary)",
                  fontWeight: isSelected ? "600" : "normal",
                  transition: "all 0.15s ease-in-out",
                }}
                onClick={() => {
                  setSelectedSubsystemId(subId);
                  setSelectedDeletedFrameId("");
                  setCurrentPage(1);
                  setSelectedRowId(null);
                }}
              >
                <Cpu size={15} />
                <span>{sub.name || "Subsystem"}</span>
                {sub.subsystemCode && (
                  <span
                    className={`badge ms-1 ${
                      isSelected ? "bg-dark text-info" : "bg-dark text-muted border border-secondary"
                    }`}
                    style={{ fontSize: "0.72rem" }}
                  >
                    0x{sub.subsystemCode}
                  </span>
                )}
                <span
                  className={`badge rounded-pill ${
                    isSelected ? "bg-dark text-light" : "bg-info bg-opacity-15 text-info"
                  }`}
                  style={{ fontSize: "0.68rem" }}
                >
                  {frameCount} {frameCount === 1 ? "frame" : "frames"}
                </span>
              </button>
            );
          })}
          {availableSubsystems.length === 0 && (
            <div className="text-muted small py-1">No subsystems configured or present in this file.</div>
          )}
        </div>
      </div>

      {isHistoricalView && (
        <div className="alert alert-warning py-2 px-3 mb-0 small" role="status">
          Frame configuration unavailable for these records. Values and statuses are shown as stored
          when the data was decoded; current limits were not applied. UNKNOWN means no status was stored.
        </div>
      )}

      {/* ─── LEVEL 2: Frame Selector ───────────────────────────────────── */}
      {(availableFrames.length > 0 || deletedFrames.length > 0) && (
        <div className="d-flex flex-column gap-1">
          <label className="small text-uppercase tracking-wider fw-bold text-muted d-flex align-items-center gap-1">
            <Layers size={14} className="text-info" />
            <span>3. Frame Layout:</span>
          </label>
          <div className="d-flex flex-wrap gap-2">
            {availableFrames.map((f) => {
              const fId = f._id || f.id;
              const isSelected = fId === selectedFrameId && !activeDeletedFrame;
              const paramCount = Array.isArray(f.parameters) ? f.parameters.length : 0;
              return (
                <button
                  key={fId}
                  type="button"
                  className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
                    isSelected ? "btn-egse-primary shadow-sm" : "btn-egse-outline"
                  }`}
                  style={{
                    fontWeight: isSelected ? "600" : "normal",
                    transition: "all 0.15s ease-in-out",
                  }}
                  onClick={() => {
                    setSelectedFrameId(fId);
                    setSelectedDeletedFrameId("");
                    setCurrentPage(1);
                    setSelectedRowId(null);
                  }}
                >
                  <Layers size={14} />
                  <span>{f.name || "Frame"}</span>
                  <span
                    className="badge ms-1"
                    style={{
                      backgroundColor: isSelected ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.08)",
                      color: isSelected ? "#fff" : "var(--egse-text-secondary)",
                      fontSize: "0.72rem",
                    }}
                  >
                    {paramCount} parameters
                  </span>
                </button>
              );
            })}
            {deletedFrames.map((f) => {
              const isSelected = f.frameId === activeDeletedFrameId;
              return (
                <button
                  key={f.frameId}
                  type="button"
                  className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
                    isSelected ? "btn-warning text-dark fw-semibold" : "btn-egse-outline"
                  }`}
                  title={`Frame configuration deleted. Subsystem: ${f.subsystemName || "Unknown"}`}
                  onClick={() => {
                    setSelectedDeletedFrameId(isSelected ? "" : f.frameId);
                    setCurrentPage(1);
                    setSelectedRowId(null);
                  }}
                >
                  <Layers size={14} />
                  <span>{f.frameName || "Unnamed frame"}</span>
                  <span className="badge bg-warning text-dark ms-1" style={{ fontSize: "0.72rem" }}>
                    Deleted · {f.records} records
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Search, Limit Status & Page Size Toolbar ─────────────────── */}
      <div
        className="p-2 px-3 rounded border d-flex flex-wrap align-items-center justify-content-between gap-3"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          borderColor: "var(--egse-border-soft)",
        }}
      >
        {/* Search */}
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: "340px" }}>
          <div className="input-group input-group-sm">
            <span className="input-group-text egse-field border-end-0">
              <Search size={14} />
            </span>
            <input
              type="text"
              className="form-control egse-field border-start-0"
              placeholder="Search parameter by name, ID, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="btn btn-sm btn-egse-outline"
                onClick={() => setSearchTerm("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Date Range Controls */}
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="d-flex align-items-center gap-1">
            <span className="small text-muted font-monospace" style={{ fontSize: "0.75rem" }}>From:</span>
            <input
              type="datetime-local"
              className="form-control form-control-sm egse-field font-monospace"
              style={{ width: "190px", fontSize: "0.75rem" }}
              value={gridFromDate}
              onChange={(e) => {
                setGridFromDate(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="d-flex align-items-center gap-1">
            <span className="small text-muted font-monospace" style={{ fontSize: "0.75rem" }}>To:</span>
            <input
              type="datetime-local"
              className="form-control form-control-sm egse-field font-monospace"
              style={{ width: "190px", fontSize: "0.75rem" }}
              value={gridToDate}
              onChange={(e) => {
                setGridToDate(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {(gridFromDate || gridToDate) && (
            <button
              type="button"
              className="btn btn-sm btn-egse-outline p-1"
              onClick={() => {
                setGridFromDate("");
                setGridToDate("");
                setCurrentPage(1);
              }}
              title="Clear date range filter"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status Filters & Page Size */}
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div className="d-flex align-items-center gap-1">
            <span className="small text-muted me-1">Status:</span>
            {[
              { id: "all", label: "All" },
              { id: "nominal", label: "Nominal" },
              { id: "warning", label: "Warning" },
              { id: "alarm", label: "Alarm" },
              { id: "invalid", label: "Invalid" },
              { id: "unknown", label: "Unknown" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                className={`btn btn-sm py-1 px-2 ${
                  statusFilter === st.id ? "btn-egse-primary" : "btn-egse-outline"
                }`}
                style={{ fontSize: "0.72rem" }}
                onClick={() => {
                  setStatusFilter(st.id);
                  setCurrentPage(1);
                }}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="d-flex align-items-center gap-1 small">
            <span className="text-muted">Show:</span>
            <select
              className="form-select form-select-sm egse-field py-1 font-monospace"
              style={{ minWidth: "105px", fontSize: "0.75rem" }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={200}>200 rows</option>
            </select>
          </div>
        </div>
      </div>

        {fetchError && (
          <div className="alert alert-danger py-2 small mb-0 d-flex align-items-center gap-2">
            <AlertTriangle size={15} />
            <span>{fetchError}</span>
          </div>
        )}
      </div>

      {/* ─── MAIN CONTENT: SPREADSHEET MATRIX (EXCEL GRID) ────────────── */}
      {viewMode === "grid" && (
        <div className="egse-panel shadow-sm" style={{ overflow: "hidden" }}>
          <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <TableIcon size={16} className="text-info" />
              <h3 className="egse-panel-title mb-0 fs-6">
                Decoded Telemetry Spreadsheet
              </h3>
            </div>
            <div className="small text-muted font-monospace">
              Showing <strong>{displayedRecords.length}</strong> records · Parameter columns:{" "}
              <strong>{displayedParameters.length}</strong> / <strong>{configuredParameters.length}</strong>
            </div>
          </div>

          {/* Status Key / Legend */}
          <div
            className="d-flex align-items-center flex-wrap gap-3 px-3 py-1 border-bottom small font-monospace"
            style={{
              fontSize: "0.72rem",
              backgroundColor: "var(--egse-bg-raised)",
              borderColor: "var(--egse-border-soft)",
            }}
            data-testid="telemetry-header-legend"
          >
            <span className="text-muted fw-semibold">Status:</span>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: "var(--egse-alarm, #ef4444)" }}>
              <span style={{ fontSize: "0.55rem" }}>●</span> Critical
            </span>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: "var(--egse-warning, #f59e0b)" }}>
              <span style={{ fontSize: "0.55rem" }}>●</span> Warning
            </span>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: "var(--egse-nominal, #10b981)" }}>
              <span style={{ fontSize: "0.55rem" }}>●</span> Normal
            </span>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: "#c084fc" }}>
              <span style={{ fontSize: "0.55rem" }}>●</span> Invalid
            </span>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: "#cbd5e1" }}>
              <span style={{ fontSize: "0.55rem" }}>●</span> Unknown
            </span>
          </div>

          <div
            ref={tableContainerRef}
            className="table-responsive"
            style={{
              maxHeight: "560px",
              overflowY: "auto",
              overflowX: "auto",
              border: "1px solid var(--egse-border-soft)",
            }}
          >
            <table className="table egse-table table-sm table-bordered table-hover align-middle mb-0 font-monospace">
              {gridHeader}

              <tbody>
                <VirtualizedGridBody
                  containerRef={tableContainerRef}
                  displayedRecords={displayedRecords}
                  displayedParameters={displayedParameters}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  selectedRowId={selectedRowId}
                  getReadingForParam={getReadingForParam}
                  getConvertedEngVal={getConvertedEngVal}
                  resolveReadingStatus={resolveReadingStatus}
                  onToggleRow={toggleSelectedRow}
                />

                {displayedRecords.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan={displayedParameters.length + 2}
                      className="text-center py-5 text-muted small"
                    >
                      {totalRecords === 0
                        ? "No decoded telemetry records found for this frame. Please process a file first or select another frame."
                        : "No records match the current filter and search conditions."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ─── Excel Footer: Pagination & Record Navigator ─────────── */}
          <div
            className="p-2 px-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2"
            style={{ backgroundColor: "var(--egse-bg-panel)" }}
          >
            <div className="small text-muted font-monospace">
              Showing records{" "}
              <strong>
                {totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
                {Math.min(currentPage * pageSize, totalRecords)}
              </strong>{" "}
              of <strong>{totalRecords.toLocaleString()}</strong> decoded frames
            </div>

            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-egse-outline p-1 px-2"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1 || isLoading}
                title="First Page (الصفحة الأولى)"
              >
                <ChevronsLeft size={16} />
              </button>

              <button
                type="button"
                className="btn btn-sm btn-egse-outline p-1 px-2"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
                title="Previous Page (الصفحة السابقة)"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="d-flex align-items-center gap-1 font-monospace px-2">
                <span className="small text-muted">Page</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                      setCurrentPage(val);
                    }
                  }}
                  className="form-control form-control-sm egse-field text-center font-monospace"
                  style={{ width: "55px", padding: "2px 4px", fontSize: "0.85rem" }}
                  disabled={isLoading || totalPages <= 1}
                />
                <span className="small text-muted">of {totalPages}</span>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-egse-outline p-1 px-2"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
                title="Next Page (الصفحة التالية)"
              >
                <ChevronRight size={16} />
              </button>

              <button
                type="button"
                className="btn btn-sm btn-egse-outline p-1 px-2"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || isLoading}
                title="Last Page (الصفحة الأخيرة)"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Selected Record Inspector Details Card (Shown on row click) ─ */}
      {viewMode === "grid" && selectedRecord && (
        <div
          className="p-3 rounded border shadow-sm animate-fade-in"
          style={{
            backgroundColor: "var(--egse-bg-panel)",
            borderColor: "var(--egse-border-soft)",
          }}
        >
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 pb-2 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <Info size={16} className="text-info" />
              <span className="fw-bold text-white small">
                Selected Frame Record Inspector
              </span>
              <span className="badge bg-dark text-info border border-secondary font-monospace small">
                {formatTime(selectedRecord.frameTimestamp)}
              </span>
            </div>

            <div className="d-flex align-items-center gap-2 small text-muted font-monospace">
              {selectedRecord.sourceFile && (
                <span>File: <strong className="text-light">{selectedRecord.sourceFile}</strong></span>
              )}
              {selectedRecord.rawEpoch !== undefined && (
                <span>Epoch: <strong className="text-light">{selectedRecord.rawEpoch}</strong></span>
              )}
              <button
                type="button"
                className="btn btn-sm btn-egse-outline py-0 px-2 ms-2"
                onClick={() => setSelectedRowId(null)}
                title="Close details card"
              >
                <X size={12} /> Close
              </button>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            {configuredParameters.map((p) => {
              const reading = getReadingForParam(selectedRecord, p);
              const rawEngVal =
                reading?.engineeringValue !== undefined
                  ? reading.engineeringValue
                  : reading?.value !== undefined
                  ? reading.value
                  : null;
              const engVal = getConvertedEngVal(p, rawEngVal);
              const displayUnit = getDisplayUnit(p);
              const isOverridden = displayUnit && p.unit && displayUnit !== p.unit;
              const rawVal = reading?.rawValue;
              const status = reading ? resolveReadingStatus(reading, p) : "unmonitored";
              const match = getStatusRepresentationMatch(engVal, p?.statusRepresentation);
              const statusLabel = match?.status || reading?.statusLabel || null;
              const badgeClass = statusLabel ? getStatusBadgeClass(statusLabel) : "";

              return (
                <div
                  key={p._id || p.id || p.name}
                  className="p-2 rounded border font-monospace flex-grow-1"
                  style={{
                    backgroundColor: isOverridden ? "rgba(6, 182, 212, 0.05)" : "rgba(255, 255, 255, 0.02)",
                    borderColor: isOverridden ? "rgba(6, 182, 212, 0.3)" : "var(--egse-border-soft)",
                    minWidth: "180px",
                    maxWidth: "260px",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <span className="text-light small text-truncate" title={p.name}>
                      {p.name}
                    </span>
                    {p.displayOrder !== undefined && (
                      <span className="badge text-muted border border-secondary" style={{ fontSize: "0.6rem" }}>
                        #{p.displayOrder}
                      </span>
                    )}
                  </div>
                  <div className="d-flex align-items-baseline justify-content-between">
                    {(() => {
                      const match = getStatusRepresentationMatch(engVal, p?.statusRepresentation);
                      const statusLabel = match?.status || reading?.statusLabel || null;
                      if (statusLabel) {
                        const badgeClass = getStatusBadgeClass(statusLabel);
                        return (
                          <div className="d-flex flex-column align-items-start gap-1">
                            <div className="d-flex align-items-center gap-1">
                              <span className={`${badgeClass} fw-bold`} style={{ fontSize: "0.78rem", padding: "2px 6px" }} title={match?.description || undefined}>
                                {statusLabel}
                              </span>
                              <span className="small text-muted font-monospace">
                                ({formatEng(engVal, p)})
                              </span>
                            </div>
                            {match?.description && (
                              <span className="text-muted text-truncate" style={{ fontSize: "0.68rem", maxWidth: "160px" }} title={match.description}>
                                {match.description}
                              </span>
                            )}
                          </div>
                        );
                      }
                      return (
                        <span className="fs-6 fw-bold text-info">
                          {formatEng(engVal, p)}{" "}
                          <span className={`small ${isOverridden ? "text-warning fw-bold" : "text-muted"}`}>
                            {displayUnit || p.unit}
                          </span>
                        </span>
                      );
                    })()}
                    <span className="small text-muted" style={{ fontSize: "0.7rem" }}>
                      Raw: {formatRaw(rawVal)}
                      {reading?.precisionApproximated && (
                        <span
                          className="badge bg-secondary bg-opacity-30 text-warning border border-warning border-opacity-30 ms-1"
                          style={{ fontSize: "0.6rem" }}
                          title="Raw value exceeds 2^53 - 1; converted with double precision approximation"
                        >
                          ≈ Approx (&gt;2⁵³)
                        </span>
                      )}
                    </span>
                  </div>
                  {isOverridden && rawEngVal !== null && (
                    <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                      Orig: {formatEng(rawEngVal, p)} {p.unit}
                    </div>
                  )}
                  <div className="mt-2 d-flex align-items-center justify-content-between gap-1">
                    {statusLabel ? (
                      <span
                        className={`${badgeClass} fw-semibold`}
                        style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                        title={`Status: ${statusLabel}${match?.description ? ` (${match.description})` : ""}`}
                      >
                        {statusLabel}
                      </span>
                    ) : (
                      <span />
                    )}
                    <div>
                      {renderStatusDot(status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 2: PARAMETER SPECIFICATIONS VIEW (SPECS) ─────────────── */}
      {viewMode === "specs" && (
        <div className="egse-panel shadow-sm">
          <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="d-flex align-items-center gap-2">
              <Sliders size={16} className="text-info" />
              <h3 className="egse-panel-title mb-0 fs-6">
                Parameter Specifications & Binary Layout
              </h3>
            </div>
            <div className="small text-muted">
              Showing <strong>{displayedParameters.length}</strong> of{" "}
              <strong>{configuredParameters.length}</strong> configured channels
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: "600px", overflowY: "auto" }}>
            <table className="table egse-table table-sm table-hover align-middle mb-0">
              <thead className="sticky-top bg-dark">
                <tr>
                  <th style={{ width: "60px" }} className="text-center"># Order</th>
                  <th style={{ width: "26%" }}>Parameter Name & ID</th>
                  <th style={{ width: "12%" }}>Binary Layout</th>
                  <th style={{ width: "10%" }}>Data Type</th>
                  <th style={{ width: "16%" }}>Raw Value</th>
                  <th style={{ width: "18%" }}>Engineering Value</th>
                  <th style={{ width: "8%" }}>Unit</th>
                  <th style={{ width: "10%" }} className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedParameters.map((p) => {
                  const pKey = p._id || p.id || p.name;
                  const reading = selectedRecord ? getReadingForParam(selectedRecord, p) : null;
                  const rawVal = reading?.rawValue !== undefined ? reading.rawValue : null;
                  const rawEngVal =
                    reading?.engineeringValue !== undefined
                      ? reading.engineeringValue
                      : reading?.value !== undefined
                      ? reading.value
                      : null;
                  const engVal = getConvertedEngVal(p, rawEngVal);
                  const displayUnit = getDisplayUnit(p);
                  const isOverridden = displayUnit && p.unit && displayUnit !== p.unit;
                  const status = reading ? resolveReadingStatus(reading, p) : "unmonitored";

                  const bitInfo =
                    p.bitOffset !== null && p.bitOffset !== undefined && p.bitLength
                      ? `b:${p.bitOffset}..${p.bitOffset + p.bitLength - 1}`
                      : null;

                  return (
                    <tr key={p._id || p.id || p.name}>
                      <td className="text-center">
                        <span
                          className="badge font-monospace"
                          style={{
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            color: "var(--egse-text-secondary)",
                            fontSize: "0.75rem",
                            minWidth: "28px",
                          }}
                        >
                          {p.displayOrder ?? "—"}
                        </span>
                      </td>

                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold text-light">{p.name}</span>
                          {p.equation && (
                            <span
                              className="badge bg-info bg-opacity-15 text-info border border-info border-opacity-30"
                              style={{ fontSize: "0.65rem" }}
                              title={`Equation: ${p.equation} (^ means power)`}
                            >
                              f(x): {p.equation}
                            </span>
                          )}
                          {staleParametersMap[pKey] && (
                            <button
                              type="button"
                              className="badge bg-warning bg-opacity-25 text-warning border border-warning p-0 px-1 border-0"
                              style={{ fontSize: "0.65rem", cursor: "pointer" }}
                              onClick={() => setIsRecomputeModalOpen(true)}
                              title="Equation, scale or offset changed: Click to Recompute"
                            >
                              ⚡ Stale
                            </button>
                          )}
                        </div>
                        <div className="font-monospace text-muted" style={{ fontSize: "0.72rem" }}>
                          {p.parameterId || p._id || "—"}
                        </div>
                        {p.description && (
                          <div
                            className="small text-muted text-truncate"
                            style={{ maxWidth: "260px", fontSize: "0.7rem" }}
                            title={p.description}
                          >
                            {p.description}
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="font-monospace small text-info">
                          Byte {p.byteOffset ?? 0}
                        </div>
                        {bitInfo && (
                          <div className="font-monospace small text-muted" style={{ fontSize: "0.7rem" }}>
                            {bitInfo} {p.signed ? "(signed)" : ""}
                          </div>
                        )}
                      </td>

                      <td>
                        <span
                          className="badge font-monospace"
                          style={{
                            backgroundColor: "rgba(99, 102, 241, 0.12)",
                            color: "#818cf8",
                            border: "1px solid rgba(99, 102, 241, 0.25)",
                            fontSize: "0.72rem",
                          }}
                        >
                          {p.dataType}
                        </span>
                      </td>

                      <td>
                        <span className="font-monospace text-secondary small d-inline-flex align-items-center gap-1 flex-wrap">
                          <span>
                            {formatRaw(rawVal)}
                          </span>
                          {reading?.precisionApproximated && (
                            <span
                              className="badge bg-secondary bg-opacity-30 text-warning border border-warning border-opacity-30 ms-1"
                              style={{ fontSize: "0.6rem" }}
                              title="Raw value exceeds 2^53 - 1; converted with double precision approximation"
                            >
                              ≈ Approx (&gt;2⁵³)
                            </span>
                          )}
                        </span>
                      </td>

                      <td>
                        {(() => {
                          const match = getStatusRepresentationMatch(engVal, p?.statusRepresentation);
                          const statusLabel = match?.status || reading?.statusLabel;
                          const statusDesc = match?.description;

                          if (statusLabel) {
                            const badgeClass = getStatusBadgeClass(statusLabel);
                            return (
                              <div className="d-inline-flex flex-column align-items-start gap-1">
                                <div className="d-inline-flex align-items-center gap-1 flex-wrap">
                                  <span
                                    className={`${badgeClass} fw-bold`}
                                    style={{ fontSize: "0.82rem", padding: "3px 8px" }}
                                    title={`Status: ${statusLabel}${statusDesc ? ` · ${statusDesc}` : ""}\nEngineering: ${formatEng(engVal, p)}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span
                                    className="font-monospace text-secondary small"
                                    style={{ fontSize: "0.75rem" }}
                                    title={`Original engineering value: ${formatEng(engVal, p)}`}
                                  >
                                    ({formatEng(engVal, p)})
                                  </span>
                                </div>
                                {statusDesc && (
                                  <div
                                    className="small text-muted text-truncate"
                                    style={{ maxWidth: "220px", fontSize: "0.7rem", lineHeight: 1.2 }}
                                    title={statusDesc}
                                  >
                                    {statusDesc}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <span
                              className="font-monospace fw-bold"
                              style={{
                                color: engVal !== null ? (isOverridden ? "#38bdf8" : "var(--egse-raw)") : "var(--egse-text-muted)",
                                fontSize: "0.9rem",
                              }}
                            >
                              {formatEng(engVal, p)}
                            </span>
                          );
                        })()}
                        {isOverridden && rawEngVal !== null && (
                          <div className="text-muted small" style={{ fontSize: "0.68rem" }}>
                            orig: {formatEng(rawEngVal, p)}
                          </div>
                        )}
                      </td>

                      <td>
                        <span className={isOverridden ? "text-info fw-bold" : "text-muted small"}>
                          {displayUnit || p.unit || "—"}
                        </span>
                        {isOverridden && (
                          <span className="badge bg-dark text-muted border border-secondary ms-1" style={{ fontSize: "0.65rem" }}>
                            orig: {p.unit}
                          </span>
                        )}
                      </td>

                      <td className="text-center">
                        {renderStatusDot(status)}
                      </td>
                    </tr>
                  );
                })}

                {displayedParameters.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center py-5 text-muted small">
                      No parameters match the search conditions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Unit Converter Modal for Decoded Telemetry ───────────────── */}
      <DecodedUnitConverterModal
        isOpen={isUnitModalOpen}
        onClose={() => {
          setIsUnitModalOpen(false);
          setUnitModalTargetParamKey(null);
        }}
        parameters={configuredParameters}
        unitOverrides={unitOverrides}
        onApplyOverride={(paramKey, targetUnit) => {
          setUnitOverride(paramKey, targetUnit);
        }}
        onResetOverrides={resetAllOverrides}
        initialParamKey={unitModalTargetParamKey}
      />

      {/* ─── Recompute Telemetry Modal ───────────────────────────────── */}
      <RecomputeModal
        isOpen={isRecomputeModalOpen}
        onClose={() => setIsRecomputeModalOpen(false)}
        projectId={projectId}
        projectName={selectedProject?.name || ""}
        selectedSubsystemId={selectedSubsystemId}
        selectedFrameId={selectedFrameId}
        selectedSourceFile={selectedSourceFile}
        subsystems={subsystems}
        currentFrame={currentFrame}
        configuredParameters={configuredParameters}
        staleParameters={staleParametersMap}
        onSuccess={() => {
          fetchRecords(currentPage, pageSize);
        }}
      />
    </div>
  );
}
