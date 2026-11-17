import { useEffect, useMemo, useState } from "react";
import { validateSchema } from "../../utils/configValidation";
import { useDispatch, useSelector } from "react-redux";
import CrcConfigSection from "../../components/CrcConfigSection";
import TimestampConfigSection from "../../components/TimestampConfigSection";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
  createSubsystem,
  updateFrame,
  deleteFrame,
  fetchProjectById,
} from "../../redux/slices/projectsSlice";
import HierarchyTree from "./components/HierarchyTree";
import ParameterConfigStudioTable from "./components/ParameterConfigStudioTable";
import UploadConfigWizardModal from "./components/UploadConfigWizardModal";
import VersionHistoryDrawer from "./components/VersionHistoryDrawer";
import { useNavigate } from "react-router-dom";
import projectService from "../../services/projectService";
import configService from "../../services/configService";
import { buildClientFramePatchBody, buildInitialTimestamp } from "./framePayloadHelper";
import { confirmFrameDelete, confirmSubsystemDelete } from "../../utils/deleteConfirmation";
import {
  ChevronDown,
  Settings,
  Boxes,
  Satellite,
  Layers,
  FileCode,
  Cpu,
  FileText,
  Pencil,
  Plus,
  Network,
  Download,
  History,
  Upload,
  CheckCircle2,
} from "lucide-react";
import "./configStudio.css";

