import { isFailedEquationReading } from "../../utils/statusRepresentationHelper";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
} from "../../redux/slices/projectsSlice";
import { selectIsAdmin, selectRole } from "../../redux/slices/authSlice";
import {
  selectLivePackets,
  selectLatestReadings,
  selectSparklineHistory,
  selectAlerts,
  selectIsStreaming,
  resetLiveTelemetry,
  clearAlerts,
} from "../../redux/slices/telemetrySlice";
import socketService from "../../services/socketService";
import telemetryService from "../../services/telemetryService";
import { deriveParameterDefs } from "../../utils/frameDefs";
import SubsystemTabs from "./components/SubsystemTabs";
import FrameSummary from "./components/FrameSummary";
import AlertsFeed from "./components/AlertsFeed";
import ParameterCard from "./components/ParameterCard";
import SparklineGauges from "./components/SparklineGauges";
import { isTelemetryStale } from "../../utils/timeAgo";
import { Radio, AlertTriangle, Cpu, Satellite } from "lucide-react";

export default function LiveTelemetryPage() {
  const navigate = useNavigate();
  const selectedProject = useSelector(selectSelectedProject);
  const selectedProjectFrames = useSelector(selectSelectedProjectFrames);
  const livePackets = useSelector(selectLivePackets);
  const latestReadings = useSelector(selectLatestReadings);
  const sparklineHistory = useSelector(selectSparklineHistory);
  const reduxAlerts = useSelector(selectAlerts);
  const isStreaming = useSelector(selectIsStreaming);
  const isAdmin = useSelector(selectIsAdmin);
  const role = useSelector(selectRole);
  const isTester = role === 'tester';
  const dispatch = useDispatch();

  const customFrames = selectedProjectFrames;
  const subsystems = useMemo(() => {
    const list = Array.isArray(selectedProject?.subsystems) ? selectedProject.subsystems : [];
    return Array.from(new Set(list.filter(Boolean)));
  }, [selectedProject?.subsystems]);

  const [activeSubsystem, setActiveSubsystem] = useState("");

  useEffect(() => {
    if (subsystems.length > 0 && !subsystems.includes(activeSubsystem)) {
      setActiveSubsystem(subsystems[0]);
    }
  }, [subsystems, activeSubsystem]);

  const availableFrames = useMemo(
    () =>
      customFrames
        .filter((frame) => !activeSubsystem || frame.subsystem === activeSubsystem)
        .map((frame) => ({
          id: frame.id || frame._id,
          _id: frame.id || frame._id,
          projectId: frame.projectId,
          name: frame.name,
          sourceFile: "project-config",
          frameBytes: Number(frame.frameLength || frame.totalFrameLength) || null,
          parameters: frame.parameters || [],
        })),
    [activeSubsystem, customFrames]
  );

  const [activeFrameId, setActiveFrameId] = useState(availableFrames[0]?.id || "");
  const activeFrame = useMemo(
    () => availableFrames.find((f) => (f.id || f._id) === activeFrameId) || availableFrames[0] || null,
    [availableFrames, activeFrameId]
  );

  const [snapshotPacket, setSnapshotPacket] = useState(null);
  const prevProjectIdRef = useRef(null);

  // Sync active project and subsystem with room subscriptions
  useEffect(() => {
    const projectId = selectedProject?.id || selectedProject?._id;
    if (projectId) {
      if (prevProjectIdRef.current && prevProjectIdRef.current !== projectId) {
        dispatch(resetLiveTelemetry());
      }
      prevProjectIdRef.current = projectId;

      socketService.joinProject(projectId);
      if (activeSubsystem) {
        socketService.joinSubsystem(activeSubsystem, projectId);
      }
      return () => {
        if (activeSubsystem) {
          socketService.leaveSubsystem(activeSubsystem, projectId);
        }
        socketService.leaveProject(projectId);
      };
    }
  }, [selectedProject?.id, selectedProject?._id, activeSubsystem, dispatch]);

  const prevSubsystemRef = useRef(activeSubsystem);

  // Reset frame selection ONLY when subsystem actually changes or selected frame no longer exists
  useEffect(() => {
    const subsystemChanged = prevSubsystemRef.current !== activeSubsystem;
    prevSubsystemRef.current = activeSubsystem;

    if (availableFrames.length > 0) {
      const currentExists = availableFrames.some((f) => (f.id || f._id) === activeFrameId);
      if (subsystemChanged || !currentExists) {
        setActiveFrameId(availableFrames[0].id || availableFrames[0]._id);
      }
    } else {
      setActiveFrameId("");
    }
  }, [activeSubsystem, availableFrames, activeFrameId]);

  // Initial fetch of latest reading snapshot from database
  useEffect(() => {
    if (!selectedProject?.id) return;

    let isMounted = true;
    setSnapshotPacket(null);

    telemetryService
      .getCurrentTelemetry({
        projectId: selectedProject.id,
        frameId: activeFrame?.id || activeFrame?._id,
      })
      .then((res) => {
        if (isMounted && res) {
          const frames = res.frames || res.data?.frames || (Array.isArray(res) ? res : []);
          let matching = null;
          if (activeFrame?.id || activeFrame?._id) {
            const targetId = String(activeFrame.id || activeFrame._id);
            const targetName = activeFrame.name?.toLowerCase();
            matching = frames.find(
              (f) => String(f.frame || f._id) === targetId || (f.frameName && f.frameName.toLowerCase() === targetName)
            );
          } else if (frames.length > 0) {
            matching = frames[0];
          }
          if (matching) {
            const values = {};
            if (Array.isArray(matching.readings)) {
              matching.readings.forEach((r) => {
                const k = r.parameterName || r.parameter;
                if (k) {
                  values[k] = isFailedEquationReading(r) ? null : (r.engineeringValue ?? r.rawValue);
                }
              });
            }
            setSnapshotPacket({
              ...matching,
              values: { ...values, ...(matching.values || {}) },
            });
          } else {
            setSnapshotPacket(null);
          }
        }
      })
      .catch(() => {
        // Silently handle if no records exist yet
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProject?.id, activeFrame?.id, activeFrame?._id]);

  // Extract latest packet for active frame / subsystem
  const currentPacket = useMemo(() => {
    const live = livePackets.find(
      (p) =>
        (!activeSubsystem || p.subsystemName === activeSubsystem || p.subsystemCode === activeSubsystem) &&
        (!activeFrame?.id || p.frame === activeFrame.id || p.frameId === activeFrame.id || String(p.frame || p.frameId) === String(activeFrame.id || activeFrame._id))
    );
    return live || snapshotPacket || null;
  }, [livePackets, snapshotPacket, activeSubsystem, activeFrame?.id, activeFrame?._id]);

  // Derive parameters
  const params = activeFrame?.parameters?.length
    ? deriveParameterDefs(activeFrame.parameters)
    : [];

  const getSnapshotReading = (paramDef) => {
    if (!snapshotPacket || !Array.isArray(snapshotPacket.readings)) return null;
    const pIdStr = paramDef.parameterId ? String(paramDef.parameterId) : null;
    const pName = paramDef.name || paramDef.id;

    if (pIdStr) {
      const byId = snapshotPacket.readings.find((r) => r.parameterId && String(r.parameterId) === pIdStr);
      if (byId) return byId;
      // Fallback to name only for readings that have no ID at all
      return (
        snapshotPacket.readings.find(
          (r) => !r.parameterId && (r.parameterName === pName || r.parameter === pName)
        ) || null
      );
    }

    return (
      snapshotPacket.readings.find((r) => r.parameterName === pName || r.parameter === pName) || null
    );
  };

  if (!selectedProject) {
    return (
      <div className="egse-panel p-4 text-center my-4">
        <div className="py-4 d-flex flex-column align-items-center justify-content-center">
          <div
            className="p-3 rounded-circle mb-3 d-flex align-items-center justify-content-center"
            style={{
              background: "rgba(6, 182, 212, 0.12)",
              color: "var(--egse-raw, #06b6d4)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
            }}
          >
            <Satellite size={32} />
          </div>
          <h2 className="h5 fw-bold mb-2">No Mission Project Selected</h2>
          <p className="text-muted small mb-4" style={{ maxWidth: "480px" }}>
            Real-time telemetry streaming requires an active satellite mission context. Please select a project on the Mission Dashboard or use the project switcher in the header to monitor live telemetry.
          </p>
          <Link to="/dashboard" className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2">
            Return to Mission Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentPacketTimestamp =
    currentPacket?.frameTimestamp ||
    currentPacket?.timestamp ||
    currentPacket?.receivedAt ||
    Object.values(latestReadings)[0]?.timestamp ||
    null;
  const hasReadings = Boolean(currentPacket || Object.keys(latestReadings).length > 0);
  const isDataStale = currentPacketTimestamp ? isTelemetryStale(currentPacketTimestamp) : true;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="egse-heading h4 mb-0">
              {selectedProject?.name || "Active Mission"}
            </h1>
            {(() => {
              if (!isStreaming) {
                return (
                  <span
                    className="badge d-inline-flex align-items-center gap-1 bg-dark text-muted border border-secondary"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <Radio size={12} />
                    STANDBY
                  </span>
                );
              }
              if (!hasReadings) {
                return (
                  <span
                    className="badge d-inline-flex align-items-center gap-1 bg-info bg-opacity-20 text-info border border-info"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <Radio size={12} className="pulse-anim" />
                    STREAM CONNECTED (AWAITING PACKETS)
                  </span>
                );
              }
              if (isDataStale) {
                return (
                  <span
                    className="badge d-inline-flex align-items-center gap-1 bg-warning bg-opacity-20 text-warning border border-warning"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <Radio size={12} />
                    STREAM ACTIVE (STALE DATA)
                  </span>
                );
              }
              return (
                <span
                  className="badge d-inline-flex align-items-center gap-1 bg-success bg-opacity-20 text-success border border-success"
                  style={{ fontSize: "0.72rem" }}
                >
                  <Radio size={12} className="pulse-anim" />
                  LIVE STREAM ACTIVE
                </span>
              );
            })()}
          </div>
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            Real-time Telemetry Demultiplexing & Engineering Value Stream
          </p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <SubsystemTabs subsystems={subsystems} active={activeSubsystem} onChange={setActiveSubsystem} />
          {availableFrames.length > 0 && (
            <select
              className="form-select form-select-sm egse-field"
              style={{ width: "auto" }}
              value={activeFrameId}
              onChange={(e) => setActiveFrameId(e.target.value)}
            >
              {availableFrames.map((f, fIdx) => (
                <option key={f.id || f._id} value={f.id || f._id}>
                  Frame: {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Frame Summary Ribbon */}
      <div className="mb-3">
        <FrameSummary
          frame={activeFrame}
          packet={currentPacket}
          subsystem={activeSubsystem}
        />
      </div>

      {/* Sparkline Gauges */}
      {params.length > 0 && (
        <div className="mb-3">
          <SparklineGauges
            params={params}
            history={sparklineHistory}
          />
        </div>
      )}

      {/* Parameter Cards Grid */}
      <div className="row g-3 mb-3">
        <div className="col-lg-8">
          <div className="egse-panel p-3">
            <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2" style={{ borderColor: "var(--egse-border-soft)" }}>
              <div className="d-flex align-items-center gap-2">
                <Cpu size={16} className="text-info" />
                <h2 className="egse-heading h6 mb-0">
                  Telemetry Channel Readings ({params.length})
                </h2>
              </div>
              <span className="small text-muted" style={{ fontSize: "0.75rem" }}>
                Auto-updated via WebSocket
              </span>
            </div>

            {params.length > 0 ? (
              <div className="row g-2">
                {params.map((p, pIdx) => {
                  const liveReading = (p.name && latestReadings[p.name]) || (p.id && latestReadings[p.id]);
                  const hasLiveReading = liveReading !== undefined && liveReading !== null;
                  const snapshotReading = !hasLiveReading ? getSnapshotReading(p) : null;

                  let cardValue = null;
                  let cardStatus = "raw";
                  let cardTimestamp = null;

                  if (hasLiveReading) {
                    // Preserve an explicit null live value; do not fall back to an old snapshot value
                    cardValue = liveReading.value;
                    const lim = String(liveReading.limitStatus || "").toLowerCase();
                    if (lim === "normal") cardStatus = "nominal";
                    else if (lim === "critical" || lim === "alarm") cardStatus = "alarm";
                    else if (lim === "warning") cardStatus = "warning";
                    else if (lim === "invalid") cardStatus = "invalid";
                    else if (lim === "raw") cardStatus = "raw";
                    else cardStatus = lim || "raw";
                    cardTimestamp = liveReading.timestamp || currentPacket?.frameTimestamp || currentPacket?.timestamp || currentPacket?.receivedAt;
                  } else if (snapshotReading) {
                    // Display snapshot status before the first live packet
                    if (isFailedEquationReading(snapshotReading)) {
                      cardValue = null;
                      cardStatus = "invalid";
                    } else {
                      cardValue = snapshotReading.engineeringValue ?? snapshotReading.rawValue ?? null;
                      const lim = String(snapshotReading.limitStatus ?? snapshotReading.status ?? "").toLowerCase();
                      if (lim === "normal") cardStatus = "nominal";
                      else if (lim === "critical" || lim === "alarm") cardStatus = "alarm";
                      else if (lim === "warning") cardStatus = "warning";
                      else if (lim === "invalid") cardStatus = "invalid";
                      else if (lim === "raw") cardStatus = "raw";
                      else cardStatus = lim || "raw";
                    }
                    cardTimestamp = snapshotReading.timestamp || snapshotReading.frameTimestamp || snapshotPacket?.frameTimestamp || snapshotPacket?.timestamp || snapshotPacket?.receivedAt;
                  } else if (currentPacket?.values && (p.name in currentPacket.values || p.id in currentPacket.values)) {
                    cardValue = currentPacket.values[p.name] ?? currentPacket.values[p.id] ?? null;
                    cardStatus = "raw";
                    cardTimestamp = currentPacket.frameTimestamp || currentPacket.timestamp || currentPacket.receivedAt;
                  }

                  return (
                    <div className="col-sm-6 col-md-4" key={p.id || p._id || p.name || `param-${pIdx}`}>
                      <ParameterCard
                        def={p}
                        reading={{
                          value: cardValue,
                          status: cardStatus,
                          timestamp: cardTimestamp,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-5 text-muted small">
                No telemetry parameters configured for this frame.
                {availableFrames.length === 0 && !isTester && (
                  <div className="mt-2">
                    <button
                      className="btn btn-sm btn-egse-outline"
                      onClick={() => navigate(`/project/${encodeURIComponent(selectedProject.id)}/configuration`)}
                    >
                      Import or Define Configuration
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Alarms & Notifications Feed */}
        <div className="col-lg-4">
          <div className="egse-panel p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2" style={{ borderColor: "var(--egse-border-soft)" }}>
              <div className="d-flex align-items-center gap-2">
                <AlertTriangle size={16} className={reduxAlerts.some((a) => !a.resolved) ? "text-warning" : "text-muted"} />
                <h2 className="egse-heading h6 mb-0">Alerts & Status Log</h2>
              </div>
              <span
                className={`badge small ${
                  reduxAlerts.filter((a) => !a.resolved).length > 0
                    ? "bg-danger bg-opacity-20 text-danger border border-danger"
                    : "bg-success bg-opacity-20 text-success border border-success"
                }`}
              >
                {reduxAlerts.filter((a) => !a.resolved).length > 0
                  ? `${reduxAlerts.filter((a) => !a.resolved).length} ACTIVE`
                  : "NOMINAL"}
              </span>
            </div>

            <div className="flex-grow-1 overflow-auto" style={{ maxHeight: "450px" }}>
              <AlertsFeed alerts={reduxAlerts} onClear={() => dispatch(clearAlerts())} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
