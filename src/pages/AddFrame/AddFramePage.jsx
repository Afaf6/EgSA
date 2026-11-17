import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
  createFrameWithParameters,
  deleteFrame,
  createSubsystem,
} from "../../redux/slices/projectsSlice";
import { validateSchema } from "../../utils/configValidation";
import ParameterSchemaTable from "../ConfigStudio/components/ParameterSchemaTable";
import FrameHeaderForm from "./components/FrameHeaderForm";
import { confirmFrameDelete } from "../../utils/deleteConfirmation";
import SavedFramesList from "./components/SavedFramesList";
import configService from "../../services/configService";

const EMPTY_HEADER = {
  frameName: "",
  protocol: "Generic",
  dataRepresentation: "BYTE",
  bitNumbering: "LSB-0",
  trailerLength: 0,
  payloadBaseOffset: "",
  frameLength: "",
  headerLength: "",
  headerOffset: "",
  delimiterOffset: "",
  headerPattern: "",
  delimiterPattern: "",
  hasCrc: true,
  crc: {
    algorithm: "CRC-8",
    width: 8,
    length: 1,
    polynomial: 0x07,
    init: 0x00,
    refIn: false,
    refOut: false,
    xorOut: 0x00,
    endianness: null,
    coverageSemantics: "inclusive",
  },
  timestamp: null,
};

