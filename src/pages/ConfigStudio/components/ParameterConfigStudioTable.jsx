import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  FileCode,
  X,
} from "lucide-react";
import { validateSchema, skipCrcBytes } from "../../../utils/configValidation";
import ParameterEditModal from "./ParameterEditModal";
import { describeEncoding } from "./parameterTypeFields";
import {
  isBlank,
  paramHexId,
  endianLabel,
  newParameter,
  readStatusRanges,
  getStatusRangesPreview,
} from "./paramHelpers";

export function getDataTypeByteSize(dataType, fallbackLength = 1) {
  if (!dataType) return Number(fallbackLength) || 1;
  const dt = String(dataType).toLowerCase().trim();
  if (dt.includes("64") || dt === "double") return 8;
  if (dt.includes("32") || dt === "float") return 4;
  if (dt.includes("16")) return 2;
  if (dt.includes("8") || dt === "bool" || dt === "enum") return 1;
  return Number(fallbackLength) || 1;
}

export function computeNextFreeByteOffset(rows = []) {
  let highestOccupiedEnd = 0;
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r && r.byteOffset !== undefined && r.byteOffset !== null && r.byteOffset !== "") {
        const offset = Number(r.byteOffset);
        if (!isNaN(offset) && offset >= 0) {
          const size = getDataTypeByteSize(r.dataType, r.length ?? r.byteLength ?? 1);
          const end = offset + size;
          if (end > highestOccupiedEnd) {
            highestOccupiedEnd = end;
          }
        }
      }
    }
  }
  return highestOccupiedEnd;
}

const PAGE_SIZE = 12;

const typeLabel = (r) => String(r.dataType || "-").toUpperCase();

