import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import {
  RefreshCw,
  Search,
  Filter,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  FileText,
  Layers,
  Cpu,
  Table as TableIcon,
  Download,
  FolderArchive,
  ArrowRight,
  LayoutGrid,
  Radio,
} from "lucide-react";

import axiosClient from "../../api/axiosClient";
import telemetryService from "../../services/telemetryService";
import {
  matchStatusRepresentation,
  getStatusRepresentationMatch,
  getStatusBadgeClass,
} from "../../utils/statusRepresentationHelper";
import { selectSelectedProject } from "../../redux/slices/projectsSlice";

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatRaw(val) {
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
}

function formatEng(val, precision = null) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return String(val);
    const dec = precision !== null ? precision : 3;
    return val.toFixed(dec);
  }
  return String(val);
}

function isCriticalStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("crit") || normalized.includes("alarm");
}

function renderStatusDot(status) {
  const s = String(status || "unknown").toLowerCase();
  let color = "#cbd5e1";
  let label = status ? String(status).toUpperCase() : "UNKNOWN";
  if (s === "nominal" || s === "normal" || s === "ok") {
    color = "#22c55e";
    label = "NOMINAL";
  } else if (s.includes("warn")) {
    color = "#f59e0b";
    label = s.toUpperCase();
  } else if (s.includes("alarm") || s.includes("crit")) {
    color = "#ef4444";
    label = s.toUpperCase();
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

export default function DecodedDataPage() {
  const routeParams = useParams();
  const selectedProject = useSelector(selectSelectedProject);

  const routeProjectId = routeParams?.projectId;
  const projectId = useMemo(
    () => routeProjectId || selectedProject?._id || selectedProject?.id || "",
    [routeProjectId, selectedProject]
  );

  // Subsystems and configured frames from project definition
  const rawSubsystems = useMemo(() => {
    return Array.isArray(selectedProject?.rawSubsystems) ? selectedProject.rawSubsystems : [];
  }, [selectedProject]);

  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 0,
  });

  // Filters & Selected Navigation
  const [selectedSubsystem, setSelectedSubsystem] = useState("ALL");
  const [selectedFrame, setSelectedFrame] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'nominal' | 'warning' | 'alarm'
  const [searchTerm, setSearchTerm] = useState("");

  // Instance scrubber for the Table view (which packet of the current selection)
  const [currentInstanceIdx, setCurrentInstanceIdx] = useState(0);

  // View mode: 'table' (like DecodedTelemetryView) vs 'packets' (all frames stream table)
  const [viewMode, setViewMode] = useState("table");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  // Load telemetry records from backend
  const loadDecodedTelemetry = useCallback(
    async (requestedPage = 1) => {
      if (!projectId) {
        setRecords([]);
        setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
        return;
      }

      setLoading(true);
      setError("");

      try {
        const params = {
          projectId,
          page: requestedPage,
          limit: PAGE_SIZE,
          sortBy: "frameTimestamp",
          sortOrder: "desc",
        };

        if (selectedSubsystem && selectedSubsystem !== "ALL") {
          params.subsystem = selectedSubsystem;
        }

        if (selectedFrame && selectedFrame !== "ALL") {
          params.frameName = selectedFrame;
        }

        if (statusFilter && statusFilter !== "all") {
          params.status = statusFilter;
        }

        const response = await axiosClient.get("/telemetry", { params });

        let recordsList = [];
        let metaObj = {};

        if (Array.isArray(response)) {
          recordsList = response;
        } else if (Array.isArray(response?.data)) {
          recordsList = response.data;
          metaObj = response.meta || response.pagination || {};
        } else if (response?.data && Array.isArray(response.data.data)) {
          recordsList = response.data.data;
          metaObj = response.data.meta || response.data.pagination || {};
        }

        setRecords(recordsList);
        setCurrentInstanceIdx(0);

        const totalRecords = Number(metaObj.total !== undefined ? metaObj.total : recordsList.length);
        const totalPages = Number(metaObj.totalPages || metaObj.pages || (totalRecords > 0 ? Math.ceil(totalRecords / PAGE_SIZE) : 0));

        setPagination({
          page: Number(metaObj.page) || requestedPage,
          limit: Number(metaObj.limit) || PAGE_SIZE,
          total: totalRecords,
          pages: totalPages,
        });

        setPage(Number(metaObj.page) || requestedPage);
      } catch (err) {
        console.error("Failed to load decoded telemetry:", err);
        const message = err?.message || err?.response?.data?.message || "Unable to load decoded telemetry.";
        setError(message);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId, selectedSubsystem, selectedFrame, statusFilter]
  );

  useEffect(() => {
    setPage(1);
    loadDecodedTelemetry(1);
  }, [loadDecodedTelemetry]);

  // Available Subsystems list
  const availableSubsystems = useMemo(() => {
    const map = new Map();
    rawSubsystems.forEach((s) => {
      const key = s.subsystemCode || s.name;
      if (key) map.set(key, { code: s.subsystemCode, name: s.name, frames: s.frames || [] });
    });

    records.forEach((r) => {
      const code = r.subsystemCode;
      const name = r.subsystemName || r.subsystem?.name;
      const key = code || name;
      if (key && !map.has(key)) {
        map.set(key, { code, name: name || code, frames: [] });
      }
    });

    return Array.from(map.values());
  }, [rawSubsystems, records]);

  // Available Frames list based on selected subsystem
  const availableFrames = useMemo(() => {
    const frameSet = new Set();

    if (selectedSubsystem !== "ALL") {
      const sub = rawSubsystems.find(
        (s) => s.subsystemCode === selectedSubsystem || s.name === selectedSubsystem
      );
      if (sub && Array.isArray(sub.frames)) {
        sub.frames.forEach((f) => {
          if (f.name) frameSet.add(f.name);
        });
      }
    } else {
      rawSubsystems.forEach((s) => {
        if (Array.isArray(s.frames)) {
          s.frames.forEach((f) => {
            if (f.name) frameSet.add(f.name);
          });
        }
      });
    }

    records.forEach((r) => {
      const fName = r.frameName || r.frame?.name || (typeof r.frame === "string" ? r.frame : null);
      if (fName) {
        if (selectedSubsystem === "ALL" || r.subsystemCode === selectedSubsystem || r.subsystemName === selectedSubsystem) {
          frameSet.add(fName);
        }
      }
    });

    return Array.from(frameSet);
  }, [rawSubsystems, records, selectedSubsystem]);

  // Currently filtered records
  const filteredRecords = useMemo(() => {
    let list = records;

    if (selectedSubsystem !== "ALL") {
      list = list.filter(
        (r) => r.subsystemCode === selectedSubsystem || r.subsystemName === selectedSubsystem
      );
    }

    if (selectedFrame !== "ALL") {
      list = list.filter((r) => {
        const name = r.frameName || r.frame?.name || r.frame;
        return name === selectedFrame;
      });
    }

    if (statusFilter !== "all") {
      list = list.filter((r) => {
        if (!Array.isArray(r.readings)) return false;
        return r.readings.some((rd) => {
          const st = String(rd.limitStatus || rd.status || "").toLowerCase();
          if (statusFilter === "nominal") return st === "nominal" || st === "normal" || st === "ok";
          if (statusFilter === "warning") return st.includes("warn");
          if (statusFilter === "alarm") return st.includes("alarm") || st.includes("crit");
          return true;
        });
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((r) => {
        const sub = (r.subsystemName || r.subsystemCode || "").toLowerCase();
        const frm = (r.frameName || r.frame?.name || "").toLowerCase();
        const file = (r.sourceFile || "").toLowerCase();
        const hasParamMatch = Array.isArray(r.readings) && r.readings.some((rd) => {
          return (
            (rd.parameterName || "").toLowerCase().includes(q) ||
            String(rd.parameterId || "").toLowerCase().includes(q) ||
            String(rd.rawValue ?? "").toLowerCase().includes(q) ||
            String(rd.engineeringValue ?? "").toLowerCase().includes(q) ||
            (rd.statusLabel && String(rd.statusLabel).toLowerCase().includes(q))
          );
        });
        return sub.includes(q) || frm.includes(q) || file.includes(q) || hasParamMatch;
      });
    }

    return list;
  }, [records, selectedSubsystem, selectedFrame, statusFilter, searchTerm]);

  // Lookup map of configured parameters across all subsystems and frames in the project
  const parameterDefMap = useMemo(() => {
    const map = new Map();
    rawSubsystems.forEach((sub) => {
      if (Array.isArray(sub.frames)) {
        sub.frames.forEach((frame) => {
          if (Array.isArray(frame.parameters)) {
            frame.parameters.forEach((param) => {
              if (param._id) map.set(String(param._id), param);
              if (param.id) map.set(String(param.id), param);
              if (param.parameterId) map.set(String(param.parameterId), param);
              if (param.name) map.set(String(param.name).toLowerCase(), param);
            });
          }
        });
      }
    });
    return map;
  }, [rawSubsystems]);

  // Active packet instance for Table view
  const currentPacket = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    const safeIdx = Math.min(Math.max(0, currentInstanceIdx), filteredRecords.length - 1);
    return filteredRecords[safeIdx] || null;
  }, [filteredRecords, currentInstanceIdx]);

  // Match configured parameter definitions with readings in current packet
  const activeFrameDefinition = useMemo(() => {
    if (!currentPacket) return null;
    const fName = currentPacket.frameName || currentPacket.frame?.name || currentPacket.frame;
    for (const sub of rawSubsystems) {
      if (Array.isArray(sub.frames)) {
        const found = sub.frames.find((f) =>
          f.name === fName ||
          String(f._id || '') === String(currentPacket.frameId || '') ||
          String(f.id || '') === String(currentPacket.frameId || '')
        );
        if (found) return found;
      }
    }
    return null;
  }, [currentPacket, rawSubsystems]);

  const displayedParameters = useMemo(() => {
    if (viewMode === "all") {
      return filteredRecords.flatMap((packet, packetIndex) => {
        const frameName = packet.frameName || packet.frame?.name || packet.frame || "Unknown frame";
        return (Array.isArray(packet.readings) ? packet.readings : []).map((reading, readingIndex) => {
          const paramDef = (reading.parameterId && parameterDefMap.get(String(reading.parameterId))) ||
                           (reading.parameterName && parameterDefMap.get(String(reading.parameterName).toLowerCase())) ||
                           null;
          const engVal = reading.engineeringValue ?? reading.value ?? null;
          return {
            order: readingIndex + 1,
            name: reading.parameterName || paramDef?.name || `Param_${readingIndex + 1}`,
            parameterId: reading.parameterId || paramDef?.parameterId || `${packetIndex}-${readingIndex}`,
            description: paramDef?.description || "",
            byteOffset: reading.byteOffset ?? paramDef?.byteOffset ?? 0,
            bitOffset: reading.bitOffset ?? paramDef?.bitOffset ?? null,
            bitLength: reading.bitLength ?? paramDef?.bitLength ?? null,
            dataType: reading.dataType || paramDef?.dataType || "RAW",
            signed: reading.signed ?? paramDef?.signed ?? false,
            rawValue: reading.rawValue,
            engineeringValue: engVal,
            unit: reading.unit || paramDef?.unit || "—",
            status: reading.limitStatus || reading.status || "unknown",
            statusLabel: reading.statusLabel || null,
            statusRepresentation: paramDef?.statusRepresentation || reading.statusRepresentation || null,
            precision: paramDef?.precision ?? null,
            frameName,
            timestamp: packet.frameTimestamp || packet.timestamp,
          };
        });
      });
    }
    if (!currentPacket) return [];
    const readings = Array.isArray(currentPacket.readings) ? currentPacket.readings : [];
    const readingsMap = new Map();

    readings.forEach((r) => {
      if (r.parameterId) readingsMap.set(String(r.parameterId), r);
      if (r.parameterName) readingsMap.set(String(r.parameterName).toLowerCase(), r);
    });

    // If frame configuration has parameters, use them in displayOrder:
    if (activeFrameDefinition && Array.isArray(activeFrameDefinition.parameters) && activeFrameDefinition.parameters.length > 0) {
      const sorted = [...activeFrameDefinition.parameters].sort((a, b) => {
        const orderA = a.displayOrder !== undefined && a.displayOrder !== null ? Number(a.displayOrder) : 99999;
        const orderB = b.displayOrder !== undefined && b.displayOrder !== null ? Number(b.displayOrder) : 99999;
        return orderA - orderB;
      });

      return sorted.map((p, idx) => {
        const pId = p._id || p.id;
        const reading = readingsMap.get(String(pId)) || readingsMap.get(String(p.name).toLowerCase()) || null;

        const rawVal = reading?.rawValue !== undefined ? reading.rawValue : null;
        const engVal = reading?.engineeringValue !== undefined ? reading.engineeringValue : (reading?.value !== undefined ? reading.value : null);
        const status = reading?.limitStatus || reading?.status || "unknown";

        return {
          order: p.displayOrder ?? (idx + 1),
          name: p.name,
          parameterId: p.parameterId || pId || "—",
          description: p.description || "",
          byteOffset: p.byteOffset ?? 0,
          bitOffset: p.bitOffset,
          bitLength: p.bitLength,
          dataType: p.dataType || "UINT8",
          signed: p.signed,
          rawValue: rawVal,
          engineeringValue: engVal,
          unit: reading?.unit || p.unit || "—",
          status,
          statusLabel: reading?.statusLabel || null,
          statusRepresentation: p.statusRepresentation || reading?.statusRepresentation || null,
          precision: p.precision ?? null,
        };
      });
    }

    // Fallback: derive directly from packet readings, enriching with parameterDefMap if available
    return readings.map((r, idx) => {
      const paramDef = (r.parameterId && parameterDefMap.get(String(r.parameterId))) ||
                       (r.parameterName && parameterDefMap.get(String(r.parameterName).toLowerCase())) ||
                       null;
      return {
        order: idx + 1,
        name: r.parameterName || paramDef?.name || `Param_${idx + 1}`,
        parameterId: r.parameterId || paramDef?.parameterId || "—",
        description: paramDef?.description || "",
        byteOffset: r.byteOffset ?? paramDef?.byteOffset ?? (idx * 2),
        bitOffset: r.bitOffset ?? paramDef?.bitOffset ?? null,
        bitLength: r.bitLength ?? paramDef?.bitLength ?? null,
        dataType: r.dataType || paramDef?.dataType || "RAW",
        signed: r.signed ?? paramDef?.signed ?? false,
        rawValue: r.rawValue,
        engineeringValue: r.engineeringValue,
        unit: r.unit || paramDef?.unit || "—",
        status: r.limitStatus || r.status || "unknown",
        statusLabel: r.statusLabel || null,
        statusRepresentation: paramDef?.statusRepresentation || r.statusRepresentation || null,
        precision: paramDef?.precision ?? null,
      };
    });
  }, [viewMode, filteredRecords, currentPacket, activeFrameDefinition, parameterDefMap]);

  const criticalParameterCount = useMemo(
    () => displayedParameters.filter((parameter) => isCriticalStatus(parameter.status)).length,
    [displayedParameters]
  );

  // Overall Stats
  const stats = useMemo(() => {
    let normal = 0;
    let warning = 0;
    let alarm = 0;
    let readingsCount = 0;

    records.forEach((record) => {
      const readings = Array.isArray(record?.readings) ? record.readings : [];
      readingsCount += readings.length;
      readings.forEach((reading) => {
        const st = String(reading?.limitStatus || "unknown").toLowerCase();
        if (st === "normal" || st === "nominal" || st === "ok") normal += 1;
        else if (st === "warning" || st.includes("warn")) warning += 1;
        else if (st === "alarm" || st.includes("alarm") || st.includes("crit")) alarm += 1;
      });
    });

    return {
      frames: records.length,
      readings: readingsCount,
      normal,
      warning,
      alarm,
    };
  }, [records]);

  // Export CSV
  const handleExportCsv = async () => {
    if (!projectId) return;
    try {
      await telemetryService.downloadCsv(
        {
          projectId,
          frameName: selectedFrame !== "ALL" ? selectedFrame : undefined,
          subsystemCode: selectedSubsystem !== "ALL" ? selectedSubsystem : undefined,
        },
        `decoded_telemetry_${selectedFrame !== "ALL" ? selectedFrame : "all"}_${Date.now()}.csv`
      );
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* ─── Page Header ────────────────────────────────────────────── */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <Database size={22} className="text-info" />
            <h1 className="egse-heading h4 mb-0">Decoded Telemetry</h1>
          </div>
          <p className="small mb-0 text-muted">
            Mission parameters, engineering units & calibrated readings ·{" "}
            <strong className="text-light">{selectedProject?.name || "No Mission Selected"}</strong>
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          {projectId && (
            <Link
              to={`/project/${encodeURIComponent(projectId)}/telemetry`}
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              title="Go to telemetry file upload and decoding"
            >
              <FolderArchive size={15} />
              <span>Manage Files</span>
            </Link>
          )}

          <button
            type="button"
            className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            title="Export the current data table as CSV"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
            onClick={() => loadDecodedTelemetry(page)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "spinner-border spinner-border-sm" : ""} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ─── Top KPI Stat Cards ──────────────────────────────────────── */}
      <div className="row g-2">
        <div className="col-6 col-md-3">
          <div className="egse-panel p-3 d-flex align-items-center gap-3">
            <div
              className="p-2 rounded d-flex align-items-center justify-content-center"
              style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "var(--egse-raw)" }}
            >
              <Database size={20} />
            </div>
            <div>
              <div className="small text-muted text-uppercase fw-semibold" style={{ fontSize: "0.72rem" }}>
                Total Decoded Packets
              </div>
              <div className="fs-5 fw-bold font-monospace text-light">
                {pagination.total || stats.frames}
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="egse-panel p-3 d-flex align-items-center gap-3">
            <div
              className="p-2 rounded d-flex align-items-center justify-content-center"
              style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--egse-nominal)" }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="small text-muted text-uppercase fw-semibold" style={{ fontSize: "0.72rem" }}>
                Nominal Readings
              </div>
              <div className="fs-5 fw-bold font-monospace text-success">
                {stats.normal}
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="egse-panel p-3 d-flex align-items-center gap-3">
            <div
              className="p-2 rounded d-flex align-items-center justify-content-center"
              style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "var(--egse-warning)" }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="small text-muted text-uppercase fw-semibold" style={{ fontSize: "0.72rem" }}>
                Warning Readings
              </div>
              <div className="fs-5 fw-bold font-monospace text-warning">
                {stats.warning}
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="egse-panel p-3 d-flex align-items-center gap-3">
            <div
              className="p-2 rounded d-flex align-items-center justify-content-center"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--egse-alarm)" }}
            >
              <XCircle size={20} />
            </div>
            <div>
              <div className="small text-muted text-uppercase fw-semibold" style={{ fontSize: "0.72rem" }}>
                Alarm Readings
              </div>
              <div className="fs-5 fw-bold font-monospace text-danger">
                {stats.alarm}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── LEVEL 1: Subsystem Selector Pills ─────────────────────────── */}
      <div className="egse-panel p-3">
        <div className="d-flex flex-column gap-2">
          <div className="d-flex align-items-center justify-content-between">
            <label className="small text-uppercase tracking-wider fw-bold text-muted d-flex align-items-center gap-1 mb-0">
              <Cpu size={14} className="text-info" />
              <span>1. Filter Subsystem:</span>
            </label>
            <span className="small text-muted">
              {availableSubsystems.length} subsystem(s) available
            </span>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm d-inline-flex align-items-center gap-1 px-3 py-1 rounded ${
                selectedSubsystem === "ALL" ? "btn-info shadow-sm fw-bold text-dark" : "btn-egse-outline"
              }`}
              onClick={() => {
                setSelectedSubsystem("ALL");
                setSelectedFrame("ALL");
                setCurrentInstanceIdx(0);
              }}
            >
              <span>All Subsystems</span>
            </button>

            {availableSubsystems.map((sub) => {
              const key = sub.code || sub.name;
              const isSelected = selectedSubsystem === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded ${
                    isSelected ? "btn-info shadow-sm fw-bold text-dark" : "btn-egse-outline"
                  }`}
                  onClick={() => {
                    setSelectedSubsystem(key);
                    setSelectedFrame("ALL");
                    setCurrentInstanceIdx(0);
                  }}
                >
                  <Cpu size={14} />
                  <span>{sub.name || key}</span>
                  {sub.code && (
                    <span
                      className={`badge ${
                        isSelected ? "bg-dark text-info" : "bg-dark text-muted border border-secondary"
                      }`}
                      style={{ fontSize: "0.7rem" }}
                    >
                      0x{sub.code}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── LEVEL 2: Frame Selector Pills ───────────────────────────── */}
        <div className="d-flex flex-column gap-2 mt-3 pt-3 border-top border-secondary border-opacity-25">
          <div className="d-flex align-items-center justify-content-between">
            <label className="small text-uppercase tracking-wider fw-bold text-muted d-flex align-items-center gap-1 mb-0">
              <Layers size={14} className="text-info" />
              <span>2. Filter TLM Frame:</span>
            </label>
            <span className="small text-muted">
              {availableFrames.length} frame layout(s)
            </span>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm d-inline-flex align-items-center gap-1 px-3 py-1 rounded ${
                selectedFrame === "ALL" ? "btn-egse-primary shadow-sm fw-bold" : "btn-egse-outline"
              }`}
              onClick={() => {
                setSelectedFrame("ALL");
                setCurrentInstanceIdx(0);
              }}
            >
              <span>All Frames</span>
            </button>

            {availableFrames.map((fName) => {
              const isSelected = selectedFrame === fName;
              return (
                <button
                  key={fName}
                  type="button"
                  className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded ${
                    isSelected ? "btn-egse-primary shadow-sm fw-bold" : "btn-egse-outline"
                  }`}
                  onClick={() => {
                    setSelectedFrame(fName);
                    setCurrentInstanceIdx(0);
                  }}
                >
                  <Layers size={14} />
                  <span>{fName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── LEVEL 3: View Mode & Packet Scrubber ─────────────────────── */}
      <div
        className="p-3 rounded border"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          borderColor: "var(--egse-border-soft)",
        }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          {/* Packet Scrubber */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="small text-uppercase tracking-wider fw-bold text-muted me-1">
              3. Telemetry Packet Scrubber:
            </span>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline p-1 px-2"
              onClick={() => setCurrentInstanceIdx(0)}
              disabled={currentInstanceIdx <= 0 || filteredRecords.length === 0}
              title="First Packet"
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline p-1 px-2"
              onClick={() => setCurrentInstanceIdx((prev) => Math.max(0, prev - 1))}
              disabled={currentInstanceIdx <= 0 || filteredRecords.length === 0}
              title="Previous Packet"
            >
              <ChevronLeft size={16} />
            </button>

            <div
              className="px-3 py-1 rounded border font-monospace small"
              style={{
                backgroundColor: "var(--egse-bg-base)",
                borderColor: "var(--egse-border-soft)",
              }}
            >
              Packet <strong>{filteredRecords.length > 0 ? currentInstanceIdx + 1 : 0}</strong> of{" "}
              <strong>{filteredRecords.length}</strong>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline p-1 px-2"
              onClick={() => setCurrentInstanceIdx((prev) => Math.min(filteredRecords.length - 1, prev + 1))}
              disabled={currentInstanceIdx >= filteredRecords.length - 1 || filteredRecords.length === 0}
              title="Next Packet"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline p-1 px-2"
              onClick={() => setCurrentInstanceIdx(filteredRecords.length - 1)}
              disabled={currentInstanceIdx >= filteredRecords.length - 1 || filteredRecords.length === 0}
              title="Last Packet"
            >
              <ChevronsRight size={16} />
            </button>
          </div>

          {/* Active Packet Metadata Badges */}
          {currentPacket && (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="egse-chip egse-chip-neutral" style={{ fontSize: "0.75rem" }}>
                {currentPacket.protocol || "Generic"}
              </span>

              <span
                className={`badge ${
                  currentPacket.crcStatus === "OK"
                    ? "bg-success bg-opacity-20 text-success border border-success"
                    : currentPacket.crcStatus === "FAIL"
                    ? "bg-danger bg-opacity-20 text-danger border border-danger"
                    : "bg-secondary bg-opacity-20 text-muted"
                }`}
                style={{ fontSize: "0.75rem" }}
              >
                CRC: {currentPacket.crcStatus || "SKIPPED"}
              </span>

              <span className="badge bg-dark text-secondary border border-secondary font-monospace" style={{ fontSize: "0.75rem" }}>
                <Clock3 size={12} className="me-1" />
                {formatDate(currentPacket.frameTimestamp || currentPacket.timestamp)}
              </span>

              {currentPacket.sourceFile && (
                <span className="badge bg-dark text-info border border-info border-opacity-30 font-monospace" style={{ fontSize: "0.75rem" }}>
                  📁 {currentPacket.sourceFile}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Search & Status Filtering Toolbar ─────────────────────────── */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: "450px" }}>
          <div className="input-group input-group-sm">
            <span className="input-group-text egse-field border-end-0">
              <Search size={14} />
            </span>
            <input
              type="text"
              className="form-control egse-field border-start-0"
              placeholder="Search parameter by name, ID, or value..."
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

        {/* Status Filter Chips */}
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted">Status:</span>
          {["all", "nominal", "warning", "alarm"].map((st) => (
            <button
              key={st}
              type="button"
              className={`btn btn-sm py-1 px-2 text-uppercase ${
                statusFilter === st ? "btn-egse-primary shadow-sm" : "btn-egse-outline"
              }`}
              style={{ fontSize: "0.72rem" }}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ─── PARAMETERS TABLE (The Clean Table View) ──────────────────── */}
      <div className="egse-panel">
        <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <TableIcon size={16} className="text-info" />
            <h3 className="egse-panel-title mb-0 fs-6">
              Telemetry Parameters · Ordered by Sequence (displayOrder)
            </h3>
            {currentPacket && (
              <span className="badge bg-dark text-info border border-secondary">
                {currentPacket.frameName || currentPacket.frame?.name || "Frame"}
              </span>
            )}
          </div>

          <div className="small text-muted">
            Showing <strong>{displayedParameters.length}</strong> {viewMode === "all" ? "readings across all frames" : "parameters in this frame"}
          </div>
          <div className="d-flex gap-2">
            <button type="button" className={`btn btn-sm ${viewMode === "table" ? "btn-egse-primary" : "btn-egse-outline"}`} onClick={() => setViewMode("table")}>
              Current packet
            </button>
            <button type="button" className={`btn btn-sm ${viewMode === "all" ? "btn-egse-primary" : "btn-egse-outline"}`} onClick={() => { setSelectedFrame("ALL"); setCurrentInstanceIdx(0); setViewMode("all"); }}>
              All frames data
            </button>
          </div>
        </div>

        <div className="table-responsive" style={{ maxHeight: "650px", overflowY: "auto" }}>
          <table className="table egse-table table-sm table-hover align-middle mb-0">
            <thead className="sticky-top bg-dark">
              <tr>
                <th style={{ width: "65px" }} className="text-center"># Order</th>
                <th style={{ width: "26%" }}>Parameter Name & ID</th>
                <th style={{ width: "12%" }}>Binary Layout</th>
                <th style={{ width: "10%" }}>Data Type</th>
                <th style={{ width: "18%" }}>Raw Value</th>
                <th style={{ width: "18%" }}>Engineering Value</th>
                <th style={{ width: "8%" }}>Unit</th>
                <th style={{ width: "12%" }} className="text-center">
                  <span className="d-inline-flex align-items-center justify-content-center gap-2">
                    Status
                    <span
                      className="rounded-circle d-inline-flex align-items-center justify-content-center"
                      title={`${criticalParameterCount} critical parameter(s) in this packet`}
                      aria-label={`${criticalParameterCount} critical parameters`}
                      style={{ width: 20, height: 20, backgroundColor: criticalParameterCount ? "#dc3545" : "rgba(255,255,255,.14)", color: "#fff", fontSize: "0.7rem", lineHeight: 1 }}
                    >
                      {criticalParameterCount}
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedParameters.map((p) => {
                const bitInfo =
                  p.bitOffset !== null && p.bitOffset !== undefined && p.bitLength
                    ? `b:${p.bitOffset}..${p.bitOffset + p.bitLength - 1}`
                    : null;

                const isCritical = isCriticalStatus(p.status);
                return (
                  <tr key={p.parameterId || p.name} style={isCritical ? { backgroundColor: "rgba(220, 53, 69, 0.12)" } : undefined}>
                    {/* displayOrder badge */}
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
                        {p.order ?? "—"}
                      </span>
                    </td>

                    {/* Parameter Name & ID */}
                    <td>
                      <div className="fw-semibold text-light">{p.name}</div>
                      {viewMode === "all" && <div className="small text-info">{p.frameName} · {formatDate(p.timestamp)}</div>}
                      <div className="font-monospace text-muted" style={{ fontSize: "0.72rem" }}>
                        {p.parameterId}
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

                    {/* Binary Layout */}
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

                    {/* Data Type */}
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

                    {/* Raw Value */}
                    <td>
                      <span className="font-monospace text-secondary small d-inline-flex align-items-center gap-1 flex-wrap">
                        <span>
                          {formatRaw(p.rawValue)}
                        </span>
                        {p.precisionApproximated && (
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

                    {/* Engineering Value */}
                    <td>
                      {(() => {
                        const match = getStatusRepresentationMatch(p.engineeringValue, p.statusRepresentation);
                        const statusLabel = match?.status || p.statusLabel;
                        const statusDesc = match?.description || p.statusDescription;

                        if (statusLabel) {
                          const badgeClass = getStatusBadgeClass(statusLabel);
                          return (
                            <div className="d-inline-flex flex-column align-items-start gap-1">
                              <div className="d-inline-flex align-items-center gap-1 flex-wrap">
                                <span
                                  className={`${badgeClass} fw-bold`}
                                  style={{ fontSize: "0.82rem", padding: "3px 8px" }}
                                  title={`Status: ${statusLabel}${statusDesc ? ` · ${statusDesc}` : ""}\nEngineering value: ${formatEng(p.engineeringValue, p.precision)}`}
                                >
                                  {statusLabel}
                                </span>
                                <span
                                  className="font-monospace text-secondary small"
                                  style={{ fontSize: "0.75rem" }}
                                  title={`Original engineering value: ${formatEng(p.engineeringValue, p.precision)}`}
                                >
                                  ({formatEng(p.engineeringValue, p.precision)})
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
                              color: isCritical ? "#ff5c68" : p.engineeringValue !== null ? "var(--egse-raw)" : "var(--egse-text-muted)",
                              fontSize: "0.9rem",
                            }}
                          >
                            {formatEng(p.engineeringValue, p.precision)}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Unit */}
                    <td>
                      <span className="text-muted small">
                        {p.unit || "—"}
                      </span>
                    </td>

                    {/* Limit Status Badge */}
                    <td className="text-center">
                      {renderStatusDot(p.status)}
                    </td>
                  </tr>
                );
              })}

              {displayedParameters.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-5 text-muted small">
                    {filteredRecords.length === 0
                      ? "No decoded telemetry records found for this filter. Please upload a telemetry file or select another subsystem/frame."
                      : "No parameters match the current search or status filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