export default function AddFramePage() {
  const dispatch = useDispatch();
  const selectedProject = useSelector(selectSelectedProject);
  const frames = useSelector(selectSelectedProjectFrames);

  const [header, setHeader] = useState(EMPTY_HEADER);
  const [rows, setRows] = useState([]);
  const [subsystem, setSubsystem] = useState("");
  const [newSubsystem, setNewSubsystem] = useState("");
  const [newSubsystemCode, setNewSubsystemCode] = useState("");
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [availableProtocols, setAvailableProtocols] = useState(["Generic"]);

  useEffect(() => {
    let isMounted = true;
    configService.getProtocols().then((res) => {
      if (!isMounted) return;
      const list = Array.isArray(res) ? res : res?.protocols || [];
      if (list.length > 0) setAvailableProtocols(list);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);
  const [draftProjectId, setDraftProjectId] = useState("");

  const draftKey = selectedProject?.id ? `add-frame-draft:${selectedProject.id}` : "";

  useEffect(() => {
    if (!draftKey) return;
    let draft = null;
    try {
      const raw = localStorage.getItem(draftKey);
      draft = raw ? JSON.parse(raw) : null;
    } catch { /* Ignore invalid or unavailable local drafts. */ }
    const baseHeader = draft?.header
      ? {
          ...EMPTY_HEADER,
          ...draft.header,
          crc: draft.header.crc || EMPTY_HEADER.crc,
          hasCrc: draft.header.hasCrc !== undefined ? draft.header.hasCrc : true,
          dataRepresentation: draft.header.dataRepresentation || EMPTY_HEADER.dataRepresentation,
          bitNumbering: draft.header.bitNumbering || EMPTY_HEADER.bitNumbering,
          trailerLength: draft.header.trailerLength !== undefined ? draft.header.trailerLength : EMPTY_HEADER.trailerLength,
        }
      : EMPTY_HEADER;
    setHeader(baseHeader);
    setRows(Array.isArray(draft?.rows) ? draft.rows : []);
    setSubsystem(draft?.subsystem || "");
    setNewSubsystem(draft?.newSubsystem || "");
    setNewSubsystemCode(draft?.newSubsystemCode || "");
    setDraftProjectId(selectedProject.id);
  }, [draftKey, selectedProject?.id]);

  useEffect(() => {
    if (!draftKey || draftProjectId !== selectedProject?.id) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ header, rows, subsystem, newSubsystem, newSubsystemCode }));
    } catch { /* Drafts remain available in memory when storage is unavailable. */ }
  }, [draftKey, draftProjectId, selectedProject?.id, header, rows, subsystem, newSubsystem, newSubsystemCode]);

  const projectFrames = frames.filter((f) => f.projectId === selectedProject?.id);

  const updateHeader = (key, value) => {
    if (typeof key === "object" && key !== null) {
      setHeader((h) => ({ ...h, ...key }));
    } else {
      setHeader((h) => ({ ...h, [key]: value }));
    }
    setSaved(false);
  };


  const handleAddSubsystem = async () => {
    if (!selectedProject?.id || !newSubsystem.trim()) return;
    const clean = newSubsystem.trim();
    const cleanCode = newSubsystemCode.trim().toUpperCase();
    if (!cleanCode || !/^[0-9A-F]{4}$/i.test(cleanCode)) {
      setErrors(["Subsystem code must be a 4-character hex string (e.g., 0A01)."]);
      return;
    }
    try {
      const res = await dispatch(createSubsystem({
        projectId: selectedProject.id,
        data: { name: clean, subsystemCode: cleanCode, protocol: selectedProject.protocol || 'Generic' },
      })).unwrap();
      setSubsystem(res?.name || clean);
      setNewSubsystem("");
      setNewSubsystemCode("");
      setErrors([]);
    } catch (err) {
      setErrors([err || "Failed to create subsystem"]);
    }
  };

  const handleSave = async () => {
    const problems = [];
    if (!header.frameName.trim()) problems.push("Frame name is required.");
    const cleanHeaderPattern = (header.headerPattern || "").replace(/\s+/g, "").toUpperCase();
    if (cleanHeaderPattern.length < 2 || cleanHeaderPattern.length % 2 !== 0 || !/^[0-9A-F]+$/.test(cleanHeaderPattern)) {
      problems.push("Recognition header is required and must be an even-length hex string (e.g. AABBCCDD).");
    }
    if (header.payloadBaseOffset === "" || header.payloadBaseOffset === undefined || isNaN(Number(header.payloadBaseOffset))) {
      problems.push("Payload base offset is required and must be a number.");
    }
    if (rows.length === 0) problems.push("Add at least one parameter.");
    if (!subsystem) problems.push("Choose the subsystem this frame belongs to.");
    problems.push(...validateSchema(rows, { dataRepresentation: header.dataRepresentation || "BYTE" }).errors);

    setErrors(problems);
    setSaved(false);
    if (problems.length) return;

    const transformedParameters = rows.map((r) => {
      const {
        warnLow,
        warnHigh,
        alarmLow,
        alarmHigh,
        normalMin,
        normalMax,
        criticalMin,
        criticalMax,
        warningMin,
        warningMax,
        _origIdx,
        statusRanges,
        id: _rowId,
        _id: _rawId,
        ...rest
      } = r;

      const sr = statusRanges || {
        normal: { min: normalMin ?? r.normalMin, max: normalMax ?? r.normalMax },
        critical: { min: criticalMin ?? r.criticalMin, max: criticalMax ?? r.criticalMax },
        warning: { min: warningMin ?? r.warningMin, max: warningMax ?? r.warningMax },
      };

      const hasSR =
        (sr.normal && (sr.normal.min !== "" && sr.normal.min != null || sr.normal.max !== "" && sr.normal.max != null)) ||
        (sr.critical && (sr.critical.min !== "" && sr.critical.min != null || sr.critical.max !== "" && sr.critical.max != null)) ||
        (sr.warning && (sr.warning.min !== "" && sr.warning.min != null || sr.warning.max !== "" && sr.warning.max != null));

      let formattedStatusRanges = null;
      if (hasSR) {
        formattedStatusRanges = {
          normal: {
            min: sr.normal?.min !== "" && sr.normal?.min != null && !isNaN(sr.normal.min) ? Number(sr.normal.min) : null,
            max: sr.normal?.max !== "" && sr.normal?.max != null && !isNaN(sr.normal.max) ? Number(sr.normal.max) : null,
          },
          critical: {
            min: sr.critical?.min !== "" && sr.critical?.min != null && !isNaN(sr.critical.min) ? Number(sr.critical.min) : null,
            max: sr.critical?.max !== "" && sr.critical?.max != null && !isNaN(sr.critical.max) ? Number(sr.critical.max) : null,
          },
          warning: {
            min: sr.warning?.min !== "" && sr.warning?.min != null && !isNaN(sr.warning.min) ? Number(sr.warning.min) : null,
            max: sr.warning?.max !== "" && sr.warning?.max != null && !isNaN(sr.warning.max) ? Number(sr.warning.max) : null,
          },
        };
      }

      const toNumOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
      const isSigned = r.signed === "signed" || r.signed === true;
      // The decoder applies an endianness override and then flips it when byteSwap is set, so
      // byteSwap must never be derived from the chosen order (that used to read "LE" as BE).
      // Byte order lives in the data type suffix; an explicit override is kept only if set.
      const isByteSwap = r.byteSwap === true || r.byteSwap === "true";
      const rawEndian = String(r.endianness ?? "").trim().toUpperCase().replace(/[-_ ]/g, "");
      const endianness = rawEndian === "BE" || rawEndian === "BIGENDIAN" ? "BE"
        : (rawEndian === "LE" || rawEndian === "LITTLEENDIAN" ? "LE" : null);

      const isBitMode = String(header.dataRepresentation || "BYTE").toUpperCase() === "BIT";
      const bitOffset = r.bitOffset !== "" && r.bitOffset !== null && r.bitOffset !== undefined ? Number(r.bitOffset) : (isBitMode ? 0 : null);
      const bitLength = r.bitLength !== "" && r.bitLength !== null && r.bitLength !== undefined ? Number(r.bitLength) : (isBitMode ? 8 : null);

      return {
        ...rest,
        bitOffset,
        bitLength,
        ...(isBitMode ? {
          bitOffset,
          bitLength,
          byteOffset: r.byteOffset !== "" && r.byteOffset !== null && r.byteOffset !== undefined ? Number(r.byteOffset) : Math.floor(bitOffset / 8),
          length: r.length !== "" && r.length !== null && r.length !== undefined ? Number(r.length) : Math.ceil(((bitOffset % 8) + bitLength) / 8),
        } : {}),
        signed: isSigned,
        byteSwap: isByteSwap,
        endianness,
        enabled: r.enabled !== false,
        minValue: toNumOrNull(r.minValue),
        maxValue: toNumOrNull(r.maxValue),
        limits: {
          warningLow: warnLow !== "" && warnLow !== null && !isNaN(warnLow) ? Number(warnLow) : null,
          warningHigh: warnHigh !== "" && warnHigh !== null && !isNaN(warnHigh) ? Number(warnHigh) : null,
          alarmLow: alarmLow !== "" && alarmLow !== null && !isNaN(alarmLow) ? Number(alarmLow) : null,
          alarmHigh: alarmHigh !== "" && alarmHigh !== null && !isNaN(alarmHigh) ? Number(alarmHigh) : null,
          ...(formattedStatusRanges ? { statusRanges: formattedStatusRanges } : {}),
        },
      };
    });

    try {
      const subObj = selectedProject?.rawSubsystems?.find(
        (s) => s.name === subsystem || s.subsystemCode === subsystem || (s._id || s.id) === subsystem
      );
      const subId = subObj?._id || subObj?.id;
      if (!subId) {
        throw new Error(`Subsystem "${subsystem}" was not found or has no valid ID.`);
      }

      // ========================================================
      // Create frame
      // ========================================================

      await dispatch(
        createFrameWithParameters({
          projectId: selectedProject.id,

          subsystemId: subId,

          frame: {
            name: header.frameName.trim(),
            protocol: header.protocol?.trim() || undefined,
            dataRepresentation: header.dataRepresentation || "BYTE",
            bitNumbering: header.dataRepresentation === "BIT" ? (header.bitNumbering || "LSB-0") : undefined,
            trailerLength: header.trailerLength !== "" && header.trailerLength !== undefined && !isNaN(Number(header.trailerLength)) ? Number(header.trailerLength) : 0,
            searchHeader: header.headerPattern?.trim() || undefined,
            headerLength: header.headerLength !== "" && header.headerLength !== undefined && !isNaN(Number(header.headerLength)) ? Number(header.headerLength) : undefined,
            headerOffset: header.headerOffset !== "" && header.headerOffset !== undefined && !isNaN(Number(header.headerOffset)) ? Number(header.headerOffset) : undefined,
            payloadDelimiter: header.delimiterPattern?.trim() ? header.delimiterPattern.replace(/\s+/g, '').toUpperCase() : undefined,
            delimiterSearchFrom: header.delimiterOffset !== "" && header.delimiterOffset !== undefined && !isNaN(Number(header.delimiterOffset)) ? Number(header.delimiterOffset) : undefined,
            payloadBaseOffset:
              Number(
                header.payloadBaseOffset
              ),
            totalFrameLength:
              header.frameLength !== ""
                ? Number(
                    header.frameLength
                  )
                : undefined,
            hasCrc: header.hasCrc !== false,
            crc: header.hasCrc !== false ? header.crc : { enabled: false, algorithm: "none" },
            ...(header.timestamp && header.timestamp.enabled !== false ? {
              timestamp: {
                offset: Number(header.timestamp.offset),
                length: Number(header.timestamp.length || 4),
                endianness: String(header.timestamp.endianness || "LE").toUpperCase(),
                unit: String(header.timestamp.unit || "s").toLowerCase(),
                epoch: header.timestamp.epoch || "unix",
              }
            } : {}),
          },

          parameters:
            transformedParameters,
        })
      ).unwrap();

      setHeader({ ...EMPTY_HEADER });
      setRows([]);
      setErrors([]);
      setSaved(true);
      try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
    } catch (error) {
      setErrors([typeof error === "string" ? error : error?.message || "Failed to save frame."]);
    }
  };

  return (
    <div className="egse-page">
      <div className="mb-3">
        <p className="text-muted mb-0">
          Define a TLM frame for{" "}
          <strong>
            {selectedProject?.name ||
              "Selected Project"}
          </strong>
          . File import is handled from Config Studio.
        </p>
      </div>

      <div className="d-flex flex-column gap-3">

        {/* STEP 1 - Frame header */}
        <FrameHeaderForm values={header} onChange={updateHeader} availableProtocols={availableProtocols} />

        {/* ====================================================
            STEP 2 - Parameters
        ==================================================== */}

        <div>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="egse-heading h6 mb-0" style={{ color: "var(--egse-text-secondary)" }}>
              2 · Parameters
            </h2>
          </div>
          <div className="row g-3">
            <div className="col-12">
              <ParameterSchemaTable rows={rows} onChange={(next) => { setRows(next); setSaved(false); }} dataRepresentation={header.dataRepresentation || "BYTE"} />
            </div>
          </div>
        </div>

        <div className="egse-panel">
          <div className="egse-panel-header">
            <h3 className="egse-panel-title">3 · Assign to Subsystem & Save</h3>
          </div>
          <div className="egse-panel-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
                  Subsystem
                </label>
                <select className="form-select egse-field" value={subsystem} onChange={(e) => setSubsystem(e.target.value)}>
                  <option value="">Select subsystem…</option>
                  {(selectedProject?.subsystems || []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-5">
                <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
                  Not in the list? Add a subsystem (Name & 4-Hex Code)
                </label>
                <div className="d-flex gap-2">
                  <input
                    className="form-control egse-field"
                    placeholder="Name (e.g. COMM)"
                    value={newSubsystem}
                    onChange={(e) => setNewSubsystem(e.target.value)}
                  />
                  <input
                    className="form-control egse-field egse-mono"
                    style={{ maxWidth: "100px" }}
                    maxLength={4}
                    placeholder="Hex"
                    value={newSubsystemCode}
                    onChange={(e) => setNewSubsystemCode(e.target.value)}
                  />
                  <button type="button" className="btn btn-egse-outline" onClick={handleAddSubsystem} disabled={!newSubsystem.trim() || !newSubsystemCode.trim()}>
                    Add
                  </button>
                </div>
              </div>
              <div className="col-md-3">
                <button className="btn btn-egse-primary w-100" onClick={handleSave}>
                  💾 Save Frame
                </button>
              </div>
            </div>

            {saved && <div className="egse-chip egse-chip-nominal mt-3">✅ Frame saved — it now appears in Live Telemetry for its subsystem.</div>}
            {errors.length > 0 && (
              <div className="small mt-3 d-flex flex-column gap-1" style={{ color: "var(--egse-alarm)" }}>
                {errors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <SavedFramesList
          frames={projectFrames}
          onDelete={(id) => {
            const frame = projectFrames.find((f) => (f.id || f._id) === id);
            if (frame && frame.subsystemId && selectedProject?.id) {
              if (!confirmFrameDelete(frame)) return;
              dispatch(deleteFrame({
                projectId: selectedProject.id,
                subsystemId: frame.subsystemId,
                frameId: id,
              }));
            }
          }}
        />
      </div>
    </div>
  );
}