/** Limits bar under "Parameter Details": Min / Warning Low / Warning High / Max. */
function LimitsBlock({ row }) {
  const r = readStatusRanges(row);
  const warnLow = !isBlank(row.warnLow) ? row.warnLow : r.warning.min;
  const warnHigh = !isBlank(row.warnHigh) ? row.warnHigh : r.warning.max;
  const show = (v) => (isBlank(v) ? "–" : v);
  return (
    <>
      <div className="cs-limit-bar" />
      <div className="cs-limit-labels">
        <div>
          <span>Min</span>
          <b>{show(row.minValue)}</b>
        </div>
        <div>
          <span>Warning Low</span>
          <b>{show(warnLow)}</b>
        </div>
        <div>
          <span>Warning High</span>
          <b>{show(warnHigh)}</b>
        </div>
        <div>
          <span>Max</span>
          <b>{show(row.maxValue)}</b>
        </div>
      </div>
      <div className="cs-preview">
        {getStatusRangesPreview(row).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </>
  );
}

function Detail({ label, children }) {
  return (
    <div className="cs-kv">
      <small>{label}</small>
      <span className="v">{children}</span>
    </div>
  );
}

function readModalDraft(key) {
  if (!key) return null;
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export default function ParameterConfigStudioTable({
  rows = [],
  onChange,
  onSave = null,
  isSaving = false,
  frameName = "",
  subsystemName = "",
  draftStorageKey = "",
  dataRepresentation = "BYTE",
  frame = null,
  storedParams = [],
}) {
  const isBitMode = String(dataRepresentation).toUpperCase() === "BIT";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selIdx, setSelIdx] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [modal, setModal] = useState(() => readModalDraft(draftStorageKey)); // { row, index } ; index === -1 -> new parameter
  const [saveError, setSaveError] = useState(null);
  const [ioOpen, setIoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState({ format: true, limits: true });
  const fileRef = useRef(null);
  const handleModalDraftChange = useCallback((row) => {
    setModal((current) => current ? { ...current, row } : current);
  }, []);

  useEffect(() => {
    if (!draftStorageKey) return;
    try {
      if (modal) localStorage.setItem(draftStorageKey, JSON.stringify(modal));
      else localStorage.removeItem(draftStorageKey);
    } catch { /* The edit modal still works when storage is unavailable. */ }
  }, [draftStorageKey, modal]);

  const types = useMemo(() => [...new Set(rows.map(typeLabel))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        const enabled = row.enabled !== false;
        if (statusFilter === "enabled" && !enabled) return false;
        if (statusFilter === "disabled" && enabled) return false;
        if (typeFilter !== "all" && typeLabel(row) !== typeFilter) return false;
        if (!q) return true;
        return (
          String(row.name || "").toLowerCase().includes(q) ||
          String(row.unit || "").toLowerCase().includes(q) ||
          typeLabel(row).toLowerCase().includes(q) ||
          paramHexId(row, idx).toLowerCase().includes(q) ||
          `${row.byteOffset ?? ""}/${row.bitOffset ?? ""}`.includes(q)
        );
      });
  }, [rows, search, typeFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    if (selIdx > rows.length - 1) {
      setSelIdx(Math.max(0, rows.length - 1));
    }
  }, [rows.length, selIdx]);

  const selected = rows[selIdx] || rows[0];
  const touch = () => saveError && setSaveError(null);

  // ----- row actions -----
  const openAdd = () => {
    const param = newParameter();
    if (isBitMode) {
      let maxBitEnd = 0;
      for (const r of rows) {
        if (r && r.bitOffset !== undefined && r.bitOffset !== null && r.bitOffset !== "") {
          const off = Number(r.bitOffset);
          const len = Number(r.bitLength) || 8;
          if (!isNaN(off) && off >= 0) {
            maxBitEnd = Math.max(maxBitEnd, off + len);
          }
        }
      }
      param.bitOffset = maxBitEnd;
      param.bitLength = 8;
      param.byteOffset = Math.floor(maxBitEnd / 8);
      param.length = 1;
    } else {
      // The next free offset, moved past the CRC bytes when it would land on them.
      param.byteOffset = skipCrcBytes(computeNextFreeByteOffset(rows), param.length || 1, frame);
    }
    setModal({ row: param, index: -1 });
  };

  const openEdit = (idx) => setModal({ row: rows[idx], index: idx });

  const applyModal = (draft) => {
    touch();
    if (modal.index === -1) {
      setSearch("");
      setTypeFilter("all");
      setStatusFilter("all");
      setPage(1);
      onChange([draft, ...rows]);
      setSelIdx(0);
    } else {
      onChange(rows.map((r, i) => (i === modal.index ? draft : r)));
    }
    setModal(null);
  };

  const deleteRow = (idx) => {
    if (rows.length <= 1) {
      alert("A frame must contain at least one parameter. Cannot delete the only remaining parameter.");
      return;
    }
    if (!window.confirm(`Delete parameter "${rows[idx]?.name || idx + 1}"?`)) return;
    touch();
    onChange(rows.filter((_, i) => i !== idx));
  };

  const duplicateRow = (idx) => {
    touch();
    const src = rows[idx];
    const { _id, id, ...rest } = src; // fresh identity for the copy
    let copy;
    if (isBitMode) {
      let maxBitEnd = 0;
      for (const r of rows) {
        if (r && r.bitOffset !== undefined && r.bitOffset !== null && r.bitOffset !== "") {
          const off = Number(r.bitOffset);
          const len = Number(r.bitLength) || 8;
          if (!isNaN(off) && off >= 0) {
            maxBitEnd = Math.max(maxBitEnd, off + len);
          }
        }
      }
      copy = {
        ...rest,
        name: `${src.name}_copy`,
        bitOffset: maxBitEnd,
        bitLength: src.bitLength ?? 8,
        byteOffset: Math.floor(maxBitEnd / 8),
      };
    } else {
      const nextOffset = computeNextFreeByteOffset(rows);
      copy = { ...rest, name: `${src.name}_copy`, byteOffset: nextOffset };
    }
    const next = [...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)];
    onChange(next);
    setSelIdx(idx + 1);
  };

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(selected?.name || "");
    } catch {
      /* clipboard unavailable */
    }
  };

  // ----- import / export (frame parameters as JSON) -----
  const exportJson = () => {
    setIoOpen(false);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(frameName || "frame").replace(/[^a-zA-Z0-9_-]/g, "_")}_parameters.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setIoOpen(false);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.parameters;
      if (!Array.isArray(list)) throw new Error("File must contain an array of parameters.");
      const byName = new Map(rows.map((r, i) => [r.name, i]));
      const next = [...rows];
      list.forEach((p) => {
        if (!p || !p.name) return;
        if (byName.has(p.name)) next[byName.get(p.name)] = { ...next[byName.get(p.name)], ...p };
        else next.push(p);
      });
      touch();
      onChange(next);
    } catch (err) {
      setSaveError(`Import failed: ${err.message}`);
    }
  };

  const handleSaveClick = () => {
    const result = validateSchema(rows, { dataRepresentation, frame, storedParams });
    if (!result.valid) {
      setSaveError(result.errors.join("; "));
      return;
    }
    setSaveError(null);
    onSave?.();
  };

  const from = filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);
  const pageButtons = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - safePage) <= 2
  );

  return (
    <div className={`cs-layout ${showDetails && selected ? "has-details" : ""}`}>
      {/* ===== Table card ===== */}
      <div className="cs-card" style={{ minWidth: 0 }}>
        <div className="cs-toolbar">
          <div className="cs-search">
            <Search size={14} />
            <input
              className="cs-input"
              placeholder="Search parameter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="cs-field"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="all">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="cs-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <div style={{ flex: 1 }} />
          <button type="button" className="cs-btn primary" onClick={openAdd}>
            <Plus size={15} /> Add Parameter
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="cs-btn"
              aria-label="Transfer Parameters Data"
              onClick={() => setIoOpen((o) => !o)}
            >
              <Upload size={14} /> Import / Export <ChevronDown size={13} />
            </button>
            {ioOpen && (
              <div
                className="cs-card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  zIndex: 20,
                  minWidth: 190,
                  padding: ".3rem",
                }}
              >
                <button
                  type="button"
                  className="cs-btn"
                  style={{ width: "100%", border: 0 }}
                  onClick={() => fileRef.current?.click()}
                >
                  Import parameters (JSON)
                </button>
                <button
                  type="button"
                  className="cs-btn"
                  style={{ width: "100%", border: 0 }}
                  onClick={exportJson}
                  disabled={!rows.length}
                >
                  Export parameters (JSON)
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={importJson}
            />
          </div>
          {onSave && (
            <button
              type="button"
              className="cs-btn"
              style={{ borderColor: "#2fd27a", color: "#2fd27a" }}
              onClick={handleSaveClick}
              disabled={isSaving}
              aria-label="Save Frame Configuration"
              title="Save Frame"
            >
              <Save size={14} /> {isSaving ? "Saving..." : "Save Frame"}
            </button>
          )}
        </div>

        {saveError && (
          <div
            className="cs-notice alarm"
            style={{
              margin: "0 .85rem .8rem",
              display: "flex",
              justifyContent: "space-between",
              alignSelf: "stretch",
            }}
          >
            <span>⚠️ {saveError}</span>
            <button type="button" className="cs-icon-btn" onClick={() => setSaveError(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        <div className="cs-table-wrap">
          <table className="cs-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Parameter Name</th>
                <th>ID</th>
                <th>{isBitMode ? "Bit Offset" : "Byte/Bit"}</th>
                <th>{isBitMode ? "Bit Length" : "Length"}</th>
                <th>Type</th>
                <th>Unit</th>
                <th>Scale</th>
                <th>Offset</th>
                <th>Status</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ row, idx }) => {
                const enabled = row.enabled !== false;
                const isSelected = selected && (selected._id ? selected._id === row._id : selected.name === row.name);
                return (
                  <tr
                    key={idx}
                    className={isSelected ? "sel" : ""}
                    onClick={() => { setSelIdx(idx); setShowDetails(true); }}
                  >
                    <td>{idx + 1}</td>
                    <td className="cs-mono">
                      <div className="d-flex align-items-center gap-1">
                        <span>{row.name}</span>
                        {Array.isArray(row.statusRepresentation) && row.statusRepresentation.length > 0 && (
                          <span
                            className="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30"
                            style={{ fontSize: "0.65rem", padding: "1px 4px", fontWeight: "normal" }}
                            title={row.statusRepresentation.map(s => `${s.rawValue} → ${s.status}`).join(', ')}
                          >
                            {row.statusRepresentation.length} status{row.statusRepresentation.length > 1 ? 'es' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="cs-mono">{paramHexId(row, idx)}</td>
                    <td className="cs-mono">
                      {isBitMode
                        ? `bit ${row.bitOffset ?? 0} (byte ${row.byteOffset ?? Math.floor((row.bitOffset ?? 0) / 8)})`
                        : `${row.byteOffset ?? 0} / ${row.bitOffset ?? 0}`}
                    </td>
                    <td>
                      {isBitMode
                        ? `${row.bitLength ?? ((row.length ?? 1) * 8)} bits`
                        : (row.length ?? "-")}
                    </td>
                    <td className="cs-mono">{typeLabel(row)}</td>
                    <td>{row.unit || "-"}</td>
                    <td>{isBlank(row.scale) ? "-" : row.scale}</td>
                    <td>{isBlank(row.offset) ? "-" : row.offset}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`cs-badge ${enabled ? "ok" : "off"}`}
                        style={{ border: "none", cursor: "pointer" }}
                        title={enabled ? "Click to disable" : "Click to enable"}
                        onClick={() => {
                          const next = rows.map((r, i) =>
                            i === idx ? { ...r, enabled: !enabled } : r
                          );
                          onChange(next);
                        }}
                      >
                        {enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="cs-icon-btn"
                        title="Edit parameter"
                        onClick={() => openEdit(idx)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className={`cs-icon-btn del ${rows.length <= 1 ? "disabled opacity-40 cursor-not-allowed" : ""}`}
                        title={rows.length <= 1 ? "Cannot delete the last parameter (minimum 1 parameter required)" : "Delete parameter"}
                        disabled={rows.length <= 1}
                        onClick={() => deleteRow(idx)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="cs-empty">
              <FileCode size={28} style={{ opacity: 0.5 }} />
              <div style={{ margin: ".5rem 0 .8rem" }}>No parameters defined for this frame.</div>
              <button type="button" className="cs-btn primary" onClick={openAdd}>
                <Plus size={14} /> Add First Parameter
              </button>
            </div>
          )}
          {rows.length > 0 && filtered.length === 0 && (
            <div className="cs-empty">
              No parameters match these filters.{" "}
              <button
                type="button"
                className="cs-btn sm"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <div className="cs-foot">
          <span>
            Showing {from}–{to} of {filtered.length} parameters
            {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
          </span>
          <div className="cs-pager">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {pageButtons.map((p, i) => (
              <span key={p} style={{ display: "contents" }}>
                {i > 0 && p - pageButtons[i - 1] > 1 && (
                  <span style={{ alignSelf: "center" }}>…</span>
                )}
                <button
                  type="button"
                  className={p === safePage ? "on" : ""}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              </span>
            ))}
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Parameter Details panel ===== */}
      {showDetails && selected && <aside className="cs-card cs-details">
        <h4>Parameter Details</h4>
        {!selected ? (
          <div className="cs-empty" style={{ padding: "2rem 0" }}>
            Select a parameter to see its details.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                gap: ".5rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 600, wordBreak: "break-all" }}>
                  {selected.name}
                </div>
                <small style={{ color: "var(--cs-muted)" }}>{selected.description || "—"}</small>
              </div>
              <div style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                <span className={`cs-badge ${selected.enabled !== false ? "ok" : "off"}`}>
                  {selected.enabled !== false ? "Enabled" : "Disabled"}
                </span>
                <button
                  type="button"
                  className="cs-icon-btn"
                  title="Copy name"
                  onClick={copyName}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div className="grid2" style={{ marginTop: "1rem" }}>
              <Detail label="ID">
                <span className="cs-mono">{paramHexId(selected, selIdx)}</span>
              </Detail>
              <Detail label="Subsystem">{subsystemName || "-"}</Detail>
              <Detail label="Radix">
                {selected.radix || (typeLabel(selected).includes("HEX") ? "Hex" : "—")}
              </Detail>
              <Detail label={isBitMode ? "Bit Offset" : "Byte / Bit"}>
                <span className="cs-mono">
                  {isBitMode
                    ? `bit ${selected.bitOffset ?? 0} (byte ${selected.byteOffset ?? Math.floor((selected.bitOffset ?? 0) / 8)})`
                    : `${selected.byteOffset ?? 0} / ${selected.bitOffset ?? 0}`}
                </span>
              </Detail>
              <Detail label="Frame">{frameName || "-"}</Detail>
              <Detail label="Type">
                <span className="cs-mono">{typeLabel(selected)}</span>
              </Detail>
              <Detail label={isBitMode ? "Bit Length" : "Length"}>
                {isBitMode
                  ? `${selected.bitLength ?? ((selected.length ?? 1) * 8)} bits`
                  : `${selected.length ?? "-"} ${Number(selected.length) === 1 ? "byte" : "bytes"}`}
              </Detail>
              <Detail label="Scale">{isBlank(selected.scale) ? "-" : selected.scale}</Detail>
              <Detail label="Unit">{selected.unit || "-"}</Detail>
              <Detail label="Min Limit">{isBlank(selected.minValue) ? "0" : selected.minValue}</Detail>
              <Detail label="Offset">{isBlank(selected.offset) ? "-" : selected.offset}</Detail>
              <Detail label="Max Limit">{isBlank(selected.maxValue) ? "—" : selected.maxValue}</Detail>
            </div>

            <h5
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}
              onClick={() => setDetailsOpen((d) => ({ ...d, format: !d.format }))}
            >
              Data Format{" "}
              <ChevronDown
                size={14}
                style={{ transform: detailsOpen.format ? "none" : "rotate(-90deg)" }}
              />
            </h5>
            {detailsOpen.format && (
              <div className="grid2">
                <Detail label="Signed / Unsigned">
                  {{ signed: "Signed", unsigned: "Unsigned" }[describeEncoding(selected).signedness] || "-"}
                </Detail>
                <Detail label="Endianness">{endianLabel(describeEncoding(selected).byteOrder)}</Detail>
              </div>
            )}

            <h5
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onClick={() => setDetailsOpen((d) => ({ ...d, limits: !d.limits }))}
            >
              <span>Limits</span>
              <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                <span
                  className="cs-badge"
                  style={{
                    fontSize: ".68rem",
                    padding: ".12rem .45rem",
                    background: (selected.statusRanges || selected.limits?.statusRanges)
                      ? "rgba(6, 182, 212, 0.12)"
                      : "rgba(245, 158, 11, 0.12)",
                    color: (selected.statusRanges || selected.limits?.statusRanges)
                      ? "#06b6d4"
                      : "#f59e0b",
                  }}
                >
                  {(selected.statusRanges || selected.limits?.statusRanges) ? "Status Ranges" : "Legacy"}
                </span>
                <ChevronDown
                  size={14}
                  style={{ transform: detailsOpen.limits ? "none" : "rotate(-90deg)" }}
                />
              </div>
            </h5>
            {detailsOpen.limits && (
              <>
                <LimitsBlock row={selected} />
                <div style={{ marginTop: ".6rem", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="cs-btn sm outline-blue"
                    style={{ fontSize: ".72rem", padding: ".22rem .55rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const isRanges = Boolean(selected.statusRanges || selected.limits?.statusRanges);
                      let nextSelected;
                      if (isRanges) {
                        const nextLimits = { ...(selected.limits || {}) };
                        delete nextLimits.statusRanges;
                        nextSelected = {
                          ...selected,
                          statusRanges: null,
                          limits: nextLimits,
                        };
                      } else {
                        const initialSR = {
                          normal: { min: "", max: "" },
                          critical: { min: "", max: "" },
                          warning: { min: "", max: "" },
                        };
                        nextSelected = {
                          ...selected,
                          statusRanges: initialSR,
                          limits: { ...(selected.limits || {}), statusRanges: initialSR },
                        };
                      }
                      const next = rows.map((r, i) => (i === selIdx ? nextSelected : r));
                      onChange(next);
                    }}
                  >
                    {(selected.statusRanges || selected.limits?.statusRanges)
                      ? "⚡ Switch to Legacy Thresholds"
                      : "⚡ Switch to Status Ranges"}
                  </button>
                </div>
              </>
            )}

            {Array.isArray(selected.statusRepresentation) && selected.statusRepresentation.length > 0 && (
              <>
                <h5 style={{ marginTop: "1rem" }}>
                  <span>Status Representation</span>
                  <span
                    className="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30 ms-2"
                    style={{ fontSize: "0.68rem", padding: "1px 5px", fontWeight: "normal" }}
                  >
                    {selected.statusRepresentation.length} mapped
                  </span>
                </h5>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", marginBottom: "0.8rem" }}>
                  {selected.statusRepresentation.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.25rem 0.5rem",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "4px",
                      }}
                    >
                      <span className="cs-mono" style={{ color: "#38bdf8", fontWeight: 600 }}>{item.rawValue}</span>
                      <span className="badge bg-primary bg-opacity-20 text-primary border border-primary border-opacity-30" style={{ fontSize: "0.7rem" }}>
                        {item.status}
                      </span>
                      {item.description && (
                        <span style={{ color: "var(--cs-muted)", fontSize: "0.7rem", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>
                          {item.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <h5>Quick Actions</h5>
            <div className="cs-quick">
              <button
                type="button"
                className="cs-btn outline-blue"
                onClick={() => openEdit(selIdx)}
              >
                <Pencil size={13} /> Edit Parameter
              </button>
              <button
                type="button"
                className="cs-btn outline-blue"
                onClick={() => duplicateRow(selIdx)}
              >
                <Copy size={13} /> Duplicate
              </button>
              <button
                type="button"
                className={`cs-btn danger ${rows.length <= 1 ? "disabled opacity-40 cursor-not-allowed" : ""}`}
                title={rows.length <= 1 ? "Cannot delete the last parameter (minimum 1 parameter required)" : "Delete parameter"}
                disabled={rows.length <= 1}
                onClick={() => deleteRow(selIdx)}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}
      </aside>}

      {modal && (
        <ParameterEditModal
          row={modal.row}
          isNew={modal.index === -1}
          onDraftChange={handleModalDraftChange}
          onSave={applyModal}
          onClose={() => setModal(null)}
          dataRepresentation={dataRepresentation}
        />
      )}
    </div>
  );
}
