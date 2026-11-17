import { useEffect, useMemo, useRef, useState } from "react";

import TrendChart from "./TrendChart";
import StatsRow from "./StatsRow";
import DataGrid from "./DataGrid";

import {
  rowsToCsv,
  downloadTextFile,
} from "../../../utils/csvExport";
import telemetryService from "../../../services/telemetryService";
import { useSelector } from "react-redux";
import { selectCanExportTelemetry } from "../../../redux/slices/authSlice";

import { detectGaps } from "../../../utils/seriesGaps";

function highlightMatch(value, query) {
  const text = String(value || "");
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index < 0) return text;
  return <>{text.slice(0, index)}<mark className="px-0" style={{ backgroundColor: "var(--egse-warning, #fbbf24)", color: "var(--egse-bg-deep, #070d19)" }}>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}

export default function GraphCard({
  subsystem,
  label,
  unit,
  limits,
  projectId,
  frameId,
  activeFilters,
  series = [],
  total = 0,
  limit,
  loading = false,
  error = "",
  compareOptions = [],
  compareKeys = [],
  onCompareChange,
  comparisons = [],
  onRemove,
}) {
  const chartRef = useRef(null);
  // F12: CSV export needs export_telemetry, like every other export (the server enforces it)
  const canExport = useSelector(selectCanExportTelemetry);
  const [showTable, setShowTable] = useState(false);
  const [comparisonSearch, setComparisonSearch] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const compareRef = useRef(null);

  // Close the comparison dropdown on outside click / touch or Escape
  useEffect(() => {
    if (!compareOpen) return undefined;
    const handlePointerDown = (event) => {
      if (compareRef.current && !compareRef.current.contains(event.target)) setCompareOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setCompareOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [compareOpen]);
  const [debouncedComparisonSearch, setDebouncedComparisonSearch] = useState("");
  const [expandedSubsystems, setExpandedSubsystems] = useState(() => new Set());
  const [collapsedSearchSubsystems, setCollapsedSearchSubsystems] = useState(() => new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedComparisonSearch(comparisonSearch.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [comparisonSearch]);

  const comparisonGroups = useMemo(() => {
    const query = debouncedComparisonSearch.toLowerCase();
    const groupsBySubsystem = new Map();
    for (const parameter of compareOptions) {
      if (query && !String(parameter.name || "").toLowerCase().includes(query)) continue;
      const subsystem = !parameter.subsystem || parameter.subsystem === "Unknown"
        ? "Other / Unassigned"
        : parameter.subsystem;
      const frameKey = parameter.frameId || parameter.frameName || parameter.key;
      const frameName = parameter.frameName || "Unnamed Frame";

      if (!groupsBySubsystem.has(subsystem)) groupsBySubsystem.set(subsystem, new Map());
      const frames = groupsBySubsystem.get(subsystem);
      if (!frames.has(frameKey)) frames.set(frameKey, { frameKey, frameName, parameters: [] });
      frames.get(frameKey).parameters.push(parameter);
    }

    return [...groupsBySubsystem.entries()]
      .map(([subsystem, frames]) => ({
        subsystem,
        frames: [...frames.values()],
      }))
      .sort((a, b) => {
        if (a.subsystem === "Other / Unassigned") return 1;
        if (b.subsystem === "Other / Unassigned") return -1;
        return a.subsystem.localeCompare(b.subsystem);
      });
  }, [compareOptions, debouncedComparisonSearch]);

  const selectedComparisonParameters = useMemo(
    () => compareOptions.filter((parameter) => compareKeys.includes(parameter.key)),
    [compareOptions, compareKeys]
  );

  const toggleSubsystem = (subsystem, isSearching) => {
    const setTarget = isSearching ? setCollapsedSearchSubsystems : setExpandedSubsystems;
    setTarget((previous) => {
      const next = new Set(previous);
      if (next.has(subsystem)) next.delete(subsystem);
      else next.add(subsystem);
      return next;
    });
  };

  const handleComparisonSearchChange = (value) => {
    setComparisonSearch(value);
    setCollapsedSearchSubsystems(new Set());
    if (!value.trim()) {
      setExpandedSubsystems(new Set());
      setDebouncedComparisonSearch("");
    }
  };

  const updateComparison = (parameter, selected) => {
    const next = selected
      ? [...compareKeys, parameter.key]
      : compareKeys.filter((key) => key !== parameter.key);
    onCompareChange(next);
  };

  const safeSeries = Array.isArray(series)
    ? series
    : [];

  const gaps = useMemo(
    () => detectGaps(safeSeries),
    [safeSeries]
  );

  const comparisonSeries = comparisons.map((item) => ({
    ...item,
    gaps: detectGaps(item.series || []),
  }));

  const truncated =
    Boolean(limit) && Number(total) > Number(limit);

  const handleExportCsv = async () => {
    if (!canExport) return;
    if (!safeSeries.length && !total) {
      return;
    }

    const safeSubsystem = subsystem || "subsystem";
    const safeLabel = label || "parameter";
    const outFilename = `${safeSubsystem}_${safeLabel}_export.csv`;

    try {
      if (projectId && label) {
        await telemetryService.downloadHistoryCsv(
          {
            projectId,
            parameterName: label,
            frameId: frameId || undefined,
            from: activeFilters?.from ? new Date(activeFilters.from).toISOString() : undefined,
            to: activeFilters?.to ? new Date(activeFilters.to).toISOString() : undefined,
            status: activeFilters?.statusFilter !== "all" ? activeFilters?.statusFilter : undefined,
            unit: unit || "",
          },
          outFilename
        );
        return;
      }
    } catch (err) {
      // A refusal is final: never rebuild the file in the browser
      if (err?.statusCode === 403 || err?.response?.status === 403) return;
      console.warn("Backend streaming CSV export failed, falling back to in-memory rows:", err);
    }

    if (!safeSeries.length) return;

    const csv = rowsToCsv(safeSeries, [
      {
        label: "epoch_msec",
        get: (row) => row.epoch,
      },
      {
        label: "packet_idx",
        get: (row) => row.packetIdx,
      },
      {
        label: "timestamp",
        get: (row) => {
          if (!Number.isFinite(row.t)) {
            return "";
          }

          return new Date(row.t).toISOString();
        },
      },
      {
        label: `value_${unit || ""}`.replace(/\s+/g, ""),
        get: (row) => row.value,
      },
      {
        label: "limit_status",
        get: (row) => row.status,
      },
    ]);

    downloadTextFile(
      outFilename,
      csv
    );
  };

  return (
    <div className="egse-panel mb-3">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">
          📈 {label || "Parameter"}

          <span
            style={{
              color: "var(--egse-text-muted)",
              fontWeight: 400,
            }}
          >
            {" "}
            · {subsystem || "Unknown Subsystem"}
          </span>

          {loading && (
            <span
              className="spinner-border spinner-border-sm ms-2"
              role="status"
              aria-label="Loading"
            />
          )}
        </h3>

        <div className="d-flex flex-wrap gap-2 align-items-center">
          <div ref={compareRef} className="d-flex flex-wrap gap-2 align-items-center">
          {onCompareChange && (
            <div className="input-group input-group-sm" style={{ width: "min(260px, 75vw)" }}>
              <input
                type="search"
                className="form-control"
                value={comparisonSearch}
                onChange={(event) => { handleComparisonSearchChange(event.target.value); setCompareOpen(true); }}
                onFocus={() => setCompareOpen(true)}
                placeholder="Search parameter..."
                aria-label="Search comparison parameters"
              />
              {comparisonSearch && <button type="button" className="btn btn-egse-outline" aria-label="Clear search" title="Clear search" onClick={() => handleComparisonSearchChange("")}>×</button>}
            </div>
          )}
          {onCompareChange && (
            <div className="position-relative">
              <button type="button" className="btn btn-sm btn-egse-outline" aria-haspopup="true" aria-expanded={compareOpen} onClick={() => setCompareOpen((open) => !open)}>Compare ({compareKeys.length})</button>
              {compareOpen && (
              <div className="egse-panel p-2 position-absolute end-0 mt-1" style={{ zIndex: 5, width: "min(360px, 90vw)", maxHeight: "70vh", overflowY: "auto" }}>
                {selectedComparisonParameters.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {selectedComparisonParameters.map((parameter) => (
                      <span key={parameter.key} className="badge rounded-pill border d-inline-flex align-items-center gap-1" style={{ color: "var(--egse-text-primary)", borderColor: "var(--egse-border-soft)" }}>
                        {parameter.frameName} · {parameter.name}
                        <button type="button" className="btn p-0 border-0 text-reset" aria-label={`Remove ${parameter.name} from comparison`} title="Remove" onClick={() => updateComparison(parameter, false)}>×</button>
                      </span>
                    ))}
                    <button type="button" className="btn btn-sm btn-egse-outline" onClick={() => onCompareChange([])}>Clear all</button>
                  </div>
                )}

                {comparisonGroups.length === 0 ? (
                  <div className="small py-2" style={{ color: "var(--egse-text-muted)" }}>No results</div>
                ) : comparisonGroups.map((group) => {
                  const isSearching = Boolean(debouncedComparisonSearch);
                  const isExpanded = isSearching
                    ? !collapsedSearchSubsystems.has(group.subsystem)
                    : expandedSubsystems.has(group.subsystem);
                  const totalFrames = group.frames.length;
                  const selectedFrames = group.frames.filter((frame) => frame.parameters.some((parameter) => compareKeys.includes(parameter.key))).length;
                  return (
                    <section key={group.subsystem} className="border-bottom py-1" style={{ borderColor: "var(--egse-border-soft)" }}>
                      <button type="button" className="btn btn-sm w-100 text-start d-flex justify-content-between align-items-center" style={{ color: "var(--egse-text-primary)" }} aria-expanded={isExpanded} onClick={() => toggleSubsystem(group.subsystem, isSearching)}>
                        <span>{isExpanded ? "▾" : "▸"} {highlightMatch(group.subsystem, debouncedComparisonSearch)}</span>
                        <span className="small" style={{ color: "var(--egse-text-muted)" }}>{totalFrames} frames · {selectedFrames} selected</span>
                      </button>
                      {isExpanded && group.frames.map((frame) => (
                        <div key={frame.frameKey} className="ps-3">
                          <div className="small fw-semibold py-1" style={{ color: "var(--egse-text-secondary)" }}>{highlightMatch(frame.frameName, debouncedComparisonSearch)}</div>
                          {frame.parameters.map((parameter) => {
                            const checked = compareKeys.includes(parameter.key);
                            return (
                              <label key={parameter.key} className="d-flex align-items-center gap-2 small py-1 ps-2" style={{ color: "var(--egse-text-primary)", cursor: "pointer" }}>
                                <input type="checkbox" checked={checked} onChange={(event) => updateComparison(parameter, event.target.checked)} />
                                <span>{highlightMatch(parameter.name, debouncedComparisonSearch)}{parameter.unit ? ` (${parameter.unit})` : ""}</span>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
              )}
            </div>
          )}
          </div>

          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={() =>
              chartRef.current?.resetZoom?.()
            }
          >
            ⟲ Reset Zoom
          </button>

          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={() =>
              setShowTable((value) => !value)
            }
          >
            {showTable
              ? "Hide Table"
              : "Show Table"}
          </button>

          {canExport && (
            <button
              type="button"
              className="btn btn-sm btn-egse-outline"
              onClick={handleExportCsv}
              disabled={!safeSeries.length}
            >
              ⬇️ CSV
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={onRemove}
            title="Remove graph"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="egse-panel-body d-flex flex-column gap-3">
        {error && (
          <div
            className="egse-chip egse-chip-alarm d-flex"
            style={{
              whiteSpace: "normal",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {truncated && (
          <div
            className="small"
            style={{
              color: "var(--egse-warning)",
            }}
          >
            Showing the first{" "}
            {Number(limit).toLocaleString("en-US")}{" "}
            of{" "}
            {Number(total).toLocaleString("en-US")}{" "}
            samples — narrow the date range to see the
            rest.
          </div>
        )}

        <TrendChart
          ref={chartRef}
          series={safeSeries}
          label={label}
          unit={unit}
          limits={limits}
          gaps={gaps}
          multiSeries={comparisonSeries.map((item) => ({
            label: item.parameter?.name || "Parameter",
            unit: item.parameter?.unit || "",
            series: item.series || [],
            gaps: item.gaps,
          }))}
        />

        {safeSeries.length > 0 ? (
          <StatsRow
            series={safeSeries}
            unit={unit}
          />
        ) : (
          !loading &&
          !error && (
            <div
              className="small"
              style={{
                color: "var(--egse-text-muted)",
              }}
            >
              No matching decoded telemetry is
              available for this parameter.
            </div>
          )
        )}

        {showTable && (
          <DataGrid rows={safeSeries} />
        )}
      </div>
    </div>
  );
}