function readConfigDraft(key) {
  if (!key) return null;
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function buildProjectTree(project, projectFrames) {
  if (!project) return [];
  const subs = Array.isArray(project.subsystems) ? project.subsystems : [];
  return [{
    id: project.id || project._id,
    label: project.name,
    icon: <Satellite />,
    version: project.version,
    children: subs.map((subsystem) => {
      const subName = (typeof subsystem === "object" ? subsystem?.name : subsystem) || "";
      const subObj = project.rawSubsystems?.find(
        (s) => s.name === subName || s.subsystemCode === subName || (s._id || s.id) === subName ||
          (typeof subsystem === "object" && (s.name === subsystem.name || s._id === subsystem._id))
      );
      const subId = subObj?._id || subObj?.id || (typeof subsystem === "object" ? subsystem?._id || subsystem?.id : subsystem);
      const frames = projectFrames.filter((frame) => {
        const frameSubId = typeof frame.subsystemId === "object" ? frame.subsystemId?._id : frame.subsystemId;
        return frameSubId === subId || frame.subsystem === subName;
      });

      return {
        id: `subsystem:${subName}`,
        label: subName,
        icon: <Layers />,
        addedInVersion: subObj?.addedInVersion,
        children: frames.map((frame) => ({
          id: frame._id || frame.id,
          label: `${frame.name}${frame.frameLength ? ` (${frame.frameLength} Bytes)` : ""}`,
          icon: <FileCode color="#fff" />,
          leaf: true,
          addedInVersion: frame.addedInVersion,
        })),
      };
    }),
  }];
}

export default function ConfigStudioPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const selectedProject = useSelector(selectSelectedProject);
  const selectedProjectFrames = useSelector(selectSelectedProjectFrames);
  const [selectedNode, setSelectedNode] = useState(null);
  const [schemaRows, setSchemaRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [notice, setNoticeState] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadWizardOpen, setIsUploadWizardOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("parameters");
  const [showStructure, setShowStructure] = useState(false);
  const [frameDraft, setFrameDraft] = useState({
    name: "",
    frameLength: "",
    payloadBaseOffset: 0,
    dataRepresentation: "BYTE",
    bitNumbering: "LSB-0",
    trailerLength: 0,
    hasCrc: true,
    timestamp: null,
    crc: {
      algorithm: "none",
      enabled: false,
      width: 16,
      polynomial: "",
      init: "",
      refIn: false,
      refOut: false,
      xorOut: "",
      endianness: "BE",
    },
  });
  const [notes, setNotes] = useState("");
  const [hydratedDraftKey, setHydratedDraftKey] = useState("");
  const [isCrcChanged, setIsCrcChanged] = useState(false);


  // Layout enhancements
  const [isFramesExpanded, setIsFramesExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const setNotice = (val, type = "nominal") => {
    if (!val) {
      setNoticeState(null);
    } else if (typeof val === "string") {
      const isAlarm = /failed|error|issue|problem|invalid/i.test(val);
      setNoticeState({ type: isAlarm ? "alarm" : type, text: val });
    } else {
      setNoticeState(val);
    }
  };

  const tree = useMemo(
    () => buildProjectTree(selectedProject, selectedProjectFrames),
    [selectedProject, selectedProjectFrames]
  );

  const selectedFrame = useMemo(
    () => selectedProjectFrames.find((frame) => frame.id === selectedNode?.id),
    [selectedProjectFrames, selectedNode]
  );
  const configDraftKey = selectedProject?.id && selectedFrame?.id
    ? `cs-draft:${selectedProject.id}:${selectedFrame.id}`
    : "";

  // Ensure the latest configuration hierarchy is fetched for the selected project
  useEffect(() => {
    if (selectedProject?.id) {
      dispatch(fetchProjectById(selectedProject.id));
    }
  }, [selectedProject?.id, dispatch]);

  useEffect(() => {
    if (!selectedFrame) {
      setSchemaRows([]);
      setValidation(null);
      setHydratedDraftKey("");
      return;
    }

    const savedDraft = readConfigDraft(configDraftKey);
    const serverParams = Array.isArray(selectedFrame.parameters) ? selectedFrame.parameters : [];
    const hasDraftRows = Array.isArray(savedDraft?.schemaRows) && savedDraft.schemaRows.length > 0;

    // If localStorage has an empty draft but server has actual parameters, purge stale draft
    if (savedDraft && (!savedDraft.schemaRows || savedDraft.schemaRows.length === 0) && serverParams.length > 0) {
      try { localStorage.removeItem(configDraftKey); } catch (_) {}
    }

    const baseRows = hasDraftRows ? savedDraft.schemaRows : serverParams;
    const effectiveRows = baseRows.map((row) => {
      let sr = row.statusRepresentation;
      if (typeof sr === "string") {
        const tr = sr.trim();
        if (tr.startsWith("[") || tr.startsWith("{")) {
          try { sr = JSON.parse(tr); } catch (_) { sr = []; }
        } else {
          sr = [];
        }
      }
      if (sr && !Array.isArray(sr) && typeof sr === "object") {
        sr = [sr];
      }
      if (Array.isArray(sr)) {
        sr = sr
          .map((item) => {
            if (typeof item === "string") {
              const tr = item.trim();
              if (tr.startsWith("{")) {
                try { return JSON.parse(tr); } catch (_) { return null; }
              }
              return null;
            }
            return item;
          })
          .filter((item) => item && typeof item === "object");
      } else {
        sr = [];
      }
      return { ...row, statusRepresentation: sr };
    });
    setSchemaRows(effectiveRows);

    const defaultCrc = selectedFrame.crc || {
      algorithm: "none",
      enabled: false,
      width: 16,
      polynomial: "",
      init: "",
      refIn: false,
      refOut: false,
      xorOut: "",
      endianness: "BE",
    };
    const defaultHasCrc = selectedFrame.hasCrc !== false;
    const defaultTimestamp = buildInitialTimestamp(selectedFrame);

    if (savedDraft?.frameDraft && (savedDraft.frameDraft.name || savedDraft.frameDraft.frameLength)) {
      setFrameDraft({
        crc: defaultCrc,
        hasCrc: defaultHasCrc,
        timestamp: defaultTimestamp,
        ...savedDraft.frameDraft,
      });
    } else {
      setFrameDraft({
        name: selectedFrame.name || "",
        frameLength: selectedFrame.frameLength || selectedFrame.totalFrameLength || "",
        payloadBaseOffset: selectedFrame.payloadBaseOffset || 0,
        dataRepresentation: selectedFrame.dataRepresentation || "BYTE",
        bitNumbering: selectedFrame.bitNumbering || "LSB-0",
        trailerLength: selectedFrame.trailerLength || 0,
        searchHeader: selectedFrame.searchHeader || selectedFrame.header?.headerPattern || "",
        protocol: selectedFrame.protocol || selectedProject?.protocol || "Generic",
        crc: defaultCrc,
        hasCrc: defaultHasCrc,
        timestamp: defaultTimestamp,
      });
    }
    if (savedDraft?.activeTab) setActiveTab(savedDraft.activeTab);
    setHydratedDraftKey(configDraftKey);
    setValidation(null);
    setIsCrcChanged(false);
  }, [
    configDraftKey,
    selectedFrame?.parameters,
    selectedFrame?.name,
    selectedFrame?.frameLength,
    selectedFrame?.totalFrameLength,
    selectedFrame?.payloadBaseOffset,
    selectedFrame?.crc,
    selectedFrame?.hasCrc,
    selectedFrame?.timestamp,
  ]);

  useEffect(() => {
    if (!configDraftKey || hydratedDraftKey !== configDraftKey) return;
    try {
      localStorage.setItem(configDraftKey, JSON.stringify({ schemaRows, frameDraft, activeTab }));
    } catch { /* Drafts remain usable when browser storage is unavailable. */ }
  }, [configDraftKey, hydratedDraftKey, schemaRows, frameDraft, activeTab]);

  // Notes are kept in this browser only (there is no notes endpoint yet).
  const notesKey = selectedFrame?.id ? `cs-notes:${selectedProject?.id}:${selectedFrame.id}` : null;
  useEffect(() => {
    if (!notesKey) { setNotes(""); return; }
    try { setNotes(localStorage.getItem(notesKey) || ""); } catch { setNotes(""); }
  }, [notesKey]);
  const saveNotes = (value) => {
    setNotes(value);
    try { if (notesKey) localStorage.setItem(notesKey, value); } catch { /* storage unavailable */ }
  };

  // Open on the first frame or keep selection valid across project reloads
  useEffect(() => {
    if (selectedProjectFrames.length > 0) {
      const selectedFrameStillExists = selectedProjectFrames.some((frame) => frame.id === selectedNode?.id);
      if (selectedFrameStillExists) return;

      let preferredId = null;
      try { preferredId = localStorage.getItem(`cs-selection:${selectedProject?.id}`); } catch { /* storage unavailable */ }
      const f = selectedProjectFrames.find((frame) => frame.id === preferredId) || selectedProjectFrames[0];
      setSelectedNode({ id: f.id, label: f.name, leaf: true });
    }
  }, [selectedProject?.id, selectedProjectFrames, selectedNode]);

  useEffect(() => {
    if (!selectedProject?.id || !selectedNode?.id) return;
    try { localStorage.setItem(`cs-selection:${selectedProject.id}`, selectedNode.id); } catch { /* storage unavailable */ }
  }, [selectedProject?.id, selectedNode?.id]);

  const subsystemNames = useMemo(
    () => (selectedProject?.subsystems || []).map((s) => (typeof s === "object" ? s?.name : s)).filter(Boolean),
    [selectedProject]
  );
  const currentSubsystem = selectedFrame?.subsystem || subsystemNames[0] || "";
  const framesOfSubsystem = useMemo(
    () => selectedProjectFrames.filter((f) => !currentSubsystem || f.subsystem === currentSubsystem),
    [selectedProjectFrames, currentSubsystem]
  );

  const pickSubsystem = (name) => {
    const first = selectedProjectFrames.find((f) => f.subsystem === name);
    setSelectedNode(first ? { id: first.id, label: first.name, leaf: true } : null);
    setNotice("");
  };
  const pickFrame = (id) => {
    const f = selectedProjectFrames.find((x) => x.id === id);
    if (f) { setSelectedNode({ id: f.id, label: f.name, leaf: true }); setNotice(""); }
  };

  const rawSearchHeader = (selectedFrame?.searchHeader || selectedFrame?.header?.headerPattern || selectedFrame?.headerPattern || "").trim();
  const headerBytes = rawSearchHeader.includes(" ")
    ? rawSearchHeader.split(/\s+/).filter(Boolean)
    : (rawSearchHeader.match(/.{1,2}/g) || []);
  const frameIdLabel = selectedFrame?.frameId ?? selectedFrame?.frameCode ?? `0x${(selectedProjectFrames.findIndex((f) => f.id === selectedFrame?.id) + 1).toString(16).toUpperCase().padStart(2, "0")}`;

  const handleSelect = (node) => {
    setSelectedNode(node);
    setNotice("");
  };

  const handleAddChild = async (parentId, label) => {
    if (!selectedProject?.id) return;
    if (parentId === selectedProject.id) {
      const clean = (label || '').trim();
      if (!clean) return;
      let subName = clean;
      let hexCode = "";
      const match = clean.match(/^(.*?)\s*\(([0-9A-Fa-f]{4})\)$/);
      if (match) {
        subName = match[1].trim();
        hexCode = match[2].toUpperCase();
      } else {
        const inputCode = window.prompt(`Enter 4-character hex subsystem code for "${clean}":`, "0A01");
        if (!inputCode) return;
        hexCode = inputCode.trim().toUpperCase();
      }
      if (!/^[0-9A-F]{4}$/.test(hexCode)) {
        setNotice("Subsystem code must be 4 hex characters.");
        return;
      }
      try {
        await dispatch(createSubsystem({
          projectId: selectedProject.id,
          data: { name: subName, subsystemCode: hexCode, protocol: selectedProject.protocol || 'Generic' },
        })).unwrap();
        try {
        await dispatch(fetchProjectById({ projectId: selectedProject.id, force: true })).unwrap();
      } catch (e) {
        if (!e?.message?.includes('Aborted due to condition')) throw e;
      }
        setNotice(`Subsystem "${subName}" (${hexCode}) was added to ${selectedProject.name}.`);
      } catch (err) {
        setNotice(`Failed to add subsystem: ${err.response?.data?.message || err.message || 'Server error'}`);
      }
      return;
    }

    const subsystem = parentId.startsWith("subsystem:") ? parentId.slice("subsystem:".length) : null;
    if (subsystem) {
      navigate(`/project/${encodeURIComponent(selectedProject.id)}/add-frame`);
    }
  };

  const handleDeleteNode = async (id) => {
    if (id.startsWith("subsystem:")) {
      const subName = id.slice("subsystem:".length);
      const subObj = selectedProject?.rawSubsystems?.find(
        (s) => s.name === subName || s.subsystemCode === subName || (s._id || s.id) === subName
      );
      const subId = subObj?._id || subObj?.id;
      if (subId && selectedProject?.id) {
        const subFrames = selectedProjectFrames.filter((f) => f.subsystemId === subId);
        if (!confirmSubsystemDelete(subObj?.name || subName, subFrames)) return;
        try {
          await projectService.deleteSubsystem(selectedProject.id, subId);
          try {
        await dispatch(fetchProjectById({ projectId: selectedProject.id, force: true })).unwrap();
      } catch (e) {
        if (!e?.message?.includes('Aborted due to condition')) throw e;
      }
          setSelectedNode(null);
          setNotice(`Subsystem "${subName}" was deleted successfully.`);
        } catch (err) {
          setNotice(`Failed to delete subsystem: ${err.response?.data?.message || err.message || 'Server error'}`);
        }
      }
      return;
    }
    const frame = selectedProjectFrames.find((item) => item.id === id);
    if (frame && frame.subsystemId && selectedProject?.id) {
      if (!confirmFrameDelete(frame)) return;
      try {
        await dispatch(deleteFrame({
          projectId: selectedProject.id,
          subsystemId: frame.subsystemId,
          frameId: id,
        })).unwrap();
        try {
        await dispatch(fetchProjectById({ projectId: selectedProject.id, force: true })).unwrap();
      } catch (e) {
        if (!e?.message?.includes('Aborted due to condition')) throw e;
      }
        setSelectedNode(null);
        setNotice(`Frame "${frame.name}" was deleted from ${selectedProject.name}.`);
      } catch (err) {
        setNotice(`Failed to delete frame: ${err.response?.data?.message || err.message || 'Server error'}`);
      }
    }
  };

  const currentDataRepresentation = frameDraft.dataRepresentation || selectedFrame?.dataRepresentation || "BYTE";
  // The frame as currently edited, so parameters are checked against its CRC bytes and length.
  const editedFrame = selectedFrame ? {
    ...selectedFrame,
    totalFrameLength: Number(frameDraft.frameLength) || selectedFrame.totalFrameLength,
    payloadBaseOffset: frameDraft.payloadBaseOffset ?? selectedFrame.payloadBaseOffset,
    hasCrc: frameDraft.hasCrc ?? selectedFrame.hasCrc,
    crc: frameDraft.crc || selectedFrame.crc,
  } : null;
  const validationOptions = {
    dataRepresentation: currentDataRepresentation,
    frame: editedFrame,
    storedParams: selectedFrame?.parameters || [],
  };
  const handleValidate = () => setValidation(validateSchema(schemaRows, validationOptions));

  const handleSaveFrameConfig = async () => {
    if (!selectedFrame || !selectedFrame.subsystemId || !selectedProject?.id) {
      setNotice("Select a frame first.");
      return;
    }

    const result = validateSchema(schemaRows, validationOptions);
    setValidation(result);
    if (!result.valid) return;

    setIsSaving(true);
    try {
      setNotice({ type: "pending", text: "Saving configuration to server..." });
      // 1. Update frame metadata without parameters (server updateFrameSchema does not allow parameters)
      const framePatchData = buildClientFramePatchBody({ frameDraft, selectedFrame, isCrcChanged });
      const patchResult = await dispatch(updateFrame({
        projectId: selectedProject.id,
        subsystemId: selectedFrame.subsystemId,
        frameId: selectedFrame.id,
        data: framePatchData,
      })).unwrap();

      // 2. Persist parameters through configuration manual endpoint
      const subName = selectedFrame.subsystem || "Default";
      const subObj = selectedProject.rawSubsystems?.find(
        (s) => s._id === selectedFrame.subsystemId || s.id === selectedFrame.subsystemId || s.name === subName
      );
      const subCode = subObj?.subsystemCode || selectedFrame.subsystemCode || "";

      const sanitizedParameters = schemaRows.map((row) => {
        const sr = row.statusRanges || row.limits?.statusRanges;
        let cleanSr = null;
        if (sr && typeof sr === "object") {
          const cleanBound = (rng) => {
            if (!rng || typeof rng !== "object") return null;
            const hasMin = rng.min !== "" && rng.min !== null && rng.min !== undefined && !isNaN(Number(rng.min));
            const hasMax = rng.max !== "" && rng.max !== null && rng.max !== undefined && !isNaN(Number(rng.max));
            if (!hasMin && !hasMax) return null;
            return {
              min: hasMin ? Number(rng.min) : null,
              max: hasMax ? Number(rng.max) : null,
            };
          };
          const normal = cleanBound(sr.normal);
          const critical = cleanBound(sr.critical);
          const warning = cleanBound(sr.warning);
          if (normal || critical || warning) {
            cleanSr = { normal, critical, warning };
          }
        }

        const effectiveLimits = {
          ...(row.limits || {}),
          statusRanges: cleanSr,
          alarmLow: row.alarmLow !== "" && row.alarmLow !== null && row.alarmLow !== undefined ? Number(row.alarmLow) : (row.limits?.alarmLow ?? null),
          alarmHigh: row.alarmHigh !== "" && row.alarmHigh !== null && row.alarmHigh !== undefined ? Number(row.alarmHigh) : (row.limits?.alarmHigh ?? null),
          warningLow: row.warnLow !== "" && row.warnLow !== null && row.warnLow !== undefined ? Number(row.warnLow) : (row.warningLow !== "" && row.warningLow !== null && row.warningLow !== undefined ? Number(row.warningLow) : (row.limits?.warningLow ?? null)),
          warningHigh: row.warnHigh !== "" && row.warnHigh !== null && row.warnHigh !== undefined ? Number(row.warnHigh) : (row.warningHigh !== "" && row.warningHigh !== null && row.warningHigh !== undefined ? Number(row.warningHigh) : (row.limits?.warningHigh ?? null)),
        };

        const toNumOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

        const isBitMode = String(frameDraft.dataRepresentation || selectedFrame?.dataRepresentation || "BYTE").toUpperCase() === "BIT";
        const bitOffset = row.bitOffset !== "" && row.bitOffset !== null && row.bitOffset !== undefined ? Number(row.bitOffset) : 0;
        const bitLength = row.bitLength !== "" && row.bitLength !== null && row.bitLength !== undefined ? Number(row.bitLength) : 8;
        const derivedByteOffset = Math.floor(bitOffset / 8);
        const derivedLength = Math.ceil(((bitOffset % 8) + bitLength) / 8);

        return {
          ...row,
          ...(isBitMode ? {
            bitOffset,
            bitLength,
            byteOffset: derivedByteOffset,
            length: derivedLength,
          } : {}),
          statusRanges: cleanSr,
          limits: effectiveLimits,
          enabled: row.enabled !== false,
          minValue: toNumOrNull(row.minValue),
          maxValue: toNumOrNull(row.maxValue),
          statusRepresentation: (() => {
            let sr = row.statusRepresentation;
            if (typeof sr === "string") {
              const tr = sr.trim();
              if (tr.startsWith("[") || tr.startsWith("{")) {
                try { sr = JSON.parse(tr); } catch (_) { sr = []; }
              } else {
                sr = [];
              }
            }
            if (sr && !Array.isArray(sr) && typeof sr === "object") {
              sr = [sr];
            }
            if (!Array.isArray(sr)) return [];
            return sr
              .map((item) => {
                if (typeof item === "string") {
                  const tr = item.trim();
                  if (tr.startsWith("{")) {
                    try { return JSON.parse(tr); } catch (_) { return null; }
                  }
                  return null;
                }
                return item;
              })
              .filter((item) => item && typeof item === "object")
              .map((item) => ({
                rawValue: item.rawValue !== undefined && item.rawValue !== null ? String(item.rawValue).trim() : "",
                status: item.status !== undefined && item.status !== null ? String(item.status).trim() : "",
                description: item.description !== undefined && item.description !== null ? String(item.description).trim() : "",
              }))
              .filter((item) => item.rawValue !== "" && item.status !== "");
          })(),
        };
      });

      const clientPatch = buildClientFramePatchBody({ frameDraft, selectedFrame, isCrcChanged });

      // The frame update's version (if it made one): the parameter save joins it, so one
      // Save Frame click results in one configuration version.
      // (the API client already unwraps the response body's `data`, so this is the frame)
      const amendVersion = patchResult?.committedVersion ?? null;
      await configService.saveConfigurationManual({
        projectId: selectedProject.id,
        ...(amendVersion ? { amendVersion } : {}),
        configurations: [{
          subsystem: { name: subName, subsystemCode: subCode },
          frame: {
            name: frameDraft.name || selectedFrame.name,
            ...(Number(frameDraft.frameLength) ? { totalFrameLength: Number(frameDraft.frameLength) } : {}),
            payloadBaseOffset: Number(frameDraft.payloadBaseOffset) || 0,
            searchHeader: frameDraft.searchHeader !== undefined ? frameDraft.searchHeader.trim() : (selectedFrame.searchHeader || undefined),
            protocol: frameDraft.protocol !== undefined ? frameDraft.protocol.trim() : (selectedFrame.protocol || undefined),
            dataRepresentation: frameDraft.dataRepresentation || selectedFrame.dataRepresentation || 'BYTE',
            bitNumbering: frameDraft.bitNumbering || selectedFrame.bitNumbering || 'LSB-0',
            trailerLength: Number(frameDraft.trailerLength) || selectedFrame.trailerLength || 0,
            hasCrc: clientPatch.hasCrc !== undefined ? clientPatch.hasCrc : (frameDraft.hasCrc !== false),
            ...(clientPatch.crc ? { crc: clientPatch.crc } : {}),
            ...(clientPatch.timestamp ? { timestamp: clientPatch.timestamp } : {}),
            // Carry the stored values of fields this form does not edit, so the
            // manual-save defaults do not overwrite them.
            ...(typeof selectedFrame.description === "string" ? { description: selectedFrame.description } : {}),
            ...(selectedFrame.delimiter ? { delimiter: selectedFrame.delimiter } : {}),
            ...(typeof selectedFrame.includeEpoch === "boolean" ? { includeEpoch: selectedFrame.includeEpoch } : {}),
            ...(typeof selectedFrame.hasTrailingDelimiter === "boolean" ? { hasTrailingDelimiter: selectedFrame.hasTrailingDelimiter } : {}),
            ...(selectedFrame.headerLength !== undefined ? { headerLength: selectedFrame.headerLength } : {}),
          },
          parameters: sanitizedParameters,
        }],
      });

      try {
        await dispatch(fetchProjectById({ projectId: selectedProject.id, force: true })).unwrap();
      } catch (e) {
        if (!e?.message?.includes('Aborted due to condition')) throw e;
      }
      try { localStorage.removeItem(configDraftKey); } catch { /* storage unavailable */ }
      setNotice(`Configuration saved for "${selectedFrame.name}".`);
    } catch (err) {
      setNotice(`Failed to save configuration: ${err.response?.data?.message || err.message || 'Server error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportConfig = async () => {
    if (!selectedProject?.id) {
      setNotice({ type: "alarm", message: "Please select an active project first." });
      return;
    }
    try {
      setNotice({ type: "nominal", message: "Exporting configuration JSON from server..." });
      const res = await configService.exportConfiguration(selectedProject.id, { download: true });
      const blob = res instanceof Blob ? res : new Blob([typeof res === "string" ? res : JSON.stringify(res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const sanitizedName = (selectedProject.name || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${sanitizedName}_config_v${selectedProject.version ?? 0}.json`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setNotice({ type: "nominal", message: `Configuration exported successfully as "${filename}".` });
    } catch (err) {
      setNotice({ type: "alarm", message: "Failed to export configuration: " + (err.response?.data?.message || err.message || "Error") });
    }
  };

  const statusText = selectedProject?.status || "Active";
  const isActive = /active/i.test(statusText);

  return (
    <div className="cs-page d-flex flex-column gap-3 pb-4">
      {/* Breadcrumbs */}
      <div className="cs-crumbs">
        <span>Configuration</span><span>›</span>
        <span>Projects</span><span>›</span>
        <span>{selectedProject?.name || "—"}</span>
        {selectedFrame?.subsystem && <><span>›</span><span>{selectedFrame.subsystem}</span></>}
        {selectedFrame && <><span>›</span><b>{selectedFrame.name}</b></>}
      </div>

      {/* Title row */}
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div className="d-flex align-items-start gap-3">
          <Settings size={30} style={{ color: "#6aa8ff", marginTop: 4 }} />
          <div>
            <h1 className="cs-title">Parameter Configuration</h1>
            <p className="cs-sub">Define parameters for the selected frame. Each parameter specifies how to interpret raw telemetry data.</p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="cs-status-box">
            <small>Configuration Status</small>
            <span><i className={`cs-dot ${isActive ? "" : "off"}`} />{statusText} · v{selectedProject?.version ?? 0}</span>
          </div>
          <button type="button" className="cs-btn outline-blue" onClick={handleValidate}>
            <CheckCircle2 size={15} /> Validate
          </button>
        </div>
      </div>

      {/* Secondary actions (kept from the previous page) */}
      <div className="d-flex gap-2 flex-wrap">
        <button type="button" className="cs-btn sm" onClick={() => setIsHistoryOpen(true)} title="View configuration version history"><History size={14} /> Version History</button>
        <button type="button" className="cs-btn sm" onClick={() => setIsUploadWizardOpen(true)} title="Upload and merge new configuration"><Upload size={14} /> Upload Config</button>
        <button type="button" className="cs-btn sm" onClick={handleExportConfig}><Download size={14} /> Export Config</button>
        <button type="button" className="cs-btn sm" onClick={() => navigate(`/project/${encodeURIComponent(selectedProject.id)}/add-frame`)}><Plus size={14} /> Add Frame</button>
        <button type="button" className="cs-btn sm" onClick={() => setShowStructure((v) => !v)}><Network size={14} /> {showStructure ? "Hide" : "Manage"} Subsystems &amp; Frames</button>
      </div>

      {notice && (() => {
        const text = typeof notice === "string" ? notice : (notice.text || notice.message || "");
        const isAlarm = typeof notice === "string" ? notice.toLowerCase().startsWith("failed") : notice.type === "alarm";
        const isPending = typeof notice === "object" && notice?.type === "pending";
        return (
          <div role="status" className={`cs-notice ${isAlarm ? "alarm egse-chip-alarm" : isPending ? "pending" : "nominal egse-chip-nominal"}`}>
            {isAlarm ? "⚠️" : isPending ? "⏳" : "✅"} {text}
          </div>
        );
      })()}

      {validation && (
        <div className={`cs-notice ${validation.valid ? "nominal" : "alarm"}`} style={{ flexDirection: "column" }}>
          <strong>
            {validation.valid ? "Configuration is valid" : `${validation.errors.length} issue(s) found`}
            {validation.warnings?.length ? ` · ${validation.warnings.length} warning(s)` : ""}
          </strong>
          {(!validation.valid || validation.warnings?.length > 0) && (
            <ul style={{ margin: ".3rem 0 0", paddingInlineStart: "1.1rem" }}>
              {validation.errors.slice(0, 8).map((e, i) => <li key={`e${i}`}>{e}</li>)}
              {(validation.warnings || []).slice(0, 8).map((w, i) => <li key={`w${i}`}>Warning: {w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Project / Subsystem / Frame selectors */}
      <div className="d-flex flex-wrap gap-3">
        <div className="cs-card cs-select-card">
          <div className="cs-select-ico"><Boxes size={18} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <label>Project</label>
            <div className="cs-static">{selectedProject?.name || "—"}</div>
          </div>
        </div>
        <div className="cs-card cs-select-card">
          <div className="cs-select-ico"><Cpu size={18} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <label>Subsystem</label>
            <select value={currentSubsystem} onChange={(e) => pickSubsystem(e.target.value)} disabled={!subsystemNames.length}>
              {subsystemNames.length === 0 && <option value="">No subsystems</option>}
              {subsystemNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <ChevronDown size={16} />
        </div>
        <div className="cs-card cs-select-card">
          <div className="cs-select-ico"><FileText size={18} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <label>Frame</label>
            <select value={selectedFrame?.id || ""} onChange={(e) => pickFrame(e.target.value)} disabled={!framesOfSubsystem.length}>
              {framesOfSubsystem.length === 0 && <option value="">No frames</option>}
              {framesOfSubsystem.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <ChevronDown size={16} />
        </div>
      </div>

      <div style={{ display: showStructure ? "block" : "none" }}>
        <HierarchyTree
          tree={tree}
          onSelect={handleSelect}
          selectedId={selectedNode?.id}
          onAddChild={handleAddChild}
          onDelete={handleDeleteNode}
        />
      </div>

      {!selectedFrame ? (
        <div className="cs-card cs-empty">
          <Settings size={34} style={{ opacity: .5 }} />
          <h2 className="h5 mt-2">No Frame Selected</h2>
          <p className="mb-0">Choose a subsystem and a frame above to inspect or edit its parameters.</p>
        </div>
      ) : (
        <>
          {/* Frame Information */}
          <div className="cs-card cs-frame-info">
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3><FileText size={16} /> Frame Information</h3>
                <div className="d-flex flex-wrap gap-4">
                  <div className="cs-kv"><small>Frame Name</small><span className="v">{selectedFrame.name}</span></div>
                  <div className="cs-kv"><small>Frame ID</small><span className="v cs-mono">{frameIdLabel}</span></div>
                  <div className="cs-kv" style={{ minWidth: 200 }}>
                    <small>Search Header</small>
                    <span className="v">
                      {headerBytes.length
                        ? headerBytes.map((b, i) => <span className="cs-hex" key={i}>{b.toUpperCase()}</span>)
                        : <span style={{ color: "var(--cs-muted)" }}>Not set</span>}
                    </span>
                  </div>
                  <div className="cs-kv"><small>Frame Length</small><span className="v">{selectedFrame.frameLength || selectedFrame.totalFrameLength ? `${selectedFrame.frameLength || selectedFrame.totalFrameLength} bytes` : "Dynamic"}</span></div>
                  <div className="cs-kv"><small>Format</small><span className="v">{selectedFrame?.protocol || selectedProject?.protocol || "Generic"}</span></div>
                </div>
              </div>
              <button type="button" className="cs-btn outline-blue" onClick={() => setActiveTab("settings")}><Pencil size={14} /> Edit Frame</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="cs-tabs">
            <button type="button" className={`cs-tab ${activeTab === "parameters" ? "active" : ""}`} onClick={() => setActiveTab("parameters")}>Parameters ({schemaRows.length})</button>
            <button type="button" className={`cs-tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>Frame Settings</button>
            <button type="button" className={`cs-tab ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>Notes</button>
          </div>

          {activeTab === "parameters" && (
            <ParameterConfigStudioTable
              key={configDraftKey}
              rows={schemaRows}
              onChange={(next) => { setSchemaRows(next); setValidation(null); }}
              onSave={handleSaveFrameConfig}
              isSaving={isSaving}
              frameName={selectedFrame.name}
              subsystemName={selectedFrame.subsystem}
              draftStorageKey={`${configDraftKey}:parameter-modal`}
              dataRepresentation={frameDraft.dataRepresentation || selectedFrame?.dataRepresentation || "BYTE"}
              frame={editedFrame}
              storedParams={selectedFrame.parameters || []}
            />
          )}

          {activeTab === "settings" && (
            <div className="cs-card" style={{ padding: "1.1rem 1.2rem" }}>
              <div className="cs-form-grid">
                <div className="c6">
                  <label className="cs-sub d-block mb-1">Frame Name</label>
                  <input className="cs-field w-100" value={frameDraft.name} onChange={(e) => setFrameDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
                <div className="c3">
                  <label className="cs-sub d-block mb-1">Frame Length (bytes)</label>
                  <input type="number" min="0" className="cs-field cs-mono w-100" value={frameDraft.frameLength} onChange={(e) => setFrameDraft((d) => ({ ...d, frameLength: e.target.value }))} />
                </div>
                <div className="c3">
                  <label className="cs-sub d-block mb-1">Payload Offset (bytes)</label>
                  <input type="number" min="0" className="cs-field cs-mono w-100" value={frameDraft.payloadBaseOffset} onChange={(e) => setFrameDraft((d) => ({ ...d, payloadBaseOffset: e.target.value }))} />
                </div>
                <div className="c6">
                  <label className="cs-sub d-block mb-1">Search Header (hex bytes)</label>
                  <input
                    className="cs-field cs-mono w-100"
                    value={frameDraft.searchHeader ?? selectedFrame.searchHeader ?? ""}
                    onChange={(e) => setFrameDraft((d) => ({ ...d, searchHeader: e.target.value }))}
                    placeholder="e.g. 1A 2B 3C 4D"
                  />
                </div>
                <div className="c6">
                  <label className="cs-sub d-block mb-1">Protocol / Format</label>
                  <input
                    className="cs-field w-100"
                    value={frameDraft.protocol ?? selectedFrame.protocol ?? ""}
                    onChange={(e) => setFrameDraft((d) => ({ ...d, protocol: e.target.value }))}
                    placeholder="e.g. Generic, Custom-Packet"
                  />
                </div>

                <div className="c4">
                  <label className="cs-sub d-block mb-1">Data Representation</label>
                  <select
                    className="cs-field w-100"
                    value={frameDraft.dataRepresentation || "BYTE"}
                    onChange={(e) => setFrameDraft((d) => ({ ...d, dataRepresentation: e.target.value }))}
                  >
                    <option value="BYTE">BYTE (Byte-addressed)</option>
                    <option value="BIT">BIT (Bit-addressed)</option>
                  </select>
                </div>
                <div className="c4">
                  <label className="cs-sub d-block mb-1">Bit Numbering</label>
                  <select
                    className="cs-field w-100"
                    value={frameDraft.bitNumbering || "LSB-0"}
                    disabled={frameDraft.dataRepresentation !== "BIT"}
                    onChange={(e) => setFrameDraft((d) => ({ ...d, bitNumbering: e.target.value }))}
                  >
                    <option value="LSB-0">LSB-0 (Little-Endian Bitstream)</option>
                    <option value="MSB-0">MSB-0 (Big-Endian Bitstream / CCSDS)</option>
                  </select>
                </div>
                <div className="c4">
                  <label className="cs-sub d-block mb-1">Trailer Length (bytes)</label>
                  <input
                    type="number"
                    min="0"
                    className="cs-field cs-mono w-100"
                    value={frameDraft.trailerLength ?? 0}
                    onChange={(e) => setFrameDraft((d) => ({ ...d, trailerLength: e.target.value }))}
                    placeholder="0"
                  />
                </div>

                <div className="c12">
                  <TimestampConfigSection
                    timestamp={frameDraft?.timestamp}
                    totalFrameLength={Number(frameDraft?.frameLength || selectedFrame?.frameLength || selectedFrame?.totalFrameLength || 0)}
                    onChange={(newTimestamp) => {
                      setFrameDraft((d) => ({
                        ...d,
                        timestamp: newTimestamp,
                      }));
                    }}
                  />
                </div>

                <div className="c12">
                  <CrcConfigSection
                    crc={frameDraft?.crc}
                    hasCrc={frameDraft?.hasCrc !== false}
                    totalFrameLength={Number(frameDraft?.frameLength || selectedFrame?.frameLength || selectedFrame?.totalFrameLength || 0)}
                    onChange={(newCrc, newHasCrc) => {
                      setIsCrcChanged(true);
                      setFrameDraft((d) => ({
                        ...d,
                        crc: newCrc,
                        hasCrc: newHasCrc,
                      }));
                    }}
                  />
                </div>


                <div className="c12 d-flex gap-2">
                  <button type="button" className="cs-btn primary" onClick={handleSaveFrameConfig} disabled={isSaving}>{isSaving ? "Saving..." : "Save Frame Configuration"}</button>
                  <button type="button" className="cs-btn" onClick={() => setSchemaRows([])} disabled={isSaving || schemaRows.length === 0}>Clear All Parameters</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notes" && (
            <div className="cs-card" style={{ padding: "1.1rem 1.2rem" }}>
              <textarea className="cs-field cs-textarea" placeholder="Notes about this frame…" value={notes} onChange={(e) => saveNotes(e.target.value)} />
              <div className="cs-sub mt-2">Saved automatically in this browser only (not sent to the server).</div>
            </div>
          )}
        </>
      )}

      {/* Modals & Drawers */}
      <UploadConfigWizardModal
        isOpen={isUploadWizardOpen}
        onClose={() => setIsUploadWizardOpen(false)}
        projectId={selectedProject?.id}
        project={selectedProject}
        onSuccess={() => {
          if (selectedProject?.id) {
            dispatch(fetchProjectById(selectedProject.id));
          }
          setNotice("Configuration updated successfully.");
        }}
      />

      <VersionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        projectId={selectedProject?.id || selectedProject?._id}
        currentVersion={selectedProject?.version ?? 0}
        onRestoreSuccess={(restoredVersion) => {
          const pid = selectedProject?.id || selectedProject?._id;
          if (pid) {
            dispatch(fetchProjectById(pid));
          }
          setNotice(`Configuration restored from v${restoredVersion} as a new live version.`);
        }}
      />
    </div>
  );
}